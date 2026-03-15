#!/usr/bin/env node

import { Command, Option } from "commander";
import { stable } from "./commands/stable.js";
import { preview } from "./commands/preview.js";
import { lts } from "./commands/lts.js";
import { manual } from "./commands/manual.js";
import { init } from "./commands/init.js";
import { createNewProject } from "./commands/new.js";
import { build } from "./commands/build.js";
import { VERSION } from "./constants.js";

const program = new Command();

program
    .name("scriptup")
    .description("ScriptAPI version updater for Minecraft Bedrock")
    .version(VERSION)
    .argument("[version]", "Manually specify a version to look up");

program
    .command("stable")
    .description("Install the latest stable version modules")
    .option("-f, --force", "Update modules even if the current version is beta")
    .action(async (options: { force?: boolean }) => {
        await stable(options);
    });

program
    .command("preview")
    .description("Install the latest preview version modules")
    .action(async () => {
        await preview();
    });

program
    .command("lts")
    .description("Install the latest LTS version modules")
    .action(async () => {
        await lts();
    });

program
    .command("build")
    .description("Bundle the current ScriptAPI project with tsdown")
    .option("-b, --bundle", "Bundle the output into a single file")
    .option("-w, --watch", "Build in watch mode")
    .option("-r, --release", "Build for release (minified, sourcemap off)")
    .action(async (options: { bundle?: boolean; watch?: boolean; release?: boolean }) => {
        await build(options);
    });

program
    .command("init")
    .description("Initialize a ScriptAPI project in the current directory")
    .option("--lib", "Include local library scaffolding under package/")
    .option("--no-workflow", "Do not create the GitHub Actions workflow files")
    .action(async (options: { lib?: boolean; workflow?: boolean }) => {
        await init(undefined, options);
    });

program
    .command("new")
    .description("Create a new ScriptAPI project")
    .argument("<project-name>", "Directory name for the new project")
    .addOption(new Option("-o, --open [command]", "Open the project after creation").preset("code"))
    .option("-p, --preview", "Create the project in the Minecraft Bedrock Preview behavior packs directory")
    .option("-d, --dir <path>", "Create the project under a specific directory")
    .option("--lib", "Include local library scaffolding under package/")
    .option("--no-link", "Do not create a link in the behavior packs directory when --dir is used")
    .option("--no-workflow", "Do not create the GitHub Actions workflow files")
    .action(
        async (
            projectName: string,
            options: { open?: string; preview?: boolean; dir?: string; lib?: boolean; link?: boolean; workflow?: boolean },
        ) => {
            await createNewProject(projectName, options);
        },
    );

program.action(async (version: string | undefined) => {
    if (version) {
        await manual(version);
    } else {
        program.help();
    }
});

program.parse();
