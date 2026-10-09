import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { parseCompareOptions } from '../../bench/compare-local-runtime.mjs';
import { displaySavedResults, findLatestComparison, formatResults, registerComparison } from '../../bench/local-results.mjs';
import { terminalStylesEnabled } from '../../bench/local-command.mjs';
import { localFocusReport } from '../../src/bench-viewer/wwwroot/chart/local-focus.js';

function run(runtime, cold, warm, download = 4936829) {
    return {
        manifest: { runtime, preset: 'no-workload', variant: 'no-workload',
            sdkInfo: { sdkVersion: '11.0.100-rc.fixture', bundledFrameworkTfm: 'net11.0', runtimePackVersion: '12.0.0-dev',
                runtimeGitHash: 'a'.repeat(40),
                localRuntime: { source: { checkout: '/recorded/clean-runtime', hash: 'a'.repeat(40), dirty: false } } } },
        results: [{
            meta: { app: 'havit-bootstrap', runtime, preset: 'no-workload', engine: 'chrome', profile: 'desktop',
                benchmarkDateTime: '2026-10-08T12:00:00Z' },
            metrics: { 'time-to-reach-managed-cold': cold + 10000, 'time-to-reach-managed-warm': warm + 10000,
                'download-size-cold': download, 'havit-walkthrough': 9589, 'compile-time': 41999 },
            samples: { 'time-to-reach-managed-cold': 5, 'time-to-reach-managed-warm': 3, 'havit-walkthrough': 1 },
        }, {
            meta: { app: 'havit-bootstrap', runtime, preset: 'no-workload', engine: 'chrome', profile: 'mobile',
                benchmarkDateTime: '2026-10-08T12:00:00Z' },
            metrics: { 'time-to-reach-managed-cold': cold, 'time-to-reach-managed-warm': warm,
                'download-size-cold': 99000000 },
            samples: { 'time-to-reach-managed-cold': 5, 'time-to-reach-managed-warm': 3 },
        }],
    };
}
function data() {
    const after = run('coreclr', 2351, 2192);
    after.manifest.sdkInfo.localRuntime.source = { checkout: '/recorded/runtime with changes',
        hash: 'b'.repeat(40), dirty: true };
    after.manifest.sdkInfo.runtimeGitHash = 'b'.repeat(40);
    return { before: run('coreclr', 404, 217), after,
        monoBefore: run('mono', 268, 179, 4568116), warnings: [] };
}

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'local-results-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const save = async (name, measuredAt, input = data()) => {
        const directory = join(root, 'comparisons', `comparison-${name}`);
        await mkdir(directory, { recursive: true });
        const comparison = { warnings: input.warnings, setup: {} };
        for (const side of ['before', 'after', 'monoBefore']) {
            if (!input[side]) continue;
            const manifestPath = join(directory, `${side}-manifest.json`);
            const statusPath = join(directory, `${side}-status.json`);
            await writeFile(manifestPath, JSON.stringify(input[side].manifest));
            await writeFile(statusPath, JSON.stringify({ status: 'passed' }));
            const results = [];
            for (const [index, row] of input[side].results.entries()) {
                const resultPath = join(directory, `${side}-${index}-result.json`);
                const content = JSON.stringify({ ...row, meta: { ...row.meta, benchmarkDateTime: measuredAt } });
                await writeFile(resultPath, content);
                results.push({ path: resultPath, sha256: createHash('sha256').update(content).digest('hex') });
            }
            comparison[side] = { manifestPath, statusPath, results };
        }
        const path = join(directory, 'comparison.json');
        await writeFile(path, JSON.stringify(comparison));
        return { path, comparison };
    };
    return { root, save };
}

test('summary prints real units, samples, SDK/TFM, the Mono denominator and CoreCLR-only change', () => {
    const text = formatResults(data());
    assert.match(text, /CoreCLR after \/ Mono before - 1/);
    assert.match(text, /CoreCLR after \/ CoreCLR before - 1/);
    assert.match(text, /2,351 ms/);
    assert.match(text, /268 ms/);
    assert.match(text, /404 ms/);
    assert.match(text, /\+777\.2% slower/);
    assert.match(text, /\+481\.9% slower/);
    assert.match(text, /4\.937 MB/);
    assert.match(text, /9\.59 s/);
    assert.match(text, /42\.00 s/);
    assert.match(text, /mobile cold 5, warm 3; desktop walkthrough 1/);
    assert.match(text, /Cold startup \(mobile\)/);
    assert.match(text, /Walkthrough \(desktop\)/);
    assert.doesNotMatch(text, /Warm startup|12,351 ms|99\.000 MB/);
    assert.equal((text.match(/Havit \/ chrome \/ NET12 focus/g) ?? []).length, 1);
    assert.match(text, /TFM net11\.0/);
    assert.match(text, /Checkout: \/recorded\/clean-runtime/);
    assert.match(text, /Checkout: \/recorded\/runtime with changes/);
    assert.match(text, new RegExp(`Commit: ${'a'.repeat(40)}`));
    assert.match(text, new RegExp(`Commit: ${'b'.repeat(40)}`));
    assert.match(text, /Uncommitted changes at publish: no \(clean checkout\)/);
    assert.match(text, /Uncommitted changes at publish: yes \(measured with working-tree changes\)/);
});

