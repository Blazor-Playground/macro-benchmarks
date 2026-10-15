import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { debugBatch } from '../../tests/helpers/debug-fixture.mjs';
import { validateDebugBatch, type DebugBatch } from '../src/lib/debug-results.js';
import { writeDebugViews } from '../src/lib/debug-views.js';

test('Debug views retain per-cell evidence and publish immutable app generations', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'debug-views-'));
    try {
        const batch: DebugBatch = debugBatch();
        validateDebugBatch(batch);
        await writeDebugViews([batch], dir);
        const first = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8'));
        const payload = JSON.parse(await readFile(join(dir, first.apps[0].file), 'utf8'));
        assert.equal(payload.kind, 'debug-view');
        assert.deepEqual(payload.batches, [batch]);
        const other: DebugBatch = debugBatch('empty-blazor');
        await writeDebugViews([other], dir);
        const next = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8'));
        assert.equal(next.apps.length, 2);
        assert.notEqual(first.generation, next.generation);
        assert.equal(JSON.parse(await readFile(join(dir, first.apps[0].file), 'utf8')).generation, first.generation);
        batch.smoke = true;
        await assert.rejects(() => writeDebugViews([batch], dir), /Conflicting/);
    } finally { await rm(dir, { recursive: true }); }
});

test('failed hot reload cannot masquerade as an applied in-place update', () => {
    const batch: DebugBatch = debugBatch();
    const attempt = batch.runtimes.mono.measurements['debug-hot-reload-edit-to-render'].attempts[0];
    attempt.navigations = 1;
    assert.throws(() => validateDebugBatch(batch), /Invalid/);
});

test('raw validation accepts current DevLoop and earlier clean-Debug identity without accepting tuned records', () => {
    const current: DebugBatch = debugBatch();
    assert.equal(current.preset, 'dev-loop');
    validateDebugBatch(current);
    current.preset = 'debug';
    validateDebugBatch(current);
    current.methodology = 'tuned-dev-loop';
    assert.throws(() => validateDebugBatch(current), /Invalid/);
});

test('full local paired provenance does not masquerade as controlled CI', () => {
    const batch: DebugBatch = debugBatch();
    batch.environment.controlled = false;
    batch.environment.comparisonScope = 'local-paired';
    validateDebugBatch(batch);
    batch.environment.controlled = true;
    assert.throws(() => validateDebugBatch(batch), /Invalid/);
});
