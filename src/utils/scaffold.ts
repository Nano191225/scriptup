import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Manifest, ManifestDependency, ManifestVersion } from "./manifest.js";
import { extractMcVersion, extractModuleVersion, getVersions } from "./versions.js";
import * as logger from "./logger.js";
import { VERSION } from "../constants.js";
import { getUsername } from "./username.js";

const DEFAULT_ENGINE_VERSION: [number, number, number] | string = "1.20.0";

interface ScaffoldOptions {
    targetDir: string;
    projectName?: string;
    directoryName?: string;
    lib?: boolean;
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
    const directoryName = options.directoryName?.trim() || projectName;
    const includeLibraryTemplate = options.lib === true;
    const includeWorkflow = options.workflow !== false;

    fs.mkdirSync(targetDir, { recursive: true });

    const dependencyInfo = await resolveDependencyInfo();
    const files = createTemplateFiles(projectName, directoryName, dependencyInfo, includeWorkflow, includeLibraryTemplate);

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

function createTemplateFiles(
    projectName: string,
    directoryName: string,
    dependencyInfo: ResolvedDependencyInfo,
    includeWorkflow: boolean,
    includeLibraryTemplate: boolean,
): Record<string, string> {
    const libraryPackageName = includeLibraryTemplate ? resolveLibraryPackageName(projectName) : null;
    const manifest = createManifest(projectName, dependencyInfo.engineVersion, dependencyInfo.dependencies, includeLibraryTemplate);
    const packageJson = createPackageJson(projectName, directoryName, dependencyInfo.packageDependencies, includeLibraryTemplate, libraryPackageName);

    const files: Record<string, string> = {
        ".gitignore": "node_modules/\nscripts\ndist\n*.mcpack\n*.mcaddon\n",
        ".vscode/settings.json": JSON.stringify(createVsCodeSettings(), null, 2) + "\n",
        ".vscode/launch.json": JSON.stringify(createVsCodeLaunchConfig(manifest), null, 2) + "\n",
        "README.md": createReadme(projectName, includeLibraryTemplate, libraryPackageName),
        LICENSE: createLicense(),
        "manifest.json": JSON.stringify(manifest, null, "\t") + "\n",
        "package.json": JSON.stringify(packageJson, null, 2) + "\n",
        "tsconfig.json": JSON.stringify(createTsConfig(includeLibraryTemplate, libraryPackageName), null, 2) + "\n",
        "tsdown.config.ts": ['import { defineConfig } from "tsdown";', "", "export default defineConfig({});", ""].join("\n"),
        "src/main.ts": includeLibraryTemplate ? createLibraryMainSource(libraryPackageName ?? "@scope/sample") : createDefaultMainSource(),
    };

    if (includeLibraryTemplate) {
        files["package/main.ts"] = createLibraryEntrySource();
    }

    if (includeWorkflow) {
        files[".github/workflows/mcpack.yml"] = createMcpackWorkflow();
        files[".github/workflows/webhook.yml"] = createWebhookWorkflow();
        if (includeLibraryTemplate) {
            files[".github/workflows/publish.yml"] = createPublishWorkflow();
            files[".github/workflows/ensure-dts-export.js"] = createPublishScript();
        }
    }

    return files;
}

function createManifest(
    projectName: string,
    engineVersion: ManifestVersion,
    dependencies: ManifestDependency[],
    includeLibraryTemplate: boolean,
): Manifest {
    const suffix = includeLibraryTemplate ? "-lib" : "-beh";

    return {
        format_version: 3,
        header: {
            name: `${projectName}${suffix}`,
            description: `${projectName}${suffix}`,
            uuid: randomUUID(),
            version: "0.1.0",
            min_engine_version: engineVersion,
        },
        metadata: {
            authors: ["YOUR NAME HERE"],
            url: "https://example.com/your-project",
            generated_with: {
                "nano191225-scriptup": [VERSION],
            },
        },
        modules: [
            {
                type: "data",
                uuid: randomUUID(),
                version: "0.1.0",
            },
            {
                type: "script",
                uuid: randomUUID(),
                version: "0.1.0",
                language: "javascript",
                entry: "scripts/main.js",
            },
        ],
        dependencies,
    };
}

function createPackageJson(
    projectName: string,
    directoryName: string,
    dependencies: Record<string, string>,
    includeLibraryTemplate: boolean,
    libraryPackageName: string | null,
): Record<string, unknown> {
    const devDependencies: Record<string, string> = {
        "@nano191225/scriptup": "^1.0.0",
        "@bedrock-apis/env-types": "^1.0.0-beta.6",
        typescript: "^5.9.3",
        tsdown: "^0.21.2",
    };

    for (const [name, version] of Object.entries(dependencies)) {
        devDependencies[name] = version;
    }

    const files = includeLibraryTemplate ? ["dist", "LICENSE", "README.md"] : ["manifest.json", "scripts", "LICENSE", "README.md"];

    const packageJson: Record<string, unknown> = {
        name: normalizePackageName(projectName),
        version: "0.1.0",
        type: "module",
        ...(includeLibraryTemplate
            ? {
                  exports: {
                      ".": {
                          types: "./dist/main.d.ts",
                          default: "./dist/main.js",
                      },
                  },
                  main: "./dist/main.js",
                  types: "./dist/main.d.ts",
                  prepublishOnly: "scriptup build --release && node .github/workflows/ensure-dts-export.js",
                  repository: `https://github.com/${getUsername() ?? "{{your-username}}"}/${directoryName}.git`,
              }
            : {}),
        scripts: {
            build: "scriptup build --release",
            watch: "scriptup build --watch",
        },
        dependencies: {},
        devDependencies,
        keywords: ["minecraft", "minecraft-bedrock", "minecraft-script-api", "script-api"],
        files,
    };

    return packageJson;
}

function createTsConfig(includeLibraryTemplate: boolean, libraryPackageName: string | null): Record<string, unknown> {
    const compilerOptions: Record<string, unknown> = {
        module: "es2022",
        target: "es2024",
        moduleResolution: "node",
        skipLibCheck: true,
        strict: true,
        noLib: true,
        types: ["@bedrock-apis/env-types"],
        noEmit: true,
    };

    if (includeLibraryTemplate && libraryPackageName) {
        compilerOptions.baseUrl = ".";
        compilerOptions.paths = {
            [libraryPackageName]: ["package/main.ts"],
        };
    }

    return {
        include: includeLibraryTemplate ? ["src", "package"] : ["src"],
        compilerOptions,
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

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

    ##############################

    ### When selected package manager, uncomment below.

      - name: You have to select a package manager.
        run: exit 1

    ###   pnpm   ###

      # - name: Install pnpm
      #   uses: pnpm/action-setup@v4
      #   with:
      #     version: 10

      # - name: Use Node.js 24
      #   uses: actions/setup-node@v4
      #   with:
      #     node-version: "24"
      #     cache: "pnpm"

      # - name: Install dependencies
      #   run: |
      #     pnpm i --frozen-lockfile
          
      # - name: Build
      #   run: pnpm run build

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

    ###   bun   ###

      # - name: Use Node.js 24
      #   uses: actions/setup-node@v4
      #   with:
      #     node-version: "24"

      # - name: Install Bun
      #   uses: oven-sh/setup-bun@v2

      # - name: Install dependencies
      #   run: |
      #     bun i --frozen-lockfile

      # - name: Build
      #   run: |
      #     bun run build

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
          tag="$GITHUB_REF_NAME"
          echo "fileName=$name-$tag" >> $GITHUB_OUTPUT

      - name: Make Archive
        run: |
          echo "Creating archive: \${{ steps.get-name.outputs.fileName }}"
          files="manifest.json scripts $(jq -r '.files[] | select(. != "manifest.json" and . != "scripts")' package.json | tr '\\n' ' ')"
          zip -r "\${{ steps.get-name.outputs.fileName }}.mcpack" $files
          cp "\${{ steps.get-name.outputs.fileName }}.mcpack" "\${{ steps.get-name.outputs.fileName }}.zip"

      - name: Upload Release Asset
        run: gh release upload "$GITHUB_REF_NAME" "\${{ steps.get-name.outputs.fileName }}.mcpack" "\${{ steps.get-name.outputs.fileName }}.zip" --clobber
        env:
          GITHUB_TOKEN: \${{ github.token }}`;
}

function createPublishWorkflow(): string {
    return `name: Publish library
# Triggered when a GitHub release is published.
# Uses npm Trusted Publishers (OIDC) — no NPM_TOKEN secret required.
# See: https://docs.npmjs.com/trusted-publishers#configuring-trusted-publishing

on:
  release:
    types: [published]

permissions:
  contents: read
  id-token: write  # required for OIDC trusted publishing and provenance

jobs:
  publish:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Use Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "pnpm"
          registry-url: "https://registry.npmjs.org"

      - name: Install dependencies
        run: pnpm i --frozen-lockfile

      - name: Build
        run: pnpm run build

      - name: Ensure export footer in d.ts
        run: node .github/workflows/ensure-dts-export.js

      - name: Publish package
        run: pnpm publish --no-git-checks`;
}

function createWebhookWorkflow(): string {
    return `name: Discord release webhook

on:
  release:
    types: [published]

permissions:
  contents: read

jobs:
  notify:
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - name: Determine mention role
        id: mention
        env:
          TAG: \${{ github.event.release.tag_name }}
        run: |
          if [[ "$TAG" == *alpha* ]]; then
            echo "role=@example-alpha" >> "$GITHUB_OUTPUT"
          elif [[ "$TAG" == *beta* ]]; then
            echo "role=@example-beta" >> "$GITHUB_OUTPUT"
          else
            echo "role=@example-stable" >> "$GITHUB_OUTPUT"
          fi

      - name: Post release message to Discord
        env:
          WEBHOOK_URL: \${{ secrets.WEBHOOK_URL }}
          RELEASE_NAME: \${{ github.event.release.name }}
          RELEASE_BODY: \${{ github.event.release.body }}
          RELEASE_URL: \${{ github.event.release.html_url }}
          MENTION_ROLE: \${{ steps.mention.outputs.role }}
        run: |
          payload=$(jq -n --arg name "$RELEASE_NAME" --arg body "$RELEASE_BODY" --arg url "$RELEASE_URL" --arg role "$MENTION_ROLE" '{content: ($role + "\\n## " + $name + "\\n" + $body + "\\n\\n-# " + $url)}')
          curl -sS -X POST \\
            -H "Content-Type: application/json" \\
            -d "$payload" \\
            "$WEBHOOK_URL"
`;
}

function createPublishScript(): string {
    return `import { existsSync, readFileSync, writeFileSync } from "node:fs";

const filePath = "dist/main.d.ts";

if (!existsSync(filePath)) {
  throw new Error(\`Missing file: \${filePath}\`);
}

let content = readFileSync(filePath, "utf8");
const hasFooter = /\\bexport\\s*\\{\\s*\\};?\\s*$/.test(content);

if (!hasFooter) {
  if (!content.endsWith("\\n")) content += "\\n";
  content += "export {};\\n";
  writeFileSync(filePath, content);
  console.log("Appended export {} to dist/main.d.ts");
} else {
  console.log("dist/main.d.ts already ends with export {}");
}
`;
}

function createReadme(projectName: string, includeLibraryTemplate: boolean, libraryPackageName: string | null): string {
    if (!includeLibraryTemplate) {
        return [
            `# ${projectName}`,
            "",
            "ScriptAPI addon template generated by scriptup.",
            "",
            "## Setup",
            "",
            "```bash",
            "npm install",
            "```",
            "",
        ].join("\n");
    }

    return [
        `# ${projectName}`,
        "",
        "ScriptAPI addon template generated by scriptup.",
        "",
        "## Local library structure",
        "",
        "- package/main.ts: local package source",
        `- src/main.ts: sample usage that imports from ${libraryPackageName ?? "@scope/sample"}`,
        "",
        "## Setup",
        "",
        "```bash",
        "npm install",
        "```",
        "",
        "## Publish",
        "",
        "### First publish (manual)",
        "",
        `1. Update \`name\` and \`version\` in package.json (current import alias: \`${libraryPackageName ?? "@scope/sample"}\`).`,
        "2. Build and publish:",
        "",
        "```bash",
        "npm run build",
        "npm publish --access public",
        "```",
        "",
        "### Subsequent publishes (automated via GitHub Actions)",
        "",
        "> [!TIP]",
        "> Using [npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers#configuring-trusted-publishing) removes the need to manage `NPM_TOKEN` in GitHub secrets.",
        "",
        "1. On [npmjs.com](https://www.npmjs.com), open your package → **Settings** → **Trusted Publishers**.",
        "2. Add a trusted publisher:",
        "   - **GitHub Actions** as the provider",
        "   - Organization or user: Enter your GitHub username or organization name",
        "   - Repository: Enter the repository name where the package is located",
        "   - Workflow filename: \`publish.yml\`",
        "   - Environment name: Keep empty",
        "",
        "3. Once configured, **delete** the `NPM_TOKEN` secret from GitHub repository settings (not needed anymore).",
        "",
        "4. Bump \`version\` in package.json, then create a GitHub release → **.github/workflows/publish.yml** runs automatically.",
        "",
    ].join("\n");
}

function createDefaultMainSource(): string {
    return [
        'import { world } from "@minecraft/server";',
        "",
        "world.afterEvents.worldLoad.subscribe(() => {",
        '    console.log("Hello world!");',
        "});",
        "",
    ].join("\n");
}

function createLibraryMainSource(libraryPackageName: string): string {
    return [
        'import { world } from "@minecraft/server";',
        `import { sum } from "${libraryPackageName}";`,
        "",
        "world.afterEvents.worldLoad.subscribe(() => {",
        "    const result = sum(1, 2);",
        "    console.log(`sum(1, 2) = ${result}`);",
        "});",
        "",
    ].join("\n");
}

function createLibraryEntrySource(): string {
    return ["export function sum(a: number, b: number): number {", "    return a + b;", "}", ""].join("\n");
}

function resolveLibraryPackageName(projectName: string): string {
    const trimmed = projectName.trim();
    return trimmed.length > 0 ? trimmed : "@scope/sample";
}

function createLicense(): string {
    const year = new Date().getFullYear();
    const author = getUsername() || "{{author}}";

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
        .replace(/[^a-z0-9-@\/_\s]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    return normalized || "scriptapi-addon";
}
