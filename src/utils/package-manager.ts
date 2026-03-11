import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { log } from "./logger.js";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export function detectPackageManager(): PackageManager {
    const cwd = process.cwd();

    // 1. Check packageManager field in package.json
    const pkgJsonPath = path.resolve(cwd, "package.json");
    if (fs.existsSync(pkgJsonPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as {
            packageManager?: string;
        };
        if (pkgJson.packageManager) {
            const name = pkgJson.packageManager.split("@")[0];
            if (isValidPackageManager(name)) {
                log(`Detected package manager from package.json: ${name}`);
                return name;
            }
        }
    }

    // 2. Check lock files
    if (fs.existsSync(path.resolve(cwd, "bun.lockb")) || fs.existsSync(path.resolve(cwd, "bun.lock"))) {
        log("Detected package manager from lock file: bun");
        return "bun";
    }
    if (fs.existsSync(path.resolve(cwd, "pnpm-lock.yaml"))) {
        log("Detected package manager from lock file: pnpm");
        return "pnpm";
    }
    if (fs.existsSync(path.resolve(cwd, "yarn.lock"))) {
        log("Detected package manager from lock file: yarn");
        return "yarn";
    }
    if (fs.existsSync(path.resolve(cwd, "package-lock.json"))) {
        log("Detected package manager from lock file: npm");
        return "npm";
    }

    // 3. Fallback to npm
    log("No lock file found. Defaulting to npm.");
    return "npm";
}

function isValidPackageManager(name: string): name is PackageManager {
    return ["npm", "pnpm", "yarn", "bun"].includes(name);
}

function getInstallCommand(pm: PackageManager): string {
    return pm === "yarn" ? "add" : "install";
}

function getExactFlag(pm: PackageManager): string {
    switch (pm) {
        case "npm":
            return "--save-exact";
        case "pnpm":
            return "--save-exact";
        case "yarn":
            return "--exact";
        case "bun":
            return "--exact";
    }
}

function getForceFlag(pm: PackageManager): string | undefined {
    switch (pm) {
        case "npm":
            return "--force";
        case "pnpm":
            return "--force";
        case "yarn":
            return undefined;
        case "bun":
            return "--force";
    }
}

export function installPackage(pm: PackageManager, packageSpec: string): void {
    const cmd = getInstallCommand(pm);
    const exact = getExactFlag(pm);
    const force = getForceFlag(pm);
    const devFlag = pm === "yarn" ? "--dev" : "--save-dev";

    const args = [pm, cmd, packageSpec, devFlag, exact];
    if (force) args.push(force);

    const command = args.join(" ");
    execSync(command, { stdio: "pipe", cwd: process.cwd() });
}
