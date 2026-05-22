import { readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Find a .nupkg file in a directory by package ID prefix.
 */
export async function findNupkg(dir: string, prefix: string): Promise<string | null> {
    if (!existsSync(dir)) return null;
    const files = await readdir(dir);
    const match = files.find(f => f.toLowerCase().startsWith(prefix.toLowerCase()) && f.endsWith('.nupkg'));
    return match ? join(dir, match) : null;
}

/**
 * Parse the version string from a .nupkg filename given the known package ID prefix.
 * e.g. "Microsoft.NETCore.App.Runtime.Mono.browser-wasm.11.0.0-dev.nupkg" → "11.0.0-dev"
 */
export function parseVersionFromNupkg(nupkgPath: string, prefix: string): string {
    const filename = basename(nupkgPath, '.nupkg');
    return filename.slice(prefix.length + 1); // +1 for the dot separator
}
