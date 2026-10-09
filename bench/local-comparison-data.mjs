import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

async function loadRun(record) {
    const status = JSON.parse(await readFile(record.statusPath, 'utf8'));
    if (status.status !== 'passed') throw new Error(`Comparison measurement did not pass: ${record.statusPath}`);
    const manifest = JSON.parse(await readFile(record.manifestPath, 'utf8'));
    const results = [];
    for (const file of record.results) {
        const text = await readFile(file.path, 'utf8');
        if (createHash('sha256').update(text).digest('hex') !== file.sha256) {
            throw new Error(`Comparison evidence changed: ${file.path}`);
        }
        results.push(JSON.parse(text));
    }
    let checkout = manifest.sdkInfo?.localRuntime?.source?.checkout;
    if (checkout === undefined && typeof manifest.runDir === 'string') {
        // Older manifests recorded the checkout only in the saved publish inputs.
        let inputs;
        try {
            inputs = await readFile(join(manifest.runDir, 'inputs.json'), 'utf8');
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        if (inputs !== undefined) checkout = JSON.parse(inputs).local?.runtimeRepo;
    }
    if (checkout !== undefined && (typeof checkout !== 'string' || !checkout)) {
        throw new Error(`Invalid saved runtime checkout path: ${record.manifestPath}`);
    }
    return { manifest, results, checkout };
}

export async function loadLocalComparisonData(comparison) {
    return {
        schemaVersion: 1,
        title: 'Local runtime before/after comparison',
        createdAt: new Date().toISOString(),
        setup: comparison.setup,
        warnings: comparison.warnings,
        before: await loadRun(comparison.before),
        after: await loadRun(comparison.after),
        monoBefore: comparison.monoBefore ? await loadRun(comparison.monoBefore) : undefined,
    };
}

export async function writeLocalComparisonData(comparison, path) {
    const data = await loadLocalComparisonData(comparison);
    await writeFile(path, JSON.stringify(data, null, 2) + '\n');
    return data;
}
