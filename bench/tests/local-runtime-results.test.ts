import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateMeasurementResults } from '../src/scripts/measure-local-runtime.js';

const requested = { coldRuns: 2, warmRuns: 1, walkthroughRuns: 1 };

function result(engine: string, profile: string) {
    return {
        meta: { engine, profile },
        metrics: { 'time-to-reach-managed-cold': 200, 'time-to-reach-managed-warm': 100,
            ...(engine === 'chrome' && profile === 'desktop' ? { 'havit-walkthrough': 500 } : {}) },
        samples: { 'time-to-reach-managed-cold': 2, 'time-to-reach-managed-warm': 1,
            ...(engine === 'chrome' && profile === 'desktop' ? { 'havit-walkthrough': 1 } : {}) },
    };
}

async function fixture(t: { after: (cleanup: () => Promise<void>) => void }) {
    const root = await mkdtemp(join(tmpdir(), 'local-runtime-results-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    return root;
}

test('complete Chrome desktop/mobile and Firefox desktop startup rows are accepted with supported walkthroughs only', async t => {
    const root = await fixture(t);
    const pairs = new Set(['chrome/desktop', 'chrome/mobile', 'firefox/desktop']);
    for (const pair of pairs) {
        const [engine, profile] = pair.split('/');
        await writeFile(join(root, `${engine}-${profile}.json`), JSON.stringify(result(engine, profile)));
    }
    await validateMeasurementResults(root, pairs, requested);
});

test('Firefox-only and mobile-only startup measurements do not require unsupported walkthroughs', async t => {
    const root = await fixture(t);
    for (const [engine, profile] of [['firefox', 'desktop'], ['chrome', 'mobile']]) {
        await writeFile(join(root, 'result.json'), JSON.stringify(result(engine, profile)));
        await validateMeasurementResults(root, new Set([`${engine}/${profile}`]), requested);
    }
});

test('failed or incomplete Chrome desktop navigation and incomplete startup still fail validation', async t => {
    const root = await fixture(t);
    const desktop = result('chrome', 'desktop');
    await writeFile(join(root, 'result.json'), JSON.stringify({
        ...desktop, metrics: { ...desktop.metrics, 'havit-walkthrough': 0 },
    }));
    await assert.rejects(validateMeasurementResults(root, new Set(['chrome/desktop']), requested), /walkthrough failed/);
    await writeFile(join(root, 'result.json'), JSON.stringify({
        ...desktop, samples: { ...desktop.samples, 'havit-walkthrough': 0 },
    }));
    await assert.rejects(validateMeasurementResults(root, new Set(['chrome/desktop']), requested), /Incomplete/);
    const mobile = result('chrome', 'mobile');
    await writeFile(join(root, 'result.json'), JSON.stringify({
        ...mobile, samples: { ...mobile.samples, 'time-to-reach-managed-cold': 1 },
    }));
    await assert.rejects(validateMeasurementResults(root, new Set(['chrome/mobile']), requested), /Incomplete/);
});

test('matching file counts cannot disguise duplicate or wrong-profile browser results', async t => {
    const root = await fixture(t);
    for (const name of ['first', 'duplicate']) {
        await writeFile(join(root, `${name}.json`), JSON.stringify(result('chrome', 'desktop')));
    }
    await assert.rejects(validateMeasurementResults(root, new Set(['chrome/desktop', 'chrome/mobile']), requested), /duplicate/);
    await rm(join(root, 'duplicate.json'));
    await assert.rejects(validateMeasurementResults(root, new Set(['firefox/desktop']), requested), /Unexpected/);
});
