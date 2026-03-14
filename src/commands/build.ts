import * as fs from "node:fs";
import * as path from "node:path";
import { getManifest, isScriptManifestModule } from "../utils/manifest.js";
import * as logger from "../utils/logger.js";
import { build as tsdownBuild, mergeConfig, InlineConfig, UserConfig } from "tsdown";
import { pathToFileURL } from "node:url";

interface BuildCommandOptions {
    bundle?: boolean;
    watch?: boolean;
    release?: boolean;
}

export async function build(options: BuildCommandOptions = {}): Promise<void> {
    const manifest = getManifest();
    const scriptModule = manifest.modules
        ?.filter(isScriptManifestModule)
        .find((module) => typeof module.entry === "string" && module.entry.length > 0);

    if (!scriptModule?.entry) {
        logger.error("No script module entry found in manifest.json.");
        process.exit(1);
    }

    const userConfig = await loadTsdownConfig(path.resolve("tsdown.config.ts"));
    const sourceEntry = getSourceEntry("src", userConfig);
    if (!sourceEntry) {
        logger.error("Source entry not found. Expected src/main.ts, src/index.ts, or tsdown.config.ts entry.");
        process.exit(1);
    }

    const outputEntry = path.resolve(scriptModule.entry);
    const outputDir = path.dirname(outputEntry);
    const isBundle = options.bundle === true;
    const isWatch = options.watch === true;
    const isRelease = options.release === true;

    const internalConfig: InlineConfig = {
        config: false,
        entry: path.relative(process.cwd(), sourceEntry),
        outDir: path.relative(process.cwd(), outputDir),
        format: "esm" as const,
        target: "es2024",
        platform: "neutral" as const,
        sourcemap: !isRelease,
        clean: !isWatch,
        tsconfig: path.relative(process.cwd(), path.resolve("tsconfig.json")),
        outExtensions: () => ({ js: ".js" }),
        deps: {
            neverBundle: /^@minecraft\/(?!math(?:\/|$)|vanilla-data(?:\/|$))/,
            alwaysBundle: "**/*",
            onlyBundle: false,
        },
        unbundle: !isRelease && !isBundle,
        watch: isWatch,
        minify: isRelease,
    };

    const finalConfig = mergeConfig(internalConfig, userConfig) as InlineConfig;

    logger.info("Bundling addon scripts with tsdown...");

    try {
        await tsdownBuild(finalConfig);

        if (isRelease) {
            await buildLocalPackageDist();
        }
    } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }

    if (!isWatch) {
        ensureBuildOutput(outputEntry);
    }

    logger.done(`Build complete: ${path.relative(process.cwd(), outputEntry)}`);
}

function ensureBuildOutput(outputEntry: string): void {
    if (!fs.existsSync(outputEntry)) {
        logger.error(`Expected build output was not found: ${outputEntry}`);
        process.exit(1);
    }
}

function getSourceEntry(directory: string, userConfig?: UserConfig): string | null {
    const mainEntry = path.resolve(directory, "main.ts");
    if (fs.existsSync(mainEntry)) {
        return mainEntry;
    }

    const indexEntry = path.resolve(directory, "index.ts");
    if (fs.existsSync(indexEntry)) {
        return indexEntry;
    }

    if (!userConfig) return null;

    const configuredEntry = resolveConfiguredEntry(userConfig.entry);
    if (!configuredEntry) {
        return null;
    }

    const resolvedEntry = path.resolve(configuredEntry);
    return fs.existsSync(resolvedEntry) ? resolvedEntry : null;
}

function resolveConfiguredEntry(entry: UserConfig["entry"]): string | null {
    if (typeof entry === "string") {
        return entry;
    }

    if (Array.isArray(entry)) {
        return typeof entry[0] === "string" ? entry[0] : null;
    }

    return null;
}

async function loadTsdownConfig(configPath: string): Promise<UserConfig> {
    if (!fs.existsSync(configPath)) {
        return {};
    }

    const source = fs.readFileSync(configPath, "utf-8");

    if (!source.includes("export default") || !source.includes("defineConfig")) {
        logger.warn("tsdown.config.ts was found but could not be parsed. Using internal build defaults.");
        return {};
    }

    try {
        const moduleUrl = pathToFileURL(configPath).href;
        const imported = (await import(moduleUrl)) as { default?: unknown };
        const resolved = imported.default;

        if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
            logger.warn("tsdown.config.ts should export a single config object. Using internal build defaults.");
            return {};
        }

        return resolved;
    } catch (error) {
        logger.warn(`Failed to import tsdown.config.ts: ${error instanceof Error ? error.message : String(error)}`);
        logger.warn("Using internal build defaults.");
        return {};
    }
}

async function buildLocalPackageDist(): Promise<void> {
    // const packageEntries = getPackageTypeScriptEntries(path.resolve("package"));
    const sourceEntry = getSourceEntry("package");
    if (!sourceEntry) {
        return;
    }

    logger.info("Building local package sources into dist/... ");

    const packageBuildConfig: InlineConfig = {
        config: false,
        entry: path.relative(process.cwd(), sourceEntry),
        outDir: path.relative(process.cwd(), path.resolve("dist")),
        format: "esm" as const,
        target: "es2024",
        platform: "neutral" as const,
        clean: true,
        tsconfig: path.relative(process.cwd(), path.resolve("tsconfig.json")),
        outExtensions: () => ({ js: ".js" }),
        dts: true,
        unbundle: false,
        deps: {
            // alwaysBundle: "**/*",
            // neverBundle: /^@minecraft\/(?!math(?:\/|$)|vanilla-data(?:\/|$))/,
            // neverBundle: "**/*",
            // onlyBundle: false,
        }
    };

    await tsdownBuild(packageBuildConfig);
}

function getPackageTypeScriptEntries(packageDirPath: string): string[] {
    if (!fs.existsSync(packageDirPath)) {
        return [];
    }

    const entries: string[] = [];
    const stack = [packageDirPath];

    while (stack.length > 0) {
        const currentDir = stack.pop();
        if (!currentDir) {
            continue;
        }

        const dirEntries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const dirEntry of dirEntries) {
            if (dirEntry.name === "node_modules" || dirEntry.name.startsWith(".")) {
                continue;
            }

            const fullPath = path.join(currentDir, dirEntry.name);
            if (dirEntry.isDirectory()) {
                stack.push(fullPath);
                continue;
            }

            if (dirEntry.isFile() && fullPath.endsWith(".ts") && !fullPath.endsWith(".d.ts")) {
                entries.push(fullPath);
            }
        }
    }

    return entries.sort();
}
