English | [日本語](README.ja.md)

# scriptup

[![Release](https://img.shields.io/github/v/release/Nano191225/scriptup?display_name=tag)](https://github.com/Nano191225/scriptup/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

CLI for Minecraft Bedrock ScriptAPI development.

scriptup helps you keep @minecraft/\* modules current, use external libraries in ScriptAPI projects, and scaffold projects and library-ready structures quickly.

## Motivation

- Make updating @minecraft/\* easier
- Make it easy to use external libraries in ScriptAPI
- Make it easy to create libraries for ScriptAPI

## Features

- Update ScriptAPI module versions in manifest.json and install matching package versions
- Create a new ScriptAPI project directly in development_behavior_packs
- Initialize the current directory as a ScriptAPI project
- Build ScriptAPI code with tsdown using manifest.json script entry output
- Optional local library scaffold for creating reusable ScriptAPI packages

## Requirements

- Node.js 18+
- Minecraft Bedrock environment for addon testing
- One of npm, pnpm, yarn, or bun

## Install

Use your preferred package manager and install globally.

```bash
npm i -g @nano191225/scriptup
```

```bash
pnpm add -g @nano191225/scriptup
```

After installation, run via scriptup (or sup).

## Quick Start

### Update to latest stable ScriptAPI modules

```bash
scriptup stable
```

### Create a new project

```bash
scriptup new my-pack --open
```

### Build your project

```bash
scriptup build
```

## Commands

### scriptup stable

Installs module versions matching the latest stable Minecraft version.

### scriptup preview

Installs module versions matching the latest preview Minecraft version.

### scriptup lts

Installs LTS-like module versions (non-stable, non-preview, non-beta, non-internal when available), with fallback to stable matching versions.

### scriptup <version>

Manual version lookup mode.

Example:

```bash
scriptup 1.21.60
scriptup 2.0.0-beta
```

### scriptup init

Initialize the current directory as a ScriptAPI project.

Options:

- --lib: Include local library scaffold under package/
- --no-workflow: Do not generate GitHub Actions workflow files

What it does:

- Scaffolds core project files (manifest.json, tsconfig.json, src/main.ts, etc.)
- Ensures tsdown.config.ts exists
- Sets package.json scripts:
    - build: scriptup build --release
    - watch: scriptup build --watch
- Installs required dev dependencies

### scriptup new <project-name>

Create a new ScriptAPI project.

Options:

- -o, --open [command]: Open project after creation (preset: code)
- -p, --preview: Use Minecraft Bedrock Preview behavior packs directory
- -d, --dir <path>: Create under a specific directory
- --lib: Include local library scaffold under package/
- --no-link: Do not create behavior-pack link when --dir is used
- --no-workflow: Do not generate GitHub Actions workflow files

Default target directories:

- Windows stable:
    - %APPDATA%/Minecraft Bedrock/Users/Shared/games/com.mojang/development_behavior_packs
- Windows preview:
    - %APPDATA%/Minecraft Bedrock Preview/Users/Shared/games/com.mojang/development_behavior_packs
- Linux (mcpelauncher):
    - ${XDG_DATA_HOME:-~/.local/share}/mcpelauncher/games/com.mojang/development_behavior_packs

### scriptup build

Bundle/build current ScriptAPI project using tsdown.

Options:

- -b, --bundle: Force bundled output
- -w, --watch: Watch mode
- -r, --release: Release build (minified, sourcemap off)

Build behavior summary:

- Output target is derived from manifest.json script module entry (for example scripts/main.js)
- Input entry priority:
    - src/main.ts
    - src/index.ts
    - entry in tsdown.config.ts
- Release mode also builds package/\*\*/\*.ts into dist/ when package/ exists
- If disallowed external imports remain in output (outside allowed @minecraft/\*), scriptup warns with both the likely cause package and remaining dependency names

## Typical Workflows

### Existing project

```bash
scriptup init
scriptup stable
scriptup build
```

### New addon project

```bash
scriptup new my-addon --open
cd my-addon
scriptup build --watch
```

### New library-ready project

```bash
scriptup new @yourname/your-lib --lib --dir . --open
```

## Notes

- scriptup updates versions in manifest.json and installs matching dev dependencies
- Package manager is auto-detected from packageManager field or lockfile
- Alias command sup is also available

## License

MIT
