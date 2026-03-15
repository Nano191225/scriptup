import * as fs from "node:fs";
import * as path from "node:path";
import * as logger from "./logger.js";

const UNKNOWN_CAUSE = "__unknown__";

// Matches static import/export … from 'specifier' or "specifier"
// Handles: import x from '…', import { x } from '…', export { x } from '…', import '…'
const STATIC_IMPORT_RE = /(?:^|;|\n)\s*(?:import|export)\s+(?:(?:\*\s+as\s+\w+|[\w${}[\],\s*]+?)\s+from\s+|)['"]([^'"]+)['"]/gm;

// Matches rolldown's __require("specifier") — CJS interop that throws at runtime in Minecraft
const CJS_REQUIRE_RE = /\b__require\(['"]([^'"]+)['"]\)/g;

function isBareSpecifier(specifier: string): boolean {
    if (specifier.startsWith(".") || specifier.startsWith("/")) {
        return false;
    }

    if (/^[a-zA-Z]:[\\/]/.test(specifier)) {
        return false;
    }

    return true;
}

function isAllowedExternal(specifier: string): boolean {
    if (!specifier.startsWith("@minecraft/")) {
        return false;
    }

    return specifier !== "@minecraft/math" && specifier !== "@minecraft/vanilla-data";
}

function normalizeSpecifier(specifier: string): string {
    if (specifier.startsWith("node:")) {
        return specifier;
    }

    if (specifier.startsWith("@")) {
        const [scope, name] = specifier.split("/");
        return scope && name ? `${scope}/${name}` : specifier;
    }

    const [name] = specifier.split("/");
    return name || specifier;
}

function parseDisallowedImports(code: string): Set<string> {
    const flagged = new Set<string>();
    let match: RegExpExecArray | null;

    STATIC_IMPORT_RE.lastIndex = 0;
    while ((match = STATIC_IMPORT_RE.exec(code)) !== null) {
        const specifier = match[1];
        if (!specifier || !isBareSpecifier(specifier) || isAllowedExternal(specifier)) {
            continue;
        }
        flagged.add(normalizeSpecifier(specifier));
    }

    CJS_REQUIRE_RE.lastIndex = 0;
    while ((match = CJS_REQUIRE_RE.exec(code)) !== null) {
        const specifier = match[1];
        if (!specifier || !isBareSpecifier(specifier) || isAllowedExternal(specifier)) {
            continue;
        }
        flagged.add(normalizeSpecifier(specifier));
    }

    return flagged;
}

function getDirectDependencyNames(projectRoot: string): string[] {
    const packageJsonPath = path.join(projectRoot, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
        return [];
    }

    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };

        const directDeps = new Set<string>([...Object.keys(packageJson.dependencies ?? {}), ...Object.keys(packageJson.devDependencies ?? {})]);

        return [...directDeps];
    } catch {
        return [];
    }
}

// Returns Map<specifier, cause> where cause is the direct-dep name or UNKNOWN_CAUSE.
function buildCauseMap(flagged: Set<string>, projectRoot: string): Map<string, string> {
    const causeMap = new Map<string, string>();
    const unresolved = new Set(flagged);
    const directDependencies = getDirectDependencyNames(projectRoot);

    for (const directDependency of directDependencies) {
        if (unresolved.size === 0) {
            break;
        }

        // If the flagged specifier IS the direct dependency itself, attribute it to itself.
        if (unresolved.has(directDependency)) {
            causeMap.set(directDependency, directDependency);
            unresolved.delete(directDependency);
        }

        const depPackageJsonPath = path.join(projectRoot, "node_modules", directDependency, "package.json");
        if (!fs.existsSync(depPackageJsonPath)) {
            continue;
        }

        try {
            const depPackageJson = JSON.parse(fs.readFileSync(depPackageJsonPath, "utf-8")) as {
                dependencies?: Record<string, string>;
            };

            for (const transitiveDep of Object.keys(depPackageJson.dependencies ?? {})) {
                if (unresolved.has(transitiveDep)) {
                    causeMap.set(transitiveDep, directDependency);
                    unresolved.delete(transitiveDep);
                }
            }
        } catch {
            continue;
        }
    }

    for (const specifier of unresolved) {
        causeMap.set(specifier, UNKNOWN_CAUSE);
    }

    return causeMap;
}

function collectJsFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) {
        return [];
    }

    const results: string[] = [];
    const stack = [dir];

    while (stack.length > 0) {
        const current = stack.pop()!;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
            } else if (entry.isFile() && entry.name.endsWith(".js")) {
                results.push(fullPath);
            }
        }
    }

    return results;
}

export async function checkExternalDependencies(outputFilePath: string, platform?: string): Promise<void> {
    const outputDir = path.dirname(outputFilePath);
    const jsFiles = collectJsFiles(outputDir);

    const flagged = new Set<string>();
    for (const file of jsFiles) {
        let code: string;
        try {
            code = fs.readFileSync(file, "utf-8");
        } catch {
            continue;
        }

        for (const specifier of parseDisallowedImports(code)) {
            flagged.add(specifier);
        }
    }

    if (flagged.size > 0) {
        const causeMap = buildCauseMap(flagged, process.cwd());
        const sortedSpecifiers = [...flagged].sort();
        for (const specifier of sortedSpecifiers) {
            const cause = causeMap.get(specifier);
            if (!cause || cause === UNKNOWN_CAUSE) {
                logger.error(`"${specifier}" is an unsupported external library.`);
            } else {
                logger.error(`"${specifier}" is an unsupported external library. (dependency of ${cause})`);
            }
        }

        if (platform !== "node" && platform !== "browser") {
            logger.info('Setting platform to "node" in tsdown.config.ts may resolve these issues.');
        }
    }
}
