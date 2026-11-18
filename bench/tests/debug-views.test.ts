import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { debugBatch, mono11DebugBatch } from '../../tests/helpers/debug-fixture.mjs';
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

test('raw validation accepts optional commit provenance and rejects malformed values', () => {
    const current: DebugBatch = debugBatch();
    validateDebugBatch(current);
    for (const key of ['sdkCommitDateTime', 'runtimeCommitDateTime', 'vmrCommitDateTime'] as const) {
        current.sdk[key] = 'not-a-timestamp';
        assert.throws(() => validateDebugBatch(current), /Invalid/);
        delete current.sdk[key];
        validateDebugBatch(current);
    }
    current.sdk.runtimePackVersion = '';
    assert.throws(() => validateDebugBatch(current), /Invalid/);
    delete current.sdk.runtimePackVersion;
    validateDebugBatch(current);
    current.sdk.runtimeHash = 'not-a-hash';
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

test('raw Mono11 fallback retains distinct SDKs and rejects contradictory per-attempt provenance', async () => {
    const batch: DebugBatch = mono11DebugBatch();
    validateDebugBatch(batch);
    const dir = await mkdtemp(join(tmpdir(), 'debug-mono11-'));
    try {
        await writeDebugViews([batch], dir);
        const index = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8'));
        const payload = JSON.parse(await readFile(join(dir, index.apps[0].file), 'utf8'));
        assert.deepEqual(payload.batches[0].monoFallback, batch.monoFallback);
        assert.equal(payload.batches[0].runtimes.mono.sdk.version, '11.0.100-rc.3.26522.148');
        batch.runtimes.mono.measurements['debug-first-run-to-first-render'].attempts[0].properties!.NETCoreSdkVersion = '12.0.100';
        assert.throws(() => validateDebugBatch(batch), /Invalid/);
    } finally { await rm(dir, { recursive: true }); }
});
