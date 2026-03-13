import * as fs from "node:fs";
import * as path from "node:path";
import { error } from "./logger.js";

export type ManifestVersion = [number, number, number] | string;

export type ManifestModuleType = "resources" | "data" | "client_data" | "interface" | "world_template" | "script" | (string & {});

export type ManifestCapability = "chemistry" | "editorExtension" | "experimental_custom_ui" | "raytraced";

export type PackScope = "world" | "global" | "any";

export interface ManifestHeader {
    name: string;
    description: string;
    uuid: string;
    version: ManifestVersion;
    min_engine_version?: ManifestVersion;
    base_game_version?: ManifestVersion;
    allow_random_seed?: boolean;
    lock_template_options?: boolean;
    pack_scope?: PackScope;
}

export interface ManifestMetadata {
    authors?: string[];
    author?: string;
    license?: string;
    generated_with?: Record<string, string[]>;
    product_type?: "addon" | (string & {});
    url?: string;
}

export interface BaseManifestModule {
    type: ManifestModuleType;
    uuid: string;
    version: ManifestVersion;
    description?: string;
}

export interface ScriptManifestModule extends BaseManifestModule {
    type: "script";
    language?: "javascript";
    entry?: string;
}

export type ManifestModule = BaseManifestModule | ScriptManifestModule;

export function isScriptManifestModule(module: ManifestModule): module is ScriptManifestModule {
    return module.type === "script";
}

export interface ManifestPackDependency {
    uuid: string;
    version: ManifestVersion;
    module_name?: never;
}

export interface ManifestModuleDependency {
    module_name: string;
    version: ManifestVersion;
    uuid?: never;
}

export type ManifestDependency = ManifestPackDependency | ManifestModuleDependency;

export function isManifestModuleDependency(dependency: ManifestDependency): dependency is ManifestModuleDependency {
    return "module_name" in dependency;
}

export interface ManifestLabelSetting {
    type: "label";
    text: string;
}

export interface ManifestToggleSetting {
    type: "toggle";
    text: string;
    name: string;
    default: boolean;
}

export interface ManifestSliderSetting {
    type: "slider";
    text: string;
    name: string;
    min: number;
    max: number;
    step: number;
    default: number;
}

export type ManifestSetting = ManifestLabelSetting | ManifestToggleSetting | ManifestSliderSetting;

export interface Manifest {
    format_version: 1 | 2 | 3 | number;
    header: ManifestHeader;
    modules?: ManifestModule[];
    dependencies?: ManifestDependency[];
    capabilities?: ManifestCapability[];
    metadata?: ManifestMetadata;
    settings?: ManifestSetting[];
}

export function getManifest(): Manifest {
    const manifestPath = path.resolve("manifest.json");

    if (!fs.existsSync(manifestPath)) {
        error("manifest.json not found.");
        process.exit(1);
    }

    const raw = fs.readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw) as Manifest;
}

export function updateManifest(manifest: Manifest): void {
    const manifestPath = path.resolve("manifest.json");
    const raw = JSON.stringify(manifest, null, "\t");

    fs.writeFileSync(manifestPath, raw, "utf-8");
}