test('three-way console labels expose the actual interpreter, R2R and composite variants', () => {
    const input = data();
    input.before.manifest.variant = 'aot';
    input.before.manifest.preset = 'aot';
    input.after.manifest.variant = 'composite';
    input.after.manifest.preset = 'aot';
    const text = formatResults(input);
    assert.match(text, /Mono before \(interpreter\)/);
    assert.match(text, /CoreCLR before \(publish\/R2R\)/);
    assert.match(text, /CoreCLR after \(publish\/R2R composite\)/);
    assert.match(text, /CoreCLR after \/ Mono before/);
});

test('console focus metrics use the same mobile/desktop values as the dashboard', () => {
    const input = data();
    const dashboard = localFocusReport({ ...input, schemaVersion: 1, title: 'Fixture',
        createdAt: '2026-10-08T12:00:00Z' });
    const text = formatResults(input);
    assert.equal(dashboard.report.startupProfile, 'mobile');
    assert.equal(dashboard.report.metrics[0].latest.coreclr, 2351);
    assert.match(text, /2,351 ms/);
    assert.equal(dashboard.report.metrics[2].latest.coreclr, 4936829);
    assert.match(text, /4\.937 MB/);
    assert.doesNotMatch(text, /12,351 ms|99\.000 MB|Warm startup/);
});

test('comparison columns lead every metric row and their definitions appear below the table', () => {
    const text = formatResults(data(), { bold: false, color: false });
    assert.match(text, /^NET12 focus\s+CoreCLR change\s+Metric\s+Mono before/m);
    assert.match(text, /^\+777\.2% slower\s+\+481\.9% slower\s+Cold startup \(mobile\)/m);
    assert.doesNotMatch(text, /Main change/);
    const footer = text.indexOf('NET12 focus: 100 *');
    assert.ok(footer > text.indexOf('Havit publish (desktop)'));
    assert.ok(footer < text.indexOf('Samples Mono before'));
    assert.ok(text.indexOf('CoreCLR change: 100 *') > footer);
    const withoutMono = formatResults({ before: run('mono', 200, 100), after: run('mono', 150, 100) },
        { bold: false, color: false });
    assert.match(withoutMono, /^NET12 focus\s+Metric/m);
    assert.match(withoutMono, /NET12 focus: 100 \* \(after \/ before - 1\)/);
});

test('absent or nonboolean dirty provenance is reported as unknown, not a clean source', () => {
    const input = data();
    delete input.before.manifest.sdkInfo.localRuntime;
    delete input.before.manifest.sdkInfo.runtimeGitHash;
    input.after.manifest.sdkInfo.localRuntime.source.dirty = 'false';
    const text = formatResults(input);
    assert.match(text, /Checkout: unavailable \(not recorded\)/);
    assert.match(text, /Commit: unavailable \(not recorded\)/);
    assert.equal((text.match(/Uncommitted changes at publish: unknown \(not recorded\)/g) ?? []).length, 2);
});

