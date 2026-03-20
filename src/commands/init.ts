import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { run, parseNi } from "@antfu/ni";
import * as logger from "../utils/logger.js";
import { selectPackageManager } from "../utils/package-manager.js";
import { scaffoldProject, updateMcpackWorkflow } from "../utils/scaffold.js";

interface InitCommandOptions {
    lib?: boolean;
    workflow?: boolean;
    interactive?: boolean;
    migrate?: boolean;
}

interface MigrationBackup {
    manifest?: string;
    packageJson?: string;
    others: Record<string, string>;
}

export async function init(targetDir = process.cwd(), options: InitCommandOptions = {}): Promise<void> {
    const resolvedTargetDir = path.resolve(targetDir);

    const migrationBackup = options.migrate ? backupAndDeleteTemplateFiles(resolvedTargetDir, options) : undefined;

    await scaffoldProject({
        targetDir: resolvedTargetDir,
        lib: options.lib,
        workflow: options.workflow,
    });

    if (migrationBackup) {
        applyMigration(resolvedTargetDir, migrationBackup);
    }

    ensureTsdownConfig(resolvedTargetDir);
    updateBuildScripts(resolvedTargetDir);
    await installInitDependencies(resolvedTargetDir, options.interactive);

    logger.info("Initialization complete.");
}

function getTemplatePaths(options: InitCommandOptions): string[] {
    const paths = [
        ".gitignore",
        ".vscode/settings.json",
        ".vscode/launch.json",
        "README.md",
        "LICENSE",
        "manifest.json",
        "package.json",
        "tsconfig.json",
        "tsdown.config.ts",
        "src/main.ts",
    ];
    if (options.lib) {
        paths.push("package/main.ts");
    }
    if (options.workflow !== false) {
        paths.push(".github/workflows/mcpack.yml", ".github/workflows/webhook.yml");
        if (options.lib) {
            paths.push(".github/workflows/publish.yml", ".github/workflows/ensure-dts-export.js");
        }
    }
    return paths;
}

const OVERWRITE_ALWAYS = new Set([".vscode/launch.json", "tsconfig.json"]);

function backupAndDeleteTemplateFiles(targetDir: string, options: InitCommandOptions): MigrationBackup {
    const backup: MigrationBackup = { others: {} };
    const backupDir = path.join(targetDir, ".backup");

    for (const relPath of getTemplatePaths(options)) {
        const filePath = path.join(targetDir, relPath);
        if (!fs.existsSync(filePath)) continue;

        const content = fs.readFileSync(filePath, "utf-8");
        if (relPath === "manifest.json") backup.manifest = content;
        else if (relPath === "package.json") backup.packageJson = content;
        else if (!OVERWRITE_ALWAYS.has(relPath)) backup.others[relPath] = content;

        const backupFilePath = path.join(backupDir, relPath);
        fs.mkdirSync(path.dirname(backupFilePath), { recursive: true });
        fs.writeFileSync(backupFilePath, content, "utf-8");

        fs.unlinkSync(filePath);
        logger.log(`Backed up: ${relPath}`);
    }

    return backup;
}

