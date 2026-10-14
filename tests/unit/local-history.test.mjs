import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { compare, measureBefore, measurementOptions, measurementRecord, parseCompareOptions } from '../../bench/compare-local-runtime.mjs';
import { collectRecentBefore, selectRecentCommits } from '../../bench/local-history.mjs';
import { formatResults, loadCurrentComparisonData, readCurrentComparison, readLegacyComparison, registerComparison } from '../../bench/local-results.mjs';
import { runCommand } from '../../bench/local-command.mjs';
import { quickStart } from '../../bench/runtime-bench.mjs';
import { localFocusReport } from '../../src/bench-viewer/wwwroot/chart/local-focus.js';

const now = () => new Date('2026-10-14T12:00:00Z');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'local-history-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const runtimeRepo = join(root, 'changed-runtime');
    const output = join(root, 'comparisons');
    const artifacts = join(root, 'artifacts');
    await mkdir(runtimeRepo);
    git(runtimeRepo, 'init', '--quiet', '--initial-branch=main');
    git(runtimeRepo, 'config', 'user.name', 'Fixture');
    git(runtimeRepo, 'config', 'user.email', 'fixture@example.invalid');
    git(runtimeRepo, 'remote', 'add', 'origin', 'https://github.com/dotnet/runtime.git');
    await writeFile(join(runtimeRepo, 'global.json'), '{"sdk":{"version":"12.0.100"}}');
    await writeFile(join(runtimeRepo, '.gitignore'), 'artifacts/\n');
    await writeFile(join(runtimeRepo, 'build.sh'), '#!/usr/bin/env bash\nprintf "fixture native build %s\\n" "$*"\n');
    await writeFile(join(runtimeRepo, 'build.cmd'), '@echo fixture native build %*\r\n');
    const commits = {};
    for (const day of ['06', '07', '08', '09', '10', '12', '13', '14']) {
        await writeFile(join(runtimeRepo, 'source.txt'), `${day}\n`);
        git(runtimeRepo, 'add', '.');
        const timestamp = `2026-10-${day}T10:00:00Z`;
        execFileSync('git', ['-C', runtimeRepo, 'commit', '--quiet', '-m', `day-${day}`], {
            env: { ...process.env, GIT_AUTHOR_DATE: timestamp, GIT_COMMITTER_DATE: timestamp },
        });
        commits[`2026-10-${day}`] = git(runtimeRepo, 'rev-parse', 'HEAD');
    }
    git(runtimeRepo, 'update-ref', 'refs/remotes/origin/main', commits['2026-10-14']);
    git(runtimeRepo, 'checkout', '--quiet', '-b', 'side-branch', commits['2026-10-10']);
    await writeFile(join(runtimeRepo, 'side.txt'), 'not first-parent main\n');
    git(runtimeRepo, 'add', '.');
    execFileSync('git', ['-C', runtimeRepo, 'commit', '--quiet', '-m', 'side branch'], {
        env: { ...process.env, GIT_AUTHOR_DATE: '2026-10-11T23:00:00Z', GIT_COMMITTER_DATE: '2026-10-11T23:00:00Z' },
    });
    git(runtimeRepo, 'checkout', '--quiet', 'main');
    await writeFile(join(runtimeRepo, 'source.txt'), 'staged contributor edit\n');
    git(runtimeRepo, 'add', 'source.txt');
    await writeFile(join(runtimeRepo, 'source.txt'), 'unstaged contributor edit\n');
    await writeFile(join(runtimeRepo, 'untracked.txt'), 'keep this\n');
    const snapshot = () => ({
        head: git(runtimeRepo, 'rev-parse', 'HEAD'), status: git(runtimeRepo, 'status', '--porcelain'),
        diff: git(runtimeRepo, 'diff', '--binary'), index: git(runtimeRepo, 'diff', '--cached', '--binary'),
    });
    const original = snapshot();
    const options = parseCompareOptions(['--runtime-repo', runtimeRepo, '--output', output,
        '--include-mono-before', '--', '--system-chrome', '--profile', 'desktop,mobile']);
    let measured = 0;
    let failCommit;
    const publishes = [];
    const builds = [];
    const publishRuntime = async (options, sourceOverride) => {
        const commit = git(options['runtime-repo'], 'rev-parse', 'HEAD');
        publishes.push({ runtime: options.runtime, checkout: options['runtime-repo'], commit });
        if (failCommit === commit && options.runtime === 'coreclr') throw new Error('fixture unsupported composite snapshot');
        const runDir = join(root, `measured-${++measured}`);
        const resultsDir = join(runDir, 'results');
        await mkdir(resultsDir, { recursive: true });
        await mkdir(join(runDir, 'logs'));
        const preset = options.variant === 'no-workload' ? 'no-workload' : 'aot';
        const manifestPath = join(runDir, 'manifest.json');
        await writeFile(manifestPath, JSON.stringify({
            runDir, runtime: options.runtime, preset, variant: options.variant, configuration: options.configuration,
            sdkInfo: { sdkVersion: '12.0.100', runtimePackVersion: '12.0.0-fixture', bundledFrameworkTfm: 'net12.0',
                runtimeGitHash: commit, localRuntime: { source: sourceOverride ?? {
                    checkout: options['runtime-repo'], hash: commit,
                    dirty: git(options['runtime-repo'], 'status', '--porcelain') !== '',
                } } },
        }));
        for (const profile of ['desktop', 'mobile']) {
            await writeFile(join(resultsDir, `${profile}.json`), JSON.stringify({
                meta: { app: 'havit-bootstrap', engine: 'chrome', profile, runtime: options.runtime,
                    preset, benchmarkDateTime: '2026-10-14T12:00:00Z' },
                metrics: { 'time-to-reach-managed-cold': 500, 'time-to-reach-managed-warm': 250,
                    'havit-walkthrough': 1000, 'download-size-cold': 5000000, 'compile-time': 10000 },
            }));
        }
        await writeFile(join(runDir, 'logs', 'measurement-1.status.json'), JSON.stringify({ status: 'passed', resultsDir }));
        return manifestPath;
    };
    await mkdir(output);
    const currentPath = join(output, 'initial-comparison.json');
    const setup = { configuration: 'Release', sdk: null, tfm: null, aspnetVersion: null, excludedSources: [],
        measurement: { ...measurementOptions(options.measureArgs), verbose: undefined }, benchmark: 'fixture-benchmark' };
    const clean = { checkout: runtimeRepo, hash: original.head, dirty: false };
    const before = await measurementRecord(await publishRuntime(options, clean));
    const monoBefore = await measurementRecord(await publishRuntime({ ...options, runtime: 'mono', variant: 'no-workload' }, clean));
    const after = await measurementRecord(await publishRuntime(options));
    await writeFile(currentPath, JSON.stringify({ setup, runtimeRepo, warnings: [], before, monoBefore, after }));
    const register = path => registerComparison(path, artifacts);
    await register(currentPath);
    publishes.length = 0;
    const measurementDependencies = {
        getBrowserIdentity: async () => ({ chrome: 'fixture-browser' }),
        getBenchmarkDigest: async () => 'fixture-benchmark',
        getPreviousComparison: async () => readCurrentComparison(artifacts),
        registerResult: register,
        publishRuntime,
        run: async (command, args, options) => {
            if (command !== 'git') builds.push(options.cwd);
            return await runCommand(command, args, { ...options, writeLine: () => {} });
        },
    };
    const dependencies = { now, getCurrent: () => readCurrentComparison(artifacts),
        getLegacy: () => readLegacyComparison(artifacts), register, measurementDependencies };
    return { root, runtimeRepo, output, artifacts, options, dependencies, measurementDependencies,
        commits, snapshot, original, publishes, builds, initialAfter: after,
        fail: commit => { failCommit = commit; } };
}

