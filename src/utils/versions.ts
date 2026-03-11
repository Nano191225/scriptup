export interface VersionInfo {
    versions: string[];
}

export async function getVersions(packageName: string): Promise<string[]> {
    const url = `https://registry.npmjs.org/${packageName}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch versions for ${packageName}: ${response.statusText}`);
    }

    const data = (await response.json()) as { versions: Record<string, unknown> };
    const versions = Object.keys(data.versions).reverse();

    versions.sort((a, b) => {
        const priority = (v: string) => {
            if (v.includes("stable")) return 0;
            if (v.includes("preview")) return 1;
            return 2;
        };
        return priority(a) - priority(b);
    });

    return versions;
}

export function extractMcVersion(version: string): string {
    const firstDash = version.indexOf("-");
    if (firstDash === -1) return version;

    const afterDash = version.substring(firstDash);
    const firstDot = afterDash.indexOf(".");
    if (firstDot === -1) return version;

    const start = firstDash + firstDot + 1;
    const rest = version.substring(start);
    const nextDash = rest.indexOf("-");
    return nextDash === -1 ? rest : rest.substring(0, nextDash);
}

export function extractModuleVersion(version: string): string {
    const firstDash = version.indexOf("-");
    if (firstDash === -1) return version;

    const afterDash = version.substring(firstDash);
    const firstDot = afterDash.indexOf(".");
    if (firstDot === -1) return version;

    return version.substring(0, firstDash + firstDot);
}
