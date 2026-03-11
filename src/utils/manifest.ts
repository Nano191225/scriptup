import * as fs from "node:fs";
import * as path from "node:path";
import { error } from "./logger.js";

export interface Manifest {
    format_version: number;
    header: {
        name: string;
        description: string;
        uuid: string;
        version: number[];
        min_engine_version: number[];
    };
    metadata: {
        authors: string[];
        url: string;
    };
    modules: Array<{
        type: string;
        uuid: string;
        version: number[];
        language?: string;
        description?: string;
        entry?: string;
    }>;
    dependencies: Array<{
        module_name: string;
        version: string;
    }>;
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
