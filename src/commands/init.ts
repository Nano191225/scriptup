import * as logger from "../utils/logger.js";
import { scaffoldProject } from "../utils/scaffold.js";

interface InitCommandOptions {
    workflow?: boolean;
}

export async function init(targetDir = process.cwd(), options: InitCommandOptions = {}): Promise<void> {
    await scaffoldProject({
        targetDir,
        workflow: options.workflow,
    });

    logger.info("Initialization complete.");
}
