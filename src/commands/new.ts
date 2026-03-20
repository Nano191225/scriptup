import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as logger from "../utils/logger.js";
import { selectPackageManager } from "../utils/package-manager.js";
import { installInitDependencies } from "./init.js";
import { ensureNewProjectTarget, openProject, scaffoldProject } from "../utils/scaffold.js";

interface NewCommandOptions {
    open?: string;
    preview?: boolean;
    dir?: string;
    lib?: boolean;
    link?: boolean;
    workflow?: boolean;
    interactive?: boolean;
}

const supportedEditors = ["code", "code-insiders"];

export async function createNewProject(projectName: string, options: NewCommandOptions): Promise<void> {
    const behaviorPacksDir = resolveBehaviorPacksDir(options.preview);
    const directoryName = resolveProjectDirectoryName(projectName);
    const targetDir = resolveProjectTargetDir(directoryName, options, behaviorPacksDir);

    ensureNewProjectTarget(targetDir);
    await scaffoldProject({
        targetDir,
        projectName,
        directoryName,
        lib: options.lib,
        workflow: options.workflow,
    });

    if (options.interactive) {
        await selectPackageManager(targetDir);
        await installInitDependencies(targetDir);
    }

    if (options.dir && options.link !== false) {
        const linkPath = path.join(behaviorPacksDir, directoryName);
        createBehaviorPackLink(targetDir, linkPath);
    }

    if (!options.open) return;

    if (!supportedEditors.includes(options.open)) return logger.error(`Unsupported editor: ${options.open}`);

    logger.info(`Opening project with ${options.open}...`);

    try {
        openProject(targetDir, options.open);
    } catch (error) {
        logger.error(`Failed to open project: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}

function resolveProjectTargetDir(projectName: string, options: NewCommandOptions, behaviorPacksDir: string): string {
    if (options.dir) {
        return path.resolve(options.dir, projectName);
    }

    return path.join(behaviorPacksDir, projectName);
}

function resolveProjectDirectoryName(projectName: string): string {
    const replacedSeparators = projectName.trim().replace(/[\\/]+/g, "-");
    const sanitized = replacedSeparators.replace(/[^A-Za-z0-9-_]/g, "");

    if (sanitized.length === 0) {
        logger.error("Project name is empty after sanitizing. Use at least one of A-Z, a-z, 0-9, -, or _.");
        process.exit(1);
    }

    return sanitized;
}

function resolveBehaviorPacksDir(preview = false): string {
    if (process.platform === "win32") {
        const appDataPath = process.env.APPDATA;
        if (!appDataPath) {
            logger.error("APPDATA is not available. Use --dir to specify the destination manually.");
            process.exit(1);
        }

        const minecraftFolder = preview ? "Minecraft Bedrock Preview" : "Minecraft Bedrock";

        return path.join(appDataPath, minecraftFolder, "Users", "Shared", "games", "com.mojang", "development_behavior_packs");
    }

    const xdgDataHome = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
    return path.join(xdgDataHome, "mcpelauncher", "games", "com.mojang", "development_behavior_packs");
}

function createBehaviorPackLink(sourceDir: string, linkPath: string): void {
    const resolvedSourceDir = path.resolve(sourceDir);
    const resolvedLinkPath = path.resolve(linkPath);

    if (resolvedSourceDir === resolvedLinkPath) {
        return;
    }

    fs.mkdirSync(path.dirname(resolvedLinkPath), { recursive: true });

    if (fs.existsSync(resolvedLinkPath)) {
        logger.warn(`Link path already exists, skipping link creation: ${resolvedLinkPath}`);
        return;
    }

    const linkType: fs.symlink.Type = process.platform === "win32" ? "junction" : "dir";
    fs.symlinkSync(resolvedSourceDir, resolvedLinkPath, linkType);

    logger.log(`Linked behavior pack: ${resolvedLinkPath} -> ${resolvedSourceDir}`);
}
