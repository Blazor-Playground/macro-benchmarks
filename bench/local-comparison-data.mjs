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
    const data = {
        schemaVersion: 1,
        title: comparison.title ?? 'Local runtime before/after comparison',
        note: comparison.note,
        createdAt: new Date().toISOString(),
        setup: comparison.setup,
        warnings: comparison.warnings,
        before: await loadRun(comparison.before),
        after: await loadRun(comparison.after),
        monoBefore: comparison.monoBefore ? await loadRun(comparison.monoBefore) : undefined,
    };
    if (comparison.beforeHistory !== undefined) {
        if (!Array.isArray(comparison.beforeHistory) || !comparison.beforeHistory.length) {
            throw new Error('Invalid comparison history records.');
        }
        const seen = new Set();
        data.beforeHistory = [];
        for (const entry of comparison.beforeHistory) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.day) || !Number.isFinite(Date.parse(entry.day)) ||
                new Date(entry.day).toISOString().slice(0, 10) !== entry.day || seen.has(entry.day) ||
                !/^[a-f0-9]{40}$/i.test(entry.commit) || !['passed', 'failed', 'pending', 'running'].includes(entry.status)) {
                throw new Error('Invalid or duplicate comparison history entry.');
            }
            seen.add(entry.day);
            const item = { day: entry.day, commit: entry.commit, status: entry.status, error: entry.error };
            for (const side of ['before', 'monoBefore']) {
                if (!entry[side]) continue;
                const run = await loadRun(entry[side]);
                if (run.manifest.sdkInfo.runtimeGitHash !== entry.commit ||
                    run.manifest.sdkInfo.localRuntime?.source?.dirty !== false ||
                    run.manifest.runtime !== (side === 'before' ? data.after.manifest.runtime : 'mono') ||
                    (side === 'before' && run.manifest.variant !== data.after.manifest.variant)) {
                    throw new Error(`Historical ${side} does not match its clean source snapshot: ${entry.day}`);
                }
                item[side] = run;
            }
            if (entry.status === 'passed' && !item.before) throw new Error(`Passed history has no before evidence: ${entry.day}`);
            data.beforeHistory.push(item);
        }
    }
    return data;
}

export async function writeLocalComparisonData(comparison, path) {
    const data = await loadLocalComparisonData(comparison);
    await writeFile(path, JSON.stringify(data, null, 2) + '\n');
    return data;
}
