import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Manifest, ManifestDependency, ManifestVersion } from "./manifest.js";
import { extractMcVersion, extractModuleVersion, getVersions } from "./versions.js";
import * as logger from "./logger.js";

const DEFAULT_ENGINE_VERSION: [number, number, number] | string = "1.20.0";

interface ScaffoldOptions {
    targetDir: string;
    projectName?: string;
    workflow?: boolean;
}

interface ResolvedDependencyInfo {
    engineVersion: ManifestVersion;
    dependencies: ManifestDependency[];
    packageDependencies: Record<string, string>;
}

export async function scaffoldProject(options: ScaffoldOptions): Promise<void> {
    const targetDir = path.resolve(options.targetDir);
    const projectName = options.projectName?.trim() || path.basename(targetDir);
    const includeWorkflow = options.workflow !== false;

    fs.mkdirSync(targetDir, { recursive: true });

    const dependencyInfo = await resolveDependencyInfo();
    const files = createTemplateFiles(projectName, dependencyInfo, includeWorkflow);

    let createdCount = 0;

    for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(targetDir, relativePath);

        if (fs.existsSync(filePath)) {
            logger.warn(`Skipped existing file: ${relativePath}`);
            continue;
        }

        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, "utf-8");
        logger.log(`Created ${relativePath}`);
        createdCount += 1;
    }

    if (createdCount === 0) {
        logger.warn("No files were created.");
        return;
    }

    logger.done(`Project initialized in ${targetDir}`);
}

export function ensureNewProjectTarget(targetDir: string): void {
    if (!fs.existsSync(targetDir)) {
        return;
    }

    const entries = fs.readdirSync(targetDir);
    if (entries.length > 0) {
        logger.error(`Target directory is not empty: ${targetDir}`);
        process.exit(1);
    }
}