test('display recovers old checkout paths from saved inputs, never queries the current runtime checkout', async t => {
    const { root, save } = await fixture(t);
    const input = data();
    for (const side of ['before', 'after', 'monoBefore']) {
        input[side].manifest.runDir = join(root, `publish-${side}`);
        delete input[side].manifest.sdkInfo.localRuntime.source.checkout;
        await mkdir(input[side].manifest.runDir);
        await writeFile(join(input[side].manifest.runDir, 'inputs.json'),
            JSON.stringify({ local: { runtimeRepo: `/no-longer-existing/${side} worktree` } }));
    }
    const { path, comparison } = await save('legacy-paths', '2026-10-08T12:00:00Z', input);
    const output = [];
    await displaySavedResults(path, text => output.push(text));
    for (const side of ['before', 'after', 'monoBefore']) {
        assert.ok(output[0].includes(`Checkout: /no-longer-existing/${side} worktree`));
    }
    assert.match(output[0], /Uncommitted changes at publish: yes \(measured with working-tree changes\)/);
    assert.match(output[0], new RegExp(`Commit: ${'b'.repeat(40)}`));
    const result = spawnSync(process.execPath, [resolve('bench/compare-local-runtime.mjs'), '--display-results', path], {
        encoding: 'utf8', env: { ...process.env, PATH: '' }, timeout: 15000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Checkout: \/no-longer-existing\/after worktree/);
    await rm(join(input.after.manifest.runDir, 'inputs.json'));
    const missing = [];
    await displaySavedResults(path, text => missing.push(text));
    assert.match(missing[0], /Checkout: unavailable \(not recorded\)/);
    assert.match(missing[0], /Uncommitted changes at publish: yes/);
    assert.equal(existsSync(comparison.after.manifestPath), true);
    await writeFile(join(input.after.manifest.runDir, 'inputs.json'), '{invalid');
    await assert.rejects(displaySavedResults(path), SyntaxError);
});

test('bold emphasizes both change labels and values without disturbing table alignment', () => {
    const plain = formatResults(data(), { bold: false, color: false });
    const styled = formatResults(data(), { bold: true, color: false });
    assert.ok(styled.includes('\u001b[1mNET12 focus\u001b[22m'));
    assert.ok(styled.includes('\u001b[1mCoreCLR change\u001b[22m'));
    assert.ok(styled.includes('\u001b[1m+777.2% slower\u001b[22m'));
    assert.ok(styled.includes('\u001b[1m+481.9% slower\u001b[22m'));
    assert.equal(styled.replace(/\u001b\[[0-9;]*m/g, ''), plain);
    assert.doesNotMatch(plain, /\u001b/);
});

test('change colors mean improvement, regression, and neutral/unavailable while preserving numbers and alignment', () => {
    const input = data();
    input.after.results[0].metrics['havit-walkthrough'] = 1000;
    delete input.after.results[0].metrics['compile-time'];
    const plain = formatResults(input, { bold: false, color: false });
    const styled = formatResults(input, { bold: true, color: true });
    assert.ok(styled.includes('\u001b[31m+777.2% slower\u001b[39m'));
    assert.match(styled, /\u001b\[32m-[0-9.]+% faster\u001b\[39m/);
    assert.ok(styled.includes('\u001b[37munavailable\u001b[39m'));
    assert.equal(styled.replace(/\u001b\[[0-9;]*m/g, ''), plain);
    const neutral = formatResults({ before: run('mono', 200, 100), after: run('mono', 200, 100) },
        { bold: false, color: true });
    assert.ok(neutral.includes('\u001b[37m0.0% same\u001b[39m'));
});

test('terminal styling requires a capable TTY and respects explicit plain-output settings', () => {
    const terminal = { isTTY: true, hasColors: () => true };
    assert.equal(terminalStylesEnabled(terminal, { TERM: 'xterm-256color' }), true);
    assert.equal(terminalStylesEnabled(terminal, { WT_SESSION: 'windows-terminal' }), true);
    assert.equal(terminalStylesEnabled({ ...terminal, isTTY: false }, {}), false);
    assert.equal(terminalStylesEnabled({ ...terminal, hasColors: () => false }, {}), false);
    assert.equal(terminalStylesEnabled(terminal, { TERM: 'dumb' }), false);
    assert.equal(terminalStylesEnabled(terminal, { NO_COLOR: '' }), false);
    assert.equal(terminalStylesEnabled(terminal, { FORCE_COLOR: '0' }), false);
});
test('without Mono a before/after summary shows improvements, not a fabricated Mono control', () => {
    const input = { before: run('mono', 200, 100), after: run('mono', 150, 100), warnings: ['different SDKs'] };
    const text = formatResults(input);
    assert.match(text, /after \/ before - 1/);
    assert.match(text, /-25\.0% faster/);
    assert.match(text, /0\.0% same/);
    assert.match(text, /WARNING: different SDKs/);
    assert.doesNotMatch(text, /CoreCLR change/);
});

test('missing profile rows and invalid values remain unavailable instead of cross-profile fallback', () => {
    const input = data();
    input.before.results = input.before.results.filter(result => result.meta.profile === 'desktop');
    input.after.results[0].metrics['download-size-cold'] = 0;
    const text = formatResults(input);
    assert.match(text, /chrome\/desktop/);
    assert.match(text, /chrome\/mobile/);
    assert.match(text, /unavailable/);
    assert.match(text, /row unavailable/);
    input.after.results.push(input.after.results[0]);
    assert.throws(() => formatResults(input), /Duplicate saved/);
});

test('display-only accepts optional file and scoped latest selection but rejects build options', () => {
    assert.equal(parseCompareOptions(['--display-results'])['display-results'], '');
    assert.equal(parseCompareOptions(['--display-results', '/saved/comparison.json'])['display-results'], '/saved/comparison.json');
    assert.equal(parseCompareOptions(['--display-results', '--output', '/saved']).resultsOutput, '/saved');
    assert.throws(() => parseCompareOptions(['--display-results', '--runtime-repo', '/source']), /cannot be combined/);
    assert.throws(() => parseCompareOptions(['--display-results', '--', '--warm-runs', '2']), /cannot be combined/);
});

test('latest result selection uses measurement time, not file modification order', async t => {
    const { root, save } = await fixture(t);
    const newer = await save('newer', '2026-10-08T12:00:00Z');
    await save('older-written-last', '2026-10-07T12:00:00Z');
    assert.equal(await findLatestComparison(join(root, 'comparisons')), newer.path);
    await assert.rejects(findLatestComparison(join(root, 'missing')), /No measured comparisons found/);
});

test('registered custom outputs and older artifact comparison roots are discovered without source-tree traversal', async t => {
    const { root, save } = await fixture(t);
    const first = await save('first', '2026-10-07T12:00:00Z');
    const latest = await save('latest', '2026-10-08T12:00:00Z');
    const artifacts = join(root, 'artifacts');
    await mkdir(join(artifacts, 'proof', 'comparisons', 'comparison-old'), { recursive: true });
    await writeFile(join(artifacts, 'proof', 'comparisons', 'comparison-old', 'comparison.json'),
        await readFile(first.path, 'utf8'));
    await registerComparison(latest.path, artifacts);
    assert.equal(await findLatestComparison(undefined, artifacts), latest.path);
});

test('removed indexed comparisons are warned and skipped without hiding malformed or missing result evidence', async t => {
    const { root, save } = await fixture(t);
    const old = await save('removed', '2026-10-07T12:00:00Z');
    const latest = await save('latest', '2026-10-08T12:00:00Z');
    const artifacts = join(root, 'artifacts');
    await registerComparison(old.path, artifacts);
    await registerComparison(latest.path, artifacts);
    await rm(old.path);
    const warnings = [];
    assert.equal(await findLatestComparison(undefined, artifacts, warning => warnings.push(warning)), latest.path);
    assert.ok(warnings[0].includes(old.path));
    await rm(latest.comparison.after.results[0].path);
    await assert.rejects(findLatestComparison(undefined, artifacts, () => {}), /ENOENT/);
    await rm(latest.path);
    await assert.rejects(findLatestComparison(undefined, artifacts, () => {}), /No measured comparisons found/);
});

test('display rejects failed status and changed metric evidence rather than reporting stale success', async t => {
    const { save } = await fixture(t);
    const { path, comparison } = await save('saved', '2026-10-08T12:00:00Z');
    const output = [];
    await displaySavedResults(path, text => output.push(text));
    assert.match(output[0], /777\.2% slower/);
    await writeFile(comparison.after.statusPath, '{"status":"failed"}');
    await assert.rejects(displaySavedResults(path), /did not pass/);
    await writeFile(comparison.after.statusPath, '{"status":"passed"}');
    await writeFile(comparison.after.results[0].path, '{"metrics":{}}');
    await assert.rejects(displaySavedResults(path), /evidence changed/);
});

test('CLI explicit and latest display bypass all prerequisites/builds and do not create comparison outputs', async t => {
    const { root, save } = await fixture(t);
    const { path } = await save('saved', '2026-10-08T12:00:00Z');
    for (const args of [
        ['--display-results', path],
        ['--display-results', '--output', join(root, 'comparisons')],
    ]) {
        const result = spawnSync(process.execPath, [resolve('bench/compare-local-runtime.mjs'), ...args], {
            encoding: 'utf8', env: { ...process.env, PATH: '' }, timeout: 15000,
        });
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /777\.2% slower/);
        assert.match(result.stdout, /Checkout: \/recorded\/runtime with changes/);
        assert.match(result.stdout, new RegExp(`Commit: ${'b'.repeat(40)}`));
        assert.match(result.stdout, /Uncommitted changes at publish: yes/);
        assert.doesNotMatch(result.stdout, /Prerequisite checks|\[RUNNING\]/);
        assert.equal(existsSync(join(root, 'comparisons', '.comparison-lock')), false);
    }
});
