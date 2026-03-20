import ora from "ora";
import { getManifest, isManifestModuleDependency, updateManifest } from "../utils/manifest.js";
import { getVersions, extractMcVersion } from "../utils/versions.js";
import { installPackage } from "../utils/package-manager.js";
import * as logger from "../utils/logger.js";

export async function lts(): Promise<void> {
    const spinner = ora("Fetching Minecraft version...").start();

    const mcVersion = await getStableMinecraftVersion();
    spinner.succeed(`Install modules for Minecraft version: ${mcVersion}`);

    const manifest = getManifest();
    logger.log("Manifest loaded. Fetching new module versions...");

    interface ModuleInfo {
        name: string;
        version: string;
    }
    const modules: ModuleInfo[] = [];

    const dependencies = manifest.dependencies?.filter(isManifestModuleDependency) ?? [];

    for (const dependency of dependencies) {
        const versions = await getVersions(dependency.module_name);

        // LTS: non-stable, non-preview, non-internal, non-beta, non-0.x
        let matched = versions.find(
            (v) => !v.includes("stable") && !v.includes("preview") && !v.includes("internal") && !v.includes("beta") && !v.startsWith("0."),
        );

        if (matched) {
            dependency.version = matched;
        } else {
            logger.warn(`No LTS versions found for ${dependency.module_name}. Falling back to stable.`);
            matched = versions.find((v) => v.includes(mcVersion));
            if (!matched) {
                logger.error(`No version found for ${dependency.module_name}`);
                process.exit(1);
            }
            dependency.version = extractMcVersion(matched);
        }

        logger.log(`${dependency.module_name}: ${matched}`);

        modules.push({ name: dependency.module_name, version: matched });
    }

    updateManifest(manifest);
    logger.log("Module versions fetched and manifest updated.");

    const installSpinner = ora("Installing modules...").start();

    for (let i = 0; i < modules.length; i++) {
        const mod = modules[i];
        installSpinner.text = `Installing modules... (${i + 1}/${modules.length}) ${mod.name}`;

        try {
            await installPackage(`${mod.name}@${mod.version}`);
        } catch (e) {
            installSpinner.fail(`Failed to install ${mod.name}`);
            logger.error(e instanceof Error ? e.message : String(e));
            process.exit(1);
        }
    }

    installSpinner.succeed("All modules installed successfully.");
}

async function getStableMinecraftVersion(): Promise<string> {
    const versions = await getVersions("@minecraft/server");
    const version = versions.find((v) => v.includes("-stable"));

    if (!version) {
        logger.error("No stable versions found.");
        process.exit(1);
    }

    return extractMcVersion(version);
}
