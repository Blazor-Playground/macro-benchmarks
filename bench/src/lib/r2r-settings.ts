import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BuildManifestEntry } from '../context.js';
import { PGO_PRESETS, type Preset } from '../enums.js';

export function r2rSettings(project: string, compositeValue: string): { pgo: boolean; composite: boolean } {
    const composite = compositeValue.trim().toLowerCase();
    if (composite !== '' && composite !== 'true' && composite !== 'false') {
        throw new Error(`Invalid evaluated PublishReadyToRunComposite value: ${compositeValue}`);
    }
    return {
        pgo: /<Target\s+Name="_WasmCoreClrConfigureReadyToRunPgo"/.test(project),
        composite: composite === 'true',
    };
}

export async function readyToRunMetadata(preset: Preset, packagesDir: string, repoRoot: string, composite: boolean): Promise<NonNullable<BuildManifestEntry['readyToRun']>> {
    const metadata: NonNullable<BuildManifestEntry['readyToRun']> = {
        compilation: PGO_PRESETS.has(preset) ? 'partial-pgo' : 'full',
        composite,
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