export function openProject(targetDir: string, editorCommand: string): void {
    const result = spawnSync(editorCommand, ["."], {
        cwd: targetDir,
        shell: true,
        stdio: "inherit",
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(`${editorCommand} exited with code ${result.status ?? "unknown"}`);
    }
}

async function resolveDependencyInfo(): Promise<ResolvedDependencyInfo> {
    try {
        const serverVersions = await getVersions("@minecraft/server");
        const matchedServer = serverVersions.find((version) => version.includes("-stable"));

        if (!matchedServer) {
            throw new Error("No stable @minecraft/server version found.");
        }

        const mcVersion = extractMcVersion(matchedServer);
        const engineVersion = mcVersion;
        const dependencies: Manifest["dependencies"] = [];
        const packageDependencies: Record<string, string> = {};

        for (const packageName of ["@minecraft/server", "@minecraft/server-ui"]) {
            const versions = await getVersions(packageName);
            const matchedVersion = versions.find((version) => version.includes(mcVersion));

            if (!matchedVersion) {
                logger.warn(`Skipped ${packageName}: no version found for Minecraft ${mcVersion}`);
                continue;
            }

            const manifestVersion = extractModuleVersion(matchedVersion);
            dependencies.push({
                module_name: packageName,
                version: manifestVersion,
            });
            packageDependencies[packageName] = matchedVersion;
        }

        return {
            engineVersion,
            dependencies,
            packageDependencies,
        };
    } catch (error) {
        logger.warn(`Failed to resolve latest ScriptAPI dependencies: ${error instanceof Error ? error.message : String(error)}`);
        logger.warn("Creating the project without npm dependencies. You can run scriptup stable later.");

        return {
            engineVersion: DEFAULT_ENGINE_VERSION,
            dependencies: [],
            packageDependencies: {},
        };
    }
}

function createTemplateFiles(projectName: string, dependencyInfo: ResolvedDependencyInfo, includeWorkflow: boolean): Record<string, string> {
    const manifest = createManifest(projectName, dependencyInfo.engineVersion, dependencyInfo.dependencies);
    const packageJson = createPackageJson(projectName, dependencyInfo.packageDependencies);

    const files: Record<string, string> = {
        ".gitignore": "node_modules/\nscripts\n*.mcpack\n*.mcaddon\n",
        ".vscode/settings.json": JSON.stringify(createVsCodeSettings(), null, 2) + "\n",
        ".vscode/launch.json": JSON.stringify(createVsCodeLaunchConfig(manifest), null, 2) + "\n",
        "README.md": createReadme(projectName),
        LICENSE: createLicense(),
        "manifest.json": JSON.stringify(manifest, null, "\t") + "\n",
        "package.json": JSON.stringify(packageJson, null, 2) + "\n",
        "tsconfig.json": JSON.stringify(createTsConfig(), null, 2) + "\n",
        "tsdown.config.ts": ['import { defineConfig } from "tsdown";', "", "export default defineConfig({});", ""].join("\n"),
        "src/main.ts":
            [
                'import { world } from "@minecraft/server";',
                "",
                "world.afterEvents.worldLoad.subscribe(() => {",
                '    console.log("Hello world!");',
                "});",
            ].join("\n") + "\n",
    };

    if (includeWorkflow) {
        files[".github/workflows/mcpack.yml"] = createMcpackWorkflow();
    }

    return files;
}

function createManifest(projectName: string, engineVersion: ManifestVersion, dependencies: ManifestDependency[]): Manifest {
    return {
        format_version: 3,
        header: {
            name: projectName,
            description: `${projectName} (B)`,
            uuid: randomUUID(),
            version: [1, 0, 0],
            min_engine_version: engineVersion,
        },
        metadata: {
            authors: ["YOUR NAME HERE"],
            url: "https://example.com/your-project",
            generated_with: {
                scriptup: ["1.0.0"],
            },
        },
        modules: [
            {
                type: "data",
                uuid: randomUUID(),
                version: [1, 0, 0],
            },
            {
                type: "script",
                uuid: randomUUID(),
                version: [1, 0, 0],
                language: "javascript",
                entry: "scripts/main.js",
            },
        ],
        dependencies,
    };
}

function createPackageJson(projectName: string, dependencies: Record<string, string>): Record<string, unknown> {
    const devDependencies: Record<string, string> = {
        "@bedrock-apis/env-types": "1.0.0-beta.6",
        typescript: "^5.9.3",
        tsdown: "^0.21.2",
    };

    for (const [name, version] of Object.entries(dependencies)) {
        devDependencies[name] = version;
    }

    const packageJson: Record<string, unknown> = {
        name: normalizePackageName(projectName),
        version: "1.0.0",
        type: "module",
        scripts: {
            build: "scriptup build --release",
            watch: "scriptup build --watch",
        },
        devDependencies,
        keywords: ["minecraft", "minecraft-bedrock", "minecraft-script-api", "scriptapi"],
        files: ["manifest.json", "scripts", "LICENSE", "README.md"],
    };

    return packageJson;
}

function createTsConfig(): Record<string, unknown> {
    return {
        include: ["src"],
        compilerOptions: {
            strict: true,
            noLib: true,
            types: ["@bedrock-apis/env-types"],
            noEmit: true,
        },
    };
}

function createVsCodeSettings(): Record<string, unknown> {
    return {
        "json.schemas": [
            {
                url: "https://raw.githubusercontent.com/Blockception/Minecraft-bedrock-json-schemas/refs/heads/main/general/manifest.json",
                fileMatch: ["manifest.json"],
            },
        ],
    };
}

function createVsCodeLaunchConfig(manifest: Manifest): Record<string, unknown> {
    const uuid = manifest.modules?.find((module) => module.type === "script")?.uuid;

    if (!uuid) {
        logger.warn("No script module UUID found in manifest. VSCode launch configuration will not include targetModuleUuid.");
    }

    return {
        version: "0.2.0",
        configurations: [
            {
                type: "minecraft-js",
                request: "attach",
                name: "Attach to Minecraft",
                mode: "listen",
                localRoot: "${workspaceFolder}/src",
                sourceMapRoot: "${workspaceFolder}/scripts",
                ...(uuid ? { targetModuleUuid: uuid } : {}),
                host: "localhost",
                port: 19144,
            },
        ],
    };
}

function createMcpackWorkflow(): string {
    return `name: Upload mcpack
on:
  release:
    types: [published]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

    ##############################

    ###   pnpm   ###

      - name: Install pnpm
        uses: pnpm/action-setup@v4

      - name: Use Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "pnpm"

      - name: Install dependencies
        run: |
          pnpm i --frozen-lockfile
          
      - name: Build
        run: pnpm run build

    ###   npm   ###

      # - name: Use Node.js 24
      #   uses: actions/setup-node@v4
      #   with:
      #     node-version: "24"
      #     cache: "npm"

      # - name: Install dependencies
      #   run: |
      #     npm ci

      # - name: Build
      #   run: |
      #     npm run build

    ###   yarn   ###

      # - name: Use Node.js 24
      #   uses: actions/setup-node@v4
      #   with:
      #     node-version: "24"
      #     cache: "yarn"

      # - name: Install dependencies
      #   uses: borales/actions-yarn@v4
      #   with:
      #     cmd: install

      # - name: Build
      #   uses: borales/actions-yarn@v4
      #   with:
      #     cmd: build

    ##############################

      - name: Get Pack Name
        id: get-name
        run: |
          name=$(jq -r '.header.name' manifest.json | tr -d '"' | tr ' ' '_')
          echo "fileName=$name" >> $GITHUB_OUTPUT

      - name: Make Archive
        run: |
          echo "Creating archive: \${{ steps.get-name.outputs.fileName }}"
          files=$(jq -r '.files[]' package.json | tr '\\n' ' ')
          zip -r "\${{ steps.get-name.outputs.fileName }}.mcpack" $files
          cp "\${{ steps.get-name.outputs.fileName }}.mcpack" "\${{ steps.get-name.outputs.fileName }}.zip"

      - name: Upload Release Asset
        run: gh release upload "$GITHUB_REF_NAME" "\${{ steps.get-name.outputs.fileName }}.mcpack" "\${{ steps.get-name.outputs.fileName }}.zip" --clobber
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}`;
}

function createReadme(projectName: string): string {
    return [`# ${projectName}`, "", "ScriptAPI addon template generated by scriptup.", "", "## Setup", "", "```bash", "npm install", "```", ""].join(
        "\n",
    );
}

function createLicense(): string {
    const year = new Date().getFullYear();
    let author = "{{author}}";
    try {
        const gitNameResult = spawnSync("git", ["config", "user.name"], {
            encoding: "utf-8",
            shell: true,
        });
        if (gitNameResult.status === 0) {
            const gitName = gitNameResult.stdout.trim();
            if (gitName) {
                author = gitName;
            }
        }
    } catch (error) {
        logger.warn(`Failed to get git user.name: ${error instanceof Error ? error.message : String(error)}`);
        logger.warn("Using placeholder author name in LICENSE.");
    }

    return `MIT License

Copyright (c) ${year} ${author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
}

function normalizePackageName(projectName: string): string {
    const normalized = projectName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_\s]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    return normalized || "scriptapi-addon";
}