function applyMigration(targetDir: string, backup: MigrationBackup): void {
    for (const [relPath, content] of Object.entries(backup.others)) {
        fs.writeFileSync(path.join(targetDir, relPath), content, "utf-8");
        logger.log(`Restored: ${relPath}`);
    }

    if (backup.manifest) {
        const manifestPath = path.join(targetDir, "manifest.json");
        if (fs.existsSync(manifestPath)) {
            type ManifestModule = { type: string; uuid: string; [k: string]: unknown };
            const oldM = JSON.parse(backup.manifest) as {
                header?: Record<string, unknown>;
                modules?: ManifestModule[];
                metadata?: Record<string, unknown> & { generated_with?: unknown };
            };
            const newM = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
                header: Record<string, unknown>;
                modules?: ManifestModule[];
                metadata?: Record<string, unknown> & { generated_with?: unknown };
            };

            const isValidUuid = (v: unknown): v is string => typeof v === "string" && v.length > 0;
            const normalizeVersion = (v: unknown): unknown => (Array.isArray(v) && v.length === 3 ? `${v[0]}.${v[1]}.${v[2]}` : v);

            if (isValidUuid(oldM.header?.uuid)) newM.header.uuid = oldM.header.uuid;
            if (oldM.header?.name) newM.header.name = oldM.header.name;
            if (oldM.header?.version) newM.header.version = normalizeVersion(oldM.header.version);
            if (oldM.metadata) {
                newM.metadata = { ...oldM.metadata, generated_with: newM.metadata?.generated_with };
            }

            for (const oldMod of oldM.modules ?? []) {
                const newMod = newM.modules?.find((m) => m.type === oldMod.type);
                if (newMod && isValidUuid(oldMod.uuid)) newMod.uuid = oldMod.uuid;
            }

            fs.writeFileSync(manifestPath, JSON.stringify(newM, null, "\t") + "\n", "utf-8");
            logger.log("Migrated manifest.json");
        }
    }

    if (backup.packageJson) {
        const pkgPath = path.join(targetDir, "package.json");
        if (fs.existsSync(pkgPath)) {
            type PkgJson = Record<string, unknown> & {
                dependencies?: Record<string, string>;
                devDependencies?: Record<string, string>;
                scripts?: Record<string, string>;
            };
            const oldP = JSON.parse(backup.packageJson) as PkgJson;
            const newP = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as PkgJson;

            if (oldP.name) newP.name = oldP.name;
            if (oldP.version) newP.version = oldP.version;
            if (oldP.packageManager) newP.packageManager = oldP.packageManager;
            newP.dependencies = { ...(oldP.dependencies ?? {}), ...(newP.dependencies ?? {}) };
            newP.devDependencies = { ...(oldP.devDependencies ?? {}), ...(newP.devDependencies ?? {}) };
            newP.scripts = { ...(oldP.scripts ?? {}), ...(newP.scripts ?? {}) };

            fs.writeFileSync(pkgPath, JSON.stringify(newP, null, 2) + "\n", "utf-8");
            logger.log("Migrated package.json");
        }
    }
}

function ensureTsdownConfig(targetDir: string): void {
    const tsdownConfigPath = path.join(targetDir, "tsdown.config.ts");

    if (!fs.existsSync(tsdownConfigPath)) {
        const initialContent = ['import { defineConfig } from "tsdown";', "", "export default defineConfig(/* */);", ""].join("\n");
        fs.writeFileSync(tsdownConfigPath, initialContent, "utf-8");
        logger.log("Created tsdown.config.ts");
        return;
    }

    const existing = fs.readFileSync(tsdownConfigPath, "utf-8");
    const updated = existing.replace(/defineConfig\({([^;]*)}\);/s, (_match, inner: string) => {
        const trimmed = inner.trim();
        return trimmed.length === 0 ? "defineConfig({ /* */ });" : `defineConfig({\n  /* ${trimmed} */\n});`;
    });

    if (updated === existing) {
        logger.warn("Could not find defineConfig(...) in tsdown.config.ts. File was left unchanged.");
        return;
    }

    fs.writeFileSync(tsdownConfigPath, updated, "utf-8");
    logger.log("Updated tsdown.config.ts");
}

function updateBuildScripts(targetDir: string): void {
    const packageJsonPath = path.join(targetDir, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
        scripts?: Record<string, string>;
    };

    packageJson.scripts ??= {};
    packageJson.scripts.build = "scriptup build --release";
    packageJson.scripts.watch = "scriptup build --watch";

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n", "utf-8");
    logger.log("Updated package.json scripts: build, watch");
}

export async function installInitDependencies(targetDir: string, interactive?: boolean): Promise<void> {
    try {
        const packages = ["@nano191225/scriptup", "tsdown", "typescript", "@bedrock-apis/env-types"];
        if (interactive) {
            const pm = await selectPackageManager(targetDir);
            updateMcpackWorkflow(targetDir, pm);
            const resolved = await parseNi(pm, [...packages, "-D"], { programmatic: true, cwd: targetDir });
            if (!resolved) throw new Error(`Could not resolve install command for ${pm}`);
            execSync([resolved.command, ...resolved.args].join(" "), { stdio: "inherit", cwd: targetDir });
        } else {
            await run(parseNi, [...packages, "-D"], { programmatic: true, cwd: targetDir });
        }
        logger.log("Installed required dev dependencies");
    } catch (error) {
        logger.error(`Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}