test('daily selection includes today, respects UTC boundaries and invocation cutoff, and ignores side branches', async t => {
    const f = await fixture(t);
    const selection = selectRecentCommits(f.runtimeRepo, 7, now());
    assert.equal(selection.selectedMain, f.commits['2026-10-14']);
    assert.deepEqual(selection.days.map(entry => entry.day), ['2026-10-08', '2026-10-09', '2026-10-10',
        '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
    assert.equal(selection.days[3].commit, f.commits['2026-10-10']);
    const early = selectRecentCommits(f.runtimeRepo, 1, new Date('2026-10-14T09:59:59Z'));
    assert.equal(early.days[0].commit, f.commits['2026-10-13']);
    const midnight = selectRecentCommits(f.runtimeRepo, 2, new Date('2026-10-14T00:00:00Z'));
    assert.equal(midnight.days[0].commit, f.commits['2026-10-13']);
    assert.throws(() => selectRecentCommits(f.runtimeRepo, 20, now()), /No first-parent source snapshot/);
    assert.throws(() => selectRecentCommits(f.runtimeRepo, Number.MAX_SAFE_INTEGER, now()), /outside supported UTC/);
    await writeFile(join(f.runtimeRepo, '.git', 'shallow'), `${f.commits['2026-10-14']}\n`);
    assert.throws(() => selectRecentCommits(f.runtimeRepo, 7, now()), /unshallow/);
    assert.equal(selectRecentCommits(f.runtimeRepo, 1, now()).days[0].commit, f.commits['2026-10-14']);
});

test('history uses two reusable clean source clones, caches repeated commits, appends dates and preserves after/source', async t => {
    const f = await fixture(t);
    const first = await collectRecentBefore(f.options, 7, f.dependencies);
    assert.equal(first.beforeHistory.length, 7);
    assert.equal(f.publishes.length, 12);
    assert.equal(new Set(f.publishes.map(call => call.checkout)).size, 2);
    assert.ok(f.publishes.every(call => call.checkout !== f.runtimeRepo));
    assert.deepEqual(f.snapshot(), f.original);
    const saved = await readCurrentComparison(f.artifacts);
    assert.deepEqual(saved.comparison.after, f.initialAfter);
    const ui = localFocusReport(await loadCurrentComparisonData(f.artifacts));
    assert.equal(ui.metadata.isHistory, true);
    assert.equal(ui.report.metrics[0].points.length, 7);
    assert.ok(ui.report.metrics[0].fixedReference);
    const measured = f.publishes.length;
    const directories = await readdir(f.output);
    const buildDirectories = directories.filter(name => name.startsWith('before-build-')).length;
    const comparisons = directories.filter(name => name.startsWith('comparison-')).length;
    assert.equal(buildDirectories, 12);
    assert.equal(comparisons, 1);
    await collectRecentBefore(f.options, 7, f.dependencies);
    assert.equal(f.publishes.length, measured);
    const afterRetry = await readdir(f.output);
    assert.equal(afterRetry.filter(name => name.startsWith('before-build-')).length, buildDirectories);
    assert.equal(afterRetry.filter(name => name.startsWith('comparison-')).length, comparisons + 1);
    const repeated = (await readCurrentComparison(f.artifacts)).comparison;
    assert.equal(repeated.historySelections, undefined);
    assert.equal(repeated.historySelection.days.length, 7);
    const extended = await collectRecentBefore(f.options, 8, f.dependencies);
    assert.equal(extended.beforeHistory.length, 8);
    assert.equal(f.publishes.length, measured + 2);
    assert.equal(new Set(f.publishes.map(call => call.checkout)).size, 2);
    assert.deepEqual(f.snapshot(), f.original);
    assert.deepEqual((await readCurrentComparison(f.artifacts)).comparison.after, f.initialAfter);
    const upstream = join(f.root, 'upstream');
    git(f.root, 'clone', '--quiet', f.runtimeRepo, upstream);
    git(upstream, 'config', 'user.name', 'Fixture');
    git(upstream, 'config', 'user.email', 'fixture@example.invalid');
    await writeFile(join(upstream, 'new-main.txt'), 'next day source\n');
    git(upstream, 'add', '.');
    execFileSync('git', ['-C', upstream, 'commit', '--quiet', '-m', 'next day'], {
        env: { ...process.env, GIT_AUTHOR_DATE: '2026-10-15T10:00:00Z', GIT_COMMITTER_DATE: '2026-10-15T10:00:00Z' },
    });
    git(f.runtimeRepo, 'fetch', '--quiet', upstream, 'main:refs/remotes/origin/main');
    const next = await collectRecentBefore(f.options, 7, {
        ...f.dependencies, now: () => new Date('2026-10-15T12:00:00Z'),
    });
    assert.equal(next.beforeHistory.length, 9);
    assert.equal(f.publishes.length, measured + 4);
    assert.equal(new Set(f.publishes.map(call => call.checkout)).size, 2);
    assert.deepEqual(f.snapshot(), f.original);
    assert.deepEqual((await readCurrentComparison(f.artifacts)).comparison.after, f.initialAfter);
    const tip = git(f.runtimeRepo, 'rev-parse', 'refs/remotes/origin/main');
    git(f.runtimeRepo, 'update-ref', 'refs/remotes/origin/main', f.commits['2026-10-10']);
    await assert.rejects(collectRecentBefore(f.options, 7, {
        ...f.dependencies, now: () => new Date('2026-10-15T12:00:00Z'),
    }), /no saved dates were replaced/);
    git(f.runtimeRepo, 'update-ref', 'refs/remotes/origin/main', tip);
    await compare(f.options, f.measurementDependencies);
    const iterated = await readCurrentComparison(f.artifacts);
    assert.equal(iterated.comparison.beforeHistory.length, 9);
    assert.notDeepEqual(iterated.comparison.after, f.initialAfter);
    assert.equal(localFocusReport(await loadCurrentComparisonData(f.artifacts)).report.metrics[0].points.length, 9);
    assert.deepEqual(f.snapshot(), f.original);
});

test('failed dates retain independent Mono evidence, publish explicit gaps and retry only missing control evidence', async t => {
    const f = await fixture(t);
    f.fail(f.commits['2026-10-09']);
    await assert.rejects(collectRecentBefore(f.options, 7, f.dependencies), /failed for 2026-10-09.*Explicit gaps/);
    const failed = (await readCurrentComparison(f.artifacts)).comparison.beforeHistory.find(day => day.day === '2026-10-09');
    assert.equal(failed.status, 'failed');
    assert.ok(failed.monoBefore);
    assert.equal(failed.before, undefined);
    assert.match(failed.error, /unsupported composite/);
    const report = localFocusReport(await loadCurrentComparisonData(f.artifacts));
    assert.equal(report.report.metrics[0].points[1].mono, null);
    assert.equal(report.report.metrics[0].points[1].coreclrBefore, null);
    const measured = f.publishes.length;
    f.fail(undefined);
    await collectRecentBefore(f.options, 7, f.dependencies);
    assert.equal(f.publishes.length, measured + 1);
    assert.ok((await readCurrentComparison(f.artifacts)).comparison.beforeHistory.every(day => day.status === 'passed'));
    assert.deepEqual(f.snapshot(), f.original);
});

test('legacy saved after is migrated without remeasurement, but a broken current pointer never falls back', async t => {
    const f = await fixture(t);
    const pointer = join(f.artifacts, 'local-runtime', 'current-result.json');
    await rm(pointer);
    await collectRecentBefore(f.options, 1, f.dependencies);
    assert.deepEqual((await readCurrentComparison(f.artifacts)).comparison.after, f.initialAfter);
    assert.ok(f.publishes.every(call => call.checkout !== f.runtimeRepo));
    const measured = f.publishes.length;
    await writeFile(pointer, '{broken');
    await assert.rejects(collectRecentBefore(f.options, 1, f.dependencies), SyntaxError);
    assert.equal(f.publishes.length, measured);
    assert.deepEqual(f.snapshot(), f.original);
});

test('incompatible legacy evidence is not made current', async t => {
    const f = await fixture(t);
    const pointer = join(f.artifacts, 'local-runtime', 'current-result.json');
    await rm(pointer);
    await assert.rejects(collectRecentBefore({ ...f.options, configuration: 'Debug' }, 1, f.dependencies), /differs/);
    await assert.rejects(readFile(pointer), /ENOENT/);
    assert.equal(f.publishes.length, 0);
});

test('all-failed history does not prevent a later successful after iteration from becoming current', async t => {
    const f = await fixture(t);
    f.fail(f.commits['2026-10-09']);
    await assert.rejects(collectRecentBefore(f.options, 1, {
        ...f.dependencies, now: () => new Date('2026-10-09T12:00:00Z'),
    }), /Explicit gaps/);
    const old = await readCurrentComparison(f.artifacts);
    await compare(f.options, f.measurementDependencies);
    const current = await readCurrentComparison(f.artifacts);
    assert.notEqual(current.path, old.path);
    assert.notDeepEqual(current.comparison.after, old.comparison.after);
    assert.equal(current.comparison.beforeHistory[0].status, 'failed');
    assert.match(formatResults(await loadCurrentComparisonData(f.artifacts)), /Comparisons unavailable/);
    const metric = localFocusReport(await loadCurrentComparisonData(f.artifacts)).report.metrics[0];
    assert.equal(metric.latest, null);
    assert.equal(metric.hasNewerIncomplete, false);
});

test('changing the CoreCLR before mode or Mono control mode does not inherit incompatible history', async t => {
    const f = await fixture(t);
    const history = await collectRecentBefore(f.options, 1, f.dependencies);
    await compare({ ...f.options, 'before-variant': 'aot' }, f.measurementDependencies);
    assert.equal((await readCurrentComparison(f.artifacts)).comparison.beforeHistory, undefined);
    await f.dependencies.register(history.comparisonPath);
    const mono = await measureBefore({ ...f.options, runtime: 'mono', variant: 'aot',
        'before-variant': 'aot', 'include-mono-before': false }, f.original.head, f.measurementDependencies);
    await compare({ ...f.options, 'mono-before': mono.before.manifestPath }, f.measurementDependencies);
    assert.equal((await readCurrentComparison(f.artifacts)).comparison.beforeHistory, undefined);
    assert.deepEqual(f.snapshot(), f.original);
});

test('repeated collections retain only the latest stale-ref warning and selection metadata', async t => {
    const f = await fixture(t);
    await collectRecentBefore(f.options, 1, { ...f.dependencies, now: () => new Date('2026-10-15T12:00:00Z') });
    git(f.runtimeRepo, 'update-ref', 'refs/remotes/origin/main', f.commits['2026-10-13']);
    await collectRecentBefore(f.options, 1, { ...f.dependencies, now: () => new Date('2026-10-16T12:00:00Z') });
    const comparison = (await readCurrentComparison(f.artifacts)).comparison;
    const warnings = comparison.warnings.filter(warning => warning.startsWith('History uses local origin/main'));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /2026-10-13/);
    assert.equal(comparison.historySelection.days[0].day, '2026-10-16');
    assert.equal(comparison.historySelections, undefined);
});

test('bootstrap, iterations and a second history bootstrap publish one result while preserving the latest after', async t => {
    const f = await fixture(t);
    const dependencies = {
        stateFile: join(f.root, 'quick-start.json'), outputDir: f.output,
        now,
        defaults: async () => ({ systemChrome: true, tar: 'tar' }),
        check: async () => ({ ok: true, browsers: { chrome: 'fixture-browser' } }), report: () => {},
        run: (options, hooks) => compare(options, { ...f.measurementDependencies, ...hooks }),
        collect: (options, days, hooks) => collectRecentBefore(options, days, { ...f.dependencies, ...hooks,
            measurementDependencies: { ...f.measurementDependencies, ...hooks.measurementDependencies },
        }),
    };
    await quickStart('bootstrap', f.runtimeRepo, dependencies);
    await quickStart('iterate', undefined, dependencies);
    await quickStart('iterate', undefined, dependencies);
    const after = (await readCurrentComparison(f.artifacts)).comparison.after;
    const afterPublishes = f.publishes.filter(call => call.checkout === f.runtimeRepo).length;
    await quickStart('bootstrap', undefined, dependencies, ['--measure-recent-days=7']);
    const history = await loadCurrentComparisonData(f.artifacts);
    assert.equal(history.beforeHistory.length, 7);
    assert.deepEqual((await readCurrentComparison(f.artifacts)).comparison.after, after);
    assert.equal(f.publishes.filter(call => call.checkout === f.runtimeRepo).length, afterPublishes);
    assert.equal(localFocusReport(history).metadata.isHistory, true);
    await quickStart('iterate', undefined, dependencies);
    assert.equal((await loadCurrentComparisonData(f.artifacts)).beforeHistory.length, 7);
    assert.equal(f.publishes.filter(call => call.checkout === f.runtimeRepo).length, afterPublishes + 1);
    assert.deepEqual(f.snapshot(), f.original);
});

test('changed owned source is refused, not reset; source-directory symlinks cannot escape the output', async t => {
    const f = await fixture(t);
    await collectRecentBefore(f.options, 1, f.dependencies);
    const directory = join(f.output, 'history', 'sources');
    const mono = (await readdir(directory)).find(name => name.startsWith('runtime-mono'));
    await writeFile(join(directory, mono, 'source.txt'), 'protect this edit\n');
    await assert.rejects(collectRecentBefore({ ...f.options, 'force-before': true }, 1, f.dependencies), /Explicit gaps/);
    assert.equal(await readFile(join(directory, mono, 'source.txt'), 'utf8'), 'protect this edit\n');
    assert.deepEqual(f.snapshot(), f.original);
    const other = join(f.root, 'other-output');
    const outside = join(f.root, 'outside');
    await mkdir(join(other, 'history'), { recursive: true });
    await mkdir(outside);
    await symlink(outside, join(other, 'history', 'sources'), 'dir');
    await assert.rejects(collectRecentBefore({ ...f.options, output: other, 'force-before': true }, 1, f.dependencies), /Explicit gaps/);
    assert.deepEqual(await readdir(outside), []);
});

test('history rejects incompatible setup and refuses to replace a newer current result during collection', async t => {
    const f = await fixture(t);
    const before = await readCurrentComparison(f.artifacts);
    for (const change of [{ variant: 'aot' }, { configuration: 'Debug' },
        { 'runtime-repo': join(f.root, 'another-checkout') }, { measureArgs: ['--cold-runs', '3'] }]) {
        await assert.rejects(collectRecentBefore({ ...f.options, ...change }, 1, f.dependencies), /differs|another|match/);
    }
    assert.equal((await readCurrentComparison(f.artifacts)).path, before.path);
    assert.equal(f.publishes.length, 0);
    const lock = join(f.output, '.comparison-lock');
    await mkdir(lock);
    await assert.rejects(collectRecentBefore(f.options, 1, f.dependencies), /Another comparison is running/);
    await rm(lock, { recursive: true });
    await assert.rejects(readFile(join(f.output, '.history-lock')), /ENOENT/);
    assert.equal(f.publishes.length, 0);
    let reads = 0;
    await assert.rejects(collectRecentBefore(f.options, 1, { ...f.dependencies,
        getCurrent: async () => ++reads === 1 ? before : { ...before, path: '/newer/comparison.json' },
    }), /changed during history collection/);
    assert.equal((await readCurrentComparison(f.artifacts)).path, before.path);
    assert.deepEqual(f.snapshot(), f.original);
});
