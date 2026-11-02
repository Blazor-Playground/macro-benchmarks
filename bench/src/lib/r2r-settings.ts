import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BuildManifestEntry } from '../context.js';
import { COMPOSITE_PRESETS, PGO_PRESETS, type Preset } from '../enums.js';

export function r2rCapabilities(project: string): { pgo: boolean; composite: boolean } {
    return {
        pgo: /<Target\s+Name="_WasmCoreClrConfigureReadyToRunPgo"/.test(project),
        composite: /<Target\s+Name="_WasmCoreClrValidateCompositeTasks"/.test(project),
    };
}

export async function readyToRunMetadata(preset: Preset, packagesDir: string, repoRoot: string): Promise<NonNullable<BuildManifestEntry['readyToRun']>> {
    const metadata: NonNullable<BuildManifestEntry['readyToRun']> = {
        compilation: PGO_PRESETS.has(preset) ? 'partial-pgo' : 'full',
        composite: COMPOSITE_PRESETS.has(preset),
    };
    if (PGO_PRESETS.has(preset)) {
        const versions = await readFile(join(repoRoot, 'src', 'versions.props'), 'utf8');
        const version = versions.match(/<BrowserWasmMibcProfileVersion>([^<]+)<\/BrowserWasmMibcProfileVersion>/)?.[1];
        if (!version) throw new Error('BrowserWasmMibcProfileVersion is missing from src/versions.props');
        const file = 'DotNet_Blazor_Wasm.mibc';
        const profile = await readFile(join(packagesDir, 'optimization.browser-wasm.mibc.runtime', version, 'data', file));
        metadata.profile = {
            package: 'optimization.browser-wasm.MIBC.Runtime', version, file,
            sha256: createHash('sha256').update(profile).digest('hex'),
        };
    }
    return metadata;
}
