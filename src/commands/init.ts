import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import * as logger from "../utils/logger.js";
import { detectPackageManager, PackageManager } from "../utils/package-manager.js";
import { scaffoldProject } from "../utils/scaffold.js";

interface InitCommandOptions {
    lib?: boolean;
    workflow?: boolean;
}

export async function init(targetDir = process.cwd(), options: InitCommandOptions = {}): Promise<void> {
    const resolvedTargetDir = path.resolve(targetDir);

    await scaffoldProject({
        targetDir: resolvedTargetDir,
        lib: options.lib,
        workflow: options.workflow,
    });

    ensureTsdownConfig(resolvedTargetDir);
    updateBuildScripts(resolvedTargetDir);
    installInitDependencies(resolvedTargetDir);

    logger.info("Initialization complete.");
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

function installInitDependencies(targetDir: string): void {
    const previousCwd = process.cwd();

    try {
        process.chdir(targetDir);
        const pm = detectPackageManager();
        const packages = ["@nano191225/scriptup", "tsdown", "typescript", "@bedrock-apis/env-types"];
        const command = buildDevInstallCommand(pm, packages);

        execSync(command, { stdio: "inherit", cwd: targetDir });
        logger.log("Installed required dev dependencies");
    } catch (error) {
        logger.error(`Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    } finally {
        process.chdir(previousCwd);
    }
}

function buildDevInstallCommand(pm: PackageManager, packages: string[]): string {
    const packageList = packages.join(" ");

    switch (pm) {
        case "npm":
            return `npm install --save-dev ${packageList}`;
        case "pnpm":
            return `pnpm add --save-dev ${packageList}`;
        case "yarn":
            return `yarn add --dev ${packageList}`;
        case "bun":
            return `bun add --save-dev ${packageList}`;
    }
}
