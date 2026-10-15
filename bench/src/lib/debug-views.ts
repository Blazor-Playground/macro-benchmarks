import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { digest, validateDebugBatch, type DebugBatch } from './debug-results.js';

export interface DebugViewIndex {
    schemaVersion: 1;
    generation: string;
    lastUpdated: string;
    apps: { id: string; file: string }[];
}

export async function readDebugResults(dir: string): Promise<DebugBatch[]> {
    const results: DebugBatch[] = [];
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) results.push(...await readDebugResults(path));
        else if (entry.isFile() && entry.name.startsWith('debug-') && entry.name.endsWith('.json')) {
            const value: unknown = JSON.parse(await readFile(path, 'utf8'));
            if (value && typeof value === 'object' && 'kind' in value && value.kind === 'debug-view') continue;
            validateDebugBatch(value);
            results.push(value);
        }
    }
    return results;
}

export async function writeDebugViews(results: readonly DebugBatch[], dir: string): Promise<void> {
    if (!results.length) return;
    const all = new Map<string, DebugBatch>();
    let previous: DebugViewIndex | null = null;
    try { previous = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (previous) {
        if (previous.schemaVersion !== 1 || !Array.isArray(previous.apps)) throw new Error('Invalid previous Debug view index');
        for (const app of previous.apps) {
            if (!/^generations\/[a-f0-9]{64}\/[a-z0-9-]+\.json$/.test(app.file)) throw new Error('Invalid Debug view resource path');
            const payload = JSON.parse(await readFile(join(dir, app.file), 'utf8'));
            if (payload.generation !== previous.generation || payload.app !== app.id || !Array.isArray(payload.batches)) {
                throw new Error('Debug publication is inconsistent');
            }
            for (const batch of payload.batches) { validateDebugBatch(batch); all.set(batch.id, batch); }
        }
    }
    for (const batch of results) {
        validateDebugBatch(batch);
        const existing = all.get(batch.id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(batch)) {
            throw new Error(`Conflicting Debug batch identity ${batch.id}; use a new run ID`);
        }
        all.set(batch.id, batch);
    }
    const batches = [...all.values()].sort((a, b) => a.id.localeCompare(b.id));
    const generation = digest(JSON.stringify(batches));
    const apps = [...new Set(batches.map(b => b.app))].sort();
    const target = join(dir, 'generations', generation);
    await mkdir(target, { recursive: true });
    for (const app of apps) {
        await writeFile(join(target, `${app}.json`), JSON.stringify({
            kind: 'debug-view', schemaVersion: 1, generation, app, batches: batches.filter(b => b.app === app),
        }) + '\n');
    }
    const index: DebugViewIndex = {
        schemaVersion: 1, generation, lastUpdated: new Date().toISOString(),
        apps: apps.map(id => ({ id, file: `generations/${generation}/${id}.json` })),
    };
    const temp = resolve(dir, `index-${generation}.tmp`);
    await writeFile(temp, JSON.stringify(index, null, 2) + '\n');
    await rename(temp, join(dir, 'index.json'));
}
