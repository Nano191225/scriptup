#!/usr/bin/env node

import { Command } from "commander";
import { stable } from "./commands/stable.js";
import { preview } from "./commands/preview.js";
import { lts } from "./commands/lts.js";
import { manual } from "./commands/manual.js";

const program = new Command();

program
    .name("scriptup")
    .description("ScriptAPI version updater for Minecraft Bedrock")
    .version("1.0.0")
    .argument("[version]", "Manually specify a version to look up");

program
    .command("stable")
    .description("Install the latest stable version modules")
    .action(async () => {
        await stable();
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

program.action(async (version: string | undefined) => {
    if (version) {
        await manual(version);
    } else {
        program.help();
    }
});

program.parse();
