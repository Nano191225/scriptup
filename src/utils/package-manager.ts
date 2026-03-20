import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { detect, parseNi } from "@antfu/ni";
import { select } from "@inquirer/prompts";
import { log } from "./logger.js";

export type PackageManager = NonNullable<Awaited<ReturnType<typeof detect>>>;

export async function detectPackageManager(): Promise<PackageManager> {
    const agent = await detect({ programmatic: true });
    if (agent) {
        log(`Detected package manager: ${agent}`);
        return agent;
    }
    log("No package manager detected. Defaulting to npm.");
    return "npm";
}

export async function selectPackageManager(targetDir?: string): Promise<PackageManager> {
    const pm = await select<PackageManager>({
        message: "Select a package manager",
        choices: [{ value: "npm" }, { value: "pnpm" }, { value: "yarn" }, { value: "bun" }],
    });

    if (targetDir) {
        const packageJsonPath = path.join(targetDir, "package.json");
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as Record<string, unknown>;

        delete packageJson.packageManager;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n", "utf-8");

        let pmVersion = "0.0.0";
        try {
            pmVersion = execSync(`${pm} --version`, { encoding: "utf-8" }).trim();
        } catch {
            // ignore version fetch failure
        }

        packageJson.packageManager = `${pm}@${pmVersion}`;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n", "utf-8");
        log(`Set packageManager: ${pm}@${pmVersion}`);
    }

    return pm;
}

export async function installPackage(packageSpec: string): Promise<void> {
    const pm = await detectPackageManager();
    const resolved = await parseNi(pm, [packageSpec, "-D", "-E"], { programmatic: true });
    if (!resolved) throw new Error(`Could not resolve install command for ${packageSpec}`);
    execSync([resolved.command, ...resolved.args].join(" "), { stdio: "pipe" });
}
