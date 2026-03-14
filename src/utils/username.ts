import { spawnSync } from "node:child_process";

export function getUsername(): string | undefined {
    try {
        const gitNameResult = spawnSync("git", ["config", "user.name"], {
            encoding: "utf-8",
            shell: true,
        });
        if (gitNameResult.status === 0) {
            const gitName = gitNameResult.stdout.trim();
            if (gitName) return gitName;
        }
    } catch {}
}
