import { getVersions, extractMcVersion } from "../utils/versions.js";
import * as logger from "../utils/logger.js";

export async function manual(version: string): Promise<void> {
    const versions = await getVersions("@minecraft/server");

    // Exact match
    const exact = versions.find((v) => v === version);
    if (exact) {
        logger.info(`Found exact version: ${exact}`);
        return;
    }

    // Partial match
    const partial = versions.find((v) => v.includes(version));
    if (!partial) {
        logger.error(`Version not found: ${version}`);
        process.exit(1);
    }

    const mcVersion = extractMcVersion(partial);
    logger.info(`Found version: ${mcVersion}`);

    const serverVersions = await getVersions("@minecraft/server");
    const server = serverVersions.find((v) => v.includes(mcVersion));

    const serverUiVersions = await getVersions("@minecraft/server-ui");
    const serverUi = serverUiVersions.find((v) => v.includes(mcVersion));

    if (server) logger.info(`Server version: ${server}`);
    if (serverUi) logger.info(`Server UI version: ${serverUi}`);
}
