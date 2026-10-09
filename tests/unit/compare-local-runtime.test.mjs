import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
    buildSubsets, compare, loadBaseline, measurementRecord, monoBaselineWarnings, parseCompareOptions,
} from '../../bench/compare-local-runtime.mjs';
import { formatCommand, runCommand, statusLine } from '../../bench/local-command.mjs';

function git(cwd, ...args) {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'runtime-comparison-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const runtime = join(root, 'runtime with changes');
    const output = join(root, 'output');
    await mkdir(runtime);
    git(runtime, 'init', '--quiet');
    git(runtime, 'config', 'user.name', 'Fixture');
    git(runtime, 'config', 'user.email', 'fixture@example.invalid');
    git(runtime, 'remote', 'add', 'origin', 'https://github.com/dotnet/runtime.git');
    await writeFile(join(runtime, 'global.json'), '{"sdk":{"version":"12.0.100"}}');
    await writeFile(join(runtime, 'tracked.txt'), 'baseline\n');
    await writeFile(join(runtime, 'build.sh'), '#!/usr/bin/env bash\nprintf "fixture build %s\\n" "$*"\n');
    await writeFile(join(runtime, 'build.cmd'), '@echo fixture build %*\r\n');
    git(runtime, 'add', '.');
    git(runtime, 'commit', '--quiet', '-m', 'baseline fixture');
    const baseline = git(runtime, 'rev-parse', 'HEAD');
    git(runtime, 'update-ref', 'refs/remotes/origin/main', baseline);
    await writeFile(join(runtime, 'tracked.txt'), 'committed change\n');
    git(runtime, 'add', 'tracked.txt');
    git(runtime, 'commit', '--quiet', '-m', 'runtime change fixture');
    await writeFile(join(runtime, 'tracked.txt'), 'staged change\n');
    git(runtime, 'add', 'tracked.txt');
    await writeFile(join(runtime, 'tracked.txt'), 'unstaged change\n');
    await writeFile(join(runtime, 'untracked.txt'), 'local new source\n');
    const initial = {
        head: git(runtime, 'rev-parse', 'HEAD'),
        status: git(runtime, 'status', '--porcelain'),
        index: git(runtime, 'show', ':tracked.txt'),
    };
    const calls = [];
    const published = [];
    let count = 0;
    const dependencies = {
        getBrowserIdentity: async () => ({ chrome: '154.fixture' }),
        getBenchmarkDigest: async () => 'fixture-benchmark-v1',
        registerResult: async () => {},
        run: async (command, args, options) => {
            calls.push({ command, args, cwd: options.cwd });
            return runCommand(command, args, { ...options, writeLine: () => {} });
        },
        publishRuntime: async options => {
            published.push({
                label: options.label, checkout: options['runtime-repo'],
                tracked: await readFile(join(options['runtime-repo'], 'tracked.txt'), 'utf8'),
                measure: options.measure, args: options.measureArgs,
                excludedSources: options['exclude-source'],
                runtime: options.runtime, variant: options.variant,
            });
            const runDir = join(root, `measurement-${++count}`);
            const resultsDir = join(runDir, 'results');
            await mkdir(resultsDir, { recursive: true });
            await mkdir(join(runDir, 'logs'));
            const manifestPath = join(runDir, 'manifest.json');
            await writeFile(manifestPath, JSON.stringify({
                runDir, runtime: options.runtime, preset: options.variant === 'no-workload' ? 'no-workload' : 'aot',
                variant: options.variant, configuration: options.configuration,
                sdkInfo: { sdkVersion: '12.0.100', runtimePackVersion: '12.0.0-fixture', bundledFrameworkTfm: 'net12.0',
                    runtimeGitHash: git(options['runtime-repo'], 'rev-parse', 'HEAD'),
                    localRuntime: { source: { checkout: options['runtime-repo'],
                        dirty: git(options['runtime-repo'], 'status', '--porcelain') !== '' } } },
            }));
            await writeFile(join(resultsDir, 'havit.json'), JSON.stringify({
                meta: { app: 'havit-bootstrap', engine: 'chrome', profile: 'desktop', runtime: options.runtime,
                    preset: options.variant === 'no-workload' ? 'no-workload' : 'aot', benchmarkDateTime: '2026-10-08T12:00:00Z' },
                metrics: { 'havit-walkthrough': 100, 'time-to-reach-managed-cold': 200, 'time-to-reach-managed-warm': 100 },
            }));
            await writeFile(join(runDir, 'logs', 'measurement-1.status.json'), JSON.stringify({
                status: 'passed', resultsDir,
            }));
            return manifestPath;
        },
    };
    const options = parseCompareOptions(['--runtime-repo', runtime, '--output', output, '--variant', 'no-workload', '--',
        '--cold-runs', '1', '--warm-runs', '1']);
    return { root, runtime, output, baseline, initial, calls, published, dependencies, options };
}

test('comparison option validation and build subsets', () => {
    const options = parseCompareOptions([]);
    assert.equal(options.runtime, 'coreclr');
    assert.equal(options.variant, 'composite');
    assert.equal(options['before-variant'], 'composite');
    const r2r = parseCompareOptions(['--variant', 'r2r']);
    assert.equal(r2r.variant, 'aot');
    assert.equal(r2r['before-variant'], 'aot');
    assert.equal(parseCompareOptions(['--runtime', 'mono']).variant, 'no-workload');
    assert.equal(options['runtime-repo'], undefined);
    assert.deepEqual(buildSubsets(options), ['clr+libs+host', 'packs.product']);
    assert.deepEqual(buildSubsets({ runtime: 'mono', variant: 'aot' }), ['mono+libs', 'mono.aotcross', 'packs.product']);
    assert.deepEqual(buildSubsets({ runtime: 'mono', variant: 'no-workload' }), ['mono+libs', 'packs.product']);
    assert.throws(() => parseCompareOptions(['--runtime-repo', '/existing', '--runtime-ref', 'branch']), /never switched/);
    assert.throws(() => parseCompareOptions(['--runtime', 'mono', '--variant', 'composite']), /requires CoreCLR/);
    assert.throws(() => parseCompareOptions(['--runtime', 'mono', '--mono-before', '/mono/manifest.json']), /only meaningful for CoreCLR/);
    assert.throws(() => parseCompareOptions(['--', '--engine', 'node']), /Use Chrome/);
    assert.throws(() => parseCompareOptions(['--', '--cold-runs', '0']), /at least one/);
    assert.throws(() => parseCompareOptions(['--', '--warm-runs', '1oops']), /safe integer/);
    assert.throws(() => parseCompareOptions(['--', '--cold-runs', '9007199254740993']), /safe integer/);
});

test('command status is at the end of the command line, green for success and red for failure', () => {
    const command = formatCommand('node', ['driver.mjs', 'path with spaces'], '/runtime repo');
    assert.match(command, /"path with spaces"/);
    assert.ok(statusLine(command, 'OK', true).endsWith('\u001b[32m[OK]\u001b[0m'));
    assert.ok(statusLine(command, 'FAILED', true).endsWith('\u001b[31m[FAILED]\u001b[0m'));
    assert.equal(statusLine(command, 'CACHED', false), `${command} [CACHED]`);
});

test('command runner reports success, nonzero failure, and spawn failure with logs', async t => {
    const root = await mkdtemp(join(tmpdir(), 'runtime-command-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const lines = [];
    const options = { cwd: root, logPath: join(root, 'run.log'), writeLine: line => lines.push(line) };
    await runCommand(process.execPath, ['-e', 'console.log("fixture success")'], options);
    assert.equal(await readFile(options.logPath, 'utf8'), 'fixture success\n');
    assert.ok(lines.some(line => line.endsWith('[OK]')));
    await assert.rejects(runCommand(process.execPath, ['-e', 'console.error("fixture failure");process.exit(9)'], options),
        /exited with 9[\s\S]+fixture failure/);
    assert.ok(lines.at(-1).endsWith('[FAILED]'));
    await assert.rejects(runCommand(join(root, 'missing-executable'), [], options), /ENOENT/);
    assert.ok(lines.at(-1).endsWith('[FAILED]'));
});

test('first comparison builds both revisions; second reuses before and builds/measures only changed checkout', async t => {
    const f = await fixture(t);
    const first = await compare(f.options, f.dependencies);
    assert.equal(f.published.length, 2);
    assert.equal(f.published[0].label, 'before');
    assert.equal(f.published[0].tracked, 'baseline\n');
    assert.equal(git(f.published[0].checkout, 'remote', 'get-url', 'origin'), 'https://github.com/dotnet/runtime.git');
    assert.equal(f.published[1].tracked, 'unstaged change\n');
    assert.ok(f.published.every(call => call.measure));
    assert.equal(f.calls.filter(call => call.command === 'bash' || call.command === 'cmd.exe').length, 4);
    assert.ok(f.calls.filter(call => call.command === 'git').length === 2);
    assert.ok(f.calls.filter(call => call.command === 'bash' || call.command === 'cmd.exe')
        .every(call => call.args.includes('/p:RuntimeFlavor=CoreCLR') && !call.args.includes('-runtimeFlavor')));
    const recorded = JSON.parse(await readFile(first.comparisonPath, 'utf8'));
    assert.equal(recorded.setup.beforeSha, f.baseline);
    assert.equal(recorded.afterSha, f.initial.head);
    f.calls.length = 0;
    f.published.length = 0;
    const second = await compare({ ...f.options, measureArgs: ['--warm-runs', '1', '--cold-runs', '1', '--verbose'] }, f.dependencies);
    assert.equal(second.before.manifestPath, first.before.manifestPath);
    assert.equal(f.published.length, 1);
    assert.equal(f.published[0].label, 'after');
    assert.equal(f.calls.length, 2);
    assert.ok(f.calls.every(call => call.cwd === f.runtime));
    assert.equal(git(f.runtime, 'rev-parse', 'HEAD'), f.initial.head);
    assert.equal(git(f.runtime, 'status', '--porcelain'), f.initial.status);
    assert.equal(git(f.runtime, 'show', ':tracked.txt'), f.initial.index);
    assert.equal(await readFile(join(f.runtime, 'untracked.txt'), 'utf8'), 'local new source\n');
    assert.equal(existsSync(join(f.output, '.comparison-lock')), false);
});

test('matched composite experiment caches Mono interpreter and CoreCLR composite controls; r2r switches both CoreCLR sides', async t => {
    const f = await fixture(t);
    const options = { ...f.options, variant: 'composite', 'before-variant': 'composite', 'include-mono-before': true };
    const first = await compare(options, f.dependencies);
    assert.deepEqual(f.published.map(({ label, runtime, variant }) => ({ label, runtime, variant })), [
        { label: 'mono-before', runtime: 'mono', variant: 'no-workload' },
        { label: 'before', runtime: 'coreclr', variant: 'composite' },
        { label: 'after', runtime: 'coreclr', variant: 'composite' },
    ]);
    const [mono, before, after] = f.published;
    assert.notEqual(mono.checkout, before.checkout);
    assert.notEqual(before.checkout, after.checkout);
    assert.equal(git(mono.checkout, 'rev-parse', 'HEAD'), f.baseline);
    assert.equal(git(before.checkout, 'rev-parse', 'HEAD'), f.baseline);
    assert.equal(git(mono.checkout, 'status', '--porcelain'), '');
    assert.equal(await readFile(join(dirname(mono.checkout), '.eslintrc.cjs'), 'utf8'), 'module.exports = { root: true };\n');
    assert.equal(after.checkout, f.runtime);
    assert.equal(after.tracked, 'unstaged change\n');
    const bundle = JSON.parse(await readFile(join(dirname(first.comparisonPath), 'dashboard.json'), 'utf8'));
    assert.equal(bundle.monoBefore.manifest.variant, 'no-workload');
    assert.equal(bundle.before.manifest.variant, 'composite');
    assert.equal(bundle.after.manifest.variant, 'composite');
    const { localFocusReport } = await import('../../src/bench-viewer/wwwroot/chart/local-focus.js');
    const report = localFocusReport(bundle, 'desktop');
    assert.equal(report.metadata.beforeLabel, 'Before (CoreCLR publish/R2R composite)');
    assert.equal(report.metadata.afterLabel, 'After (CoreCLR publish/R2R composite)');
    assert.equal(report.metadata.monoLabel, 'Before (Mono interpreter)');
    f.published.length = 0;
    f.calls.length = 0;
    const second = await compare(options, f.dependencies);
    assert.equal(second.before.manifestPath, first.before.manifestPath);
    assert.deepEqual(f.published.map(call => call.label), ['after']);
    assert.ok(f.calls.every(call => call.cwd === f.runtime));
    f.published.length = 0;
    await compare({ ...options, variant: 'aot', 'before-variant': 'aot' }, f.dependencies);
    assert.deepEqual(f.published.map(call => call.label), ['before', 'after']);
    assert.ok(f.published.every(call => call.variant === 'aot'));
    assert.equal(git(f.runtime, 'status', '--porcelain'), f.initial.status);
    assert.equal(git(f.runtime, 'show', ':tracked.txt'), f.initial.index);
});

test('changed measurement setup and explicit force-before do not reuse a baseline', async t => {
    const f = await fixture(t);
    await compare(f.options, f.dependencies);
    f.published.length = 0;
    await compare({ ...f.options, measureArgs: ['--cold-runs', '2', '--warm-runs', '1'] }, f.dependencies);
    assert.equal(f.published.length, 2);
    f.published.length = 0;
    await compare({ ...f.options, 'force-before': true }, f.dependencies);
    assert.equal(f.published.length, 2);
});

test('before uses a separate clean merge-base checkout without switching or stashing the supplied source', async t => {
    const f = await fixture(t);
    const tree = git(f.runtime, 'rev-parse', `${f.initial.head}^{tree}`);
    const upstream = git(f.runtime, 'commit-tree', tree, '-p', f.baseline, '-m', 'upstream main change');
    git(f.runtime, 'update-ref', 'refs/remotes/origin/main', upstream);
    assert.equal(git(f.runtime, 'merge-base', 'HEAD', 'origin/main'), f.baseline);
    assert.notEqual(upstream, f.baseline);

    const first = await compare(f.options, f.dependencies);
    const recorded = JSON.parse(await readFile(first.comparisonPath, 'utf8'));
    assert.equal(recorded.setup.beforeSha, f.baseline);
    assert.equal(recorded.setup.beforeRef, 'refs/remotes/origin/main');
    assert.equal(recorded.setup.baselineStrategy, 'merge-base');
    assert.equal(git(f.published[0].checkout, 'rev-parse', 'HEAD'), f.baseline);
    assert.equal(git(f.published[0].checkout, 'status', '--porcelain'), '');
    assert.notEqual(f.published[0].checkout, f.runtime);
    assert.equal(f.published[0].tracked, 'baseline\n');
    assert.equal(f.published[1].tracked, 'unstaged change\n');
    assert.equal(f.published[1].checkout, f.runtime);

    f.published.length = 0;
    await compare(f.options, f.dependencies);
    assert.deepEqual(f.published.map(call => call.label), ['after']);

    const updated = git(f.runtime, 'commit-tree', tree, '-p', upstream, '-m', 'next upstream main change');
    git(f.runtime, 'update-ref', 'refs/remotes/origin/main', updated);
    f.published.length = 0;
    const third = await compare(f.options, f.dependencies);
    assert.equal(third.before.setup.beforeSha, f.baseline);
    assert.equal(third.before.manifestPath, first.before.manifestPath);
    assert.deepEqual(f.published.map(call => call.label), ['after']);

    const merged = git(f.runtime, 'commit-tree', tree, '-p', updated, '-p', f.initial.head, '-m', 'upstream merges branch');
    git(f.runtime, 'update-ref', 'refs/remotes/origin/main', merged);
    f.published.length = 0;
    const fourth = await compare(f.options, f.dependencies);
    assert.equal(fourth.before.setup.beforeSha, f.initial.head);
    assert.deepEqual(f.published.map(call => call.label), ['before', 'after']);
    assert.equal(git(f.published[0].checkout, 'status', '--porcelain'), '');
    assert.equal(git(f.runtime, 'rev-parse', 'HEAD'), f.initial.head);
    assert.equal(git(f.runtime, 'status', '--porcelain'), f.initial.status);
    assert.equal(git(f.runtime, 'show', ':tracked.txt'), f.initial.index);
    assert.equal(await readFile(join(f.runtime, 'untracked.txt'), 'utf8'), 'local new source\n');
    assert.ok(!f.calls.some(call => call.command === 'git' && call.args[0] === 'fetch'));
    assert.ok(!f.calls.some(call => call.cwd === f.runtime && call.command === 'git' &&
        ['checkout', 'switch', 'reset', 'clean', 'stash'].includes(call.args[0])));
});

test('changed browser version invalidates before; missing or modified result evidence is not reused', async t => {
    const f = await fixture(t);
    const first = await compare(f.options, f.dependencies);
    const cacheName = (await readdir(join(f.output, 'before'))).find(name => name.endsWith('.json'));
    const cachePath = join(f.output, 'before', cacheName);
    const key = first.before.key;
    assert.ok(await loadBaseline(cachePath, key));
    await writeFile(first.before.results[0].path, '{}');
    assert.equal(await loadBaseline(cachePath, key), null);
    await rm(first.before.results[0].path);
    assert.equal(await loadBaseline(cachePath, key), null);
    f.published.length = 0;
    await compare(f.options, { ...f.dependencies, getBrowserIdentity: async () => ({ chrome: '155.fixture' }) });
    assert.equal(f.published.length, 2);
});

test('a failed before measurement never enters cache and prevents after measurement', async t => {
    const f = await fixture(t);
    const original = f.dependencies.publishRuntime;
    f.dependencies.publishRuntime = async options => {
        const manifestPath = await original(options);
        const { runDir } = JSON.parse(await readFile(manifestPath, 'utf8'));
        await writeFile(join(runDir, 'logs', 'measurement-1.status.json'), JSON.stringify({
            status: 'failed', error: 'navigation failed',
        }));
        return manifestPath;
    };
    await assert.rejects(compare(f.options, f.dependencies), /navigation failed/);
    assert.equal(f.published.length, 1);
    assert.deepEqual(await readdir(join(f.output, 'before')), []);
    assert.equal(existsSync(join(f.output, '.comparison-lock')), false);
});

test('after build failure preserves successful before cache for the next run', async t => {
    const f = await fixture(t);
    const original = f.dependencies.run;
    f.dependencies.run = async (command, args, options) => {
        if (options.cwd === f.runtime && (command === 'bash' || command === 'cmd.exe')) throw new Error('after build failed');
        return original(command, args, options);
    };
    await assert.rejects(compare(f.options, f.dependencies), /after build failed/);
    assert.equal((await readdir(join(f.output, 'before'))).length, 1);
    f.dependencies.run = original;
    f.published.length = 0;
    await compare(f.options, f.dependencies);
    assert.equal(f.published.length, 1);
    assert.equal(f.published[0].label, 'after');
});

test('failed, incomplete, or corrupt measurement evidence cannot be recorded', async t => {
    const f = await fixture(t);
    const manifest = await f.dependencies.publishRuntime({
        label: 'before', 'runtime-repo': f.runtime, measureArgs: [],
    });

    test('mobile and Firefox startup results can be recorded without unsupported Havit walkthrough metrics', async t => {
        const f = await fixture(t);
        const manifest = await f.dependencies.publishRuntime({
            label: 'after', 'runtime-repo': f.runtime, measureArgs: [],
        });
        const record = await measurementRecord(manifest);
        for (const [engine, profile] of [['chrome', 'mobile'], ['firefox', 'desktop']]) {
            await writeFile(record.results[0].path, JSON.stringify({
                meta: { engine, profile },
                metrics: { 'time-to-reach-managed-cold': 200, 'time-to-reach-managed-warm': 100 },
            }));
            assert.equal((await measurementRecord(manifest)).results.length, 1);
        }
        await writeFile(record.results[0].path, JSON.stringify({
            meta: { engine: 'chrome', profile: 'desktop' },
            metrics: { 'time-to-reach-managed-cold': 200, 'time-to-reach-managed-warm': 100 },
        }));
        await assert.rejects(measurementRecord(manifest), /havit-walkthrough/);
    });
    const record = await measurementRecord(manifest);
    await writeFile(record.results[0].path, '{"metrics":{"havit-walkthrough":0}}');
    await assert.rejects(measurementRecord(manifest), /Invalid baseline metric/);
    await rm(record.statusPath);
    await assert.rejects(measurementRecord(manifest), /No measurement status/);
});

test('comparison lock refuses parallel use without running build commands', async t => {
    const f = await fixture(t);
    await mkdir(f.output);
    await mkdir(join(f.output, '.comparison-lock'));
    await assert.rejects(compare(f.options, f.dependencies), /Another comparison is running/);
    assert.equal(f.calls.length, 0);
});

test('missing origin/main or unavailable browser fails before any build, releasing the lock', async t => {
    const f = await fixture(t);
    await assert.rejects(compare(f.options, {
        ...f.dependencies, getBrowserIdentity: async () => { throw new Error('browser missing'); },
    }), /browser missing/);
    assert.equal(f.calls.length, 0);
    assert.equal(existsSync(join(f.output, '.comparison-lock')), false);
    git(f.runtime, 'update-ref', '-d', 'refs/remotes/origin/main');
    await assert.rejects(compare(f.options, f.dependencies), /origin\/main/);
    assert.equal(f.calls.length, 0);
    assert.equal(git(f.runtime, 'status', '--porcelain'), f.initial.status);
    assert.equal(existsSync(join(f.output, '.comparison-lock')), false);
});

test('managed clone checks out a requested ref once and refuses to switch an existing clone', async t => {
    const f = await fixture(t);
    git(f.runtime, 'branch', 'main', f.baseline);
    const original = f.dependencies.run;
    f.dependencies.run = async (command, args, options) => {
        if (command === 'git' && args[0] === 'clone' && args[1] === 'https://github.com/dotnet/runtime.git') {
            return original(command, ['clone', f.runtime, args[2]], options);
        }
        return original(command, args, options);
    };
    const options = { ...f.options, 'runtime-repo': undefined, 'runtime-ref': f.initial.head };
    const first = await compare(options, f.dependencies);
    assert.equal(first.before.setup.beforeSha, f.baseline);
    assert.equal(f.published[1].tracked, 'committed change\n');
    assert.equal(f.published[1].checkout, join(f.output, 'runtime-coreclr'));
    await assert.rejects(compare(options, f.dependencies), /refusing to switch/);
    f.published.length = 0;
    await compare({ ...options, 'runtime-ref': undefined }, f.dependencies);
    assert.equal(f.published.length, 1);
    assert.equal(git(f.runtime, 'status', '--porcelain'), f.initial.status);
});

test('different app SDKs produce a persisted comparison warning', async t => {
    const f = await fixture(t);
    const original = f.dependencies.publishRuntime;
    f.dependencies.publishRuntime = async options => {
        const manifestPath = await original(options);
        if (options.label === 'after') {
            const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
            manifest.sdkInfo.sdkVersion = '12.0.200';
            await writeFile(manifestPath, JSON.stringify(manifest));
        }
        return manifestPath;
    };
    const result = await compare(f.options, f.dependencies);
    const report = JSON.parse(await readFile(result.comparisonPath, 'utf8'));
    assert.equal(report.warnings.length, 1);
    assert.match(report.warnings[0], /Use --sdk/);
});

test('baseline keeps SourceLink origin metadata without copying HTTPS credentials into evidence', async t => {
    const f = await fixture(t);
    git(f.runtime, 'remote', 'set-url', 'origin', 'https://fixture-user:fixture-password@github.com/dotnet/runtime.git');
    const result = await compare(f.options, f.dependencies);
    const text = await readFile(result.comparisonPath, 'utf8');
    assert.doesNotMatch(text, /fixture-user|fixture-password/);
    assert.equal(git(f.published[0].checkout, 'remote', 'get-url', 'origin'), 'https://github.com/dotnet/runtime.git');
    assert.equal(git(f.runtime, 'remote', 'get-url', 'origin'),
        'https://fixture-user:fixture-password@github.com/dotnet/runtime.git');
});

test('retrying a failed before build reuses pristine source outputs but still builds and measures before', async t => {
    const f = await fixture(t);
    const original = f.dependencies.run;
    let failedCheckout;
    f.dependencies.run = async (command, args, options) => {
        if (options.cwd !== f.runtime && (command === 'bash' || command === 'cmd.exe')) {
            failedCheckout = options.cwd;
            throw new Error('fixture interrupted native build');
        }
        return original(command, args, options);
    };
    await assert.rejects(compare(f.options, f.dependencies), /interrupted native build/);
    assert.deepEqual(await readdir(join(f.output, 'before')), []);
    assert.equal((await readdir(join(f.output, 'before-source'))).length, 1);
    f.dependencies.run = original;
    f.calls.length = 0;
    await compare(f.options, f.dependencies);
    assert.equal(f.published[0].checkout, failedCheckout);
    assert.equal(f.published.length, 2);
    assert.ok(f.calls.every(call => call.command !== 'git'));
});

test('modified cached baseline sources are never reset or silently reused', async t => {
    const f = await fixture(t);
    const first = await compare(f.options, f.dependencies);
    const source = f.published[0].checkout;
    await writeFile(join(source, 'tracked.txt'), 'unexpected baseline edit\n');
    f.calls.length = 0;
    await assert.rejects(compare({ ...f.options, 'force-before': true }, f.dependencies), /Baseline source checkout was modified/);
    assert.equal(f.calls.length, 0);
    assert.equal(await readFile(join(source, 'tracked.txt'), 'utf8'), 'unexpected baseline edit\n');
    assert.ok(await loadBaseline(join(f.output, 'before', `${first.before.key}.json`), first.before.key));
});

test('removed baseline sources are recloned when before evidence or source-only cache must be rebuilt', async t => {
    const f = await fixture(t);
    const first = await compare(f.options, f.dependencies);
    const removed = f.published[0].checkout;
    await rm(removed, { recursive: true, force: true });
    await rm(first.before.results[0].path);
    f.published.length = 0;
    const second = await compare(f.options, f.dependencies);
    const replacement = f.published[0].checkout;
    assert.notEqual(replacement, removed);
    assert.equal(git(replacement, 'rev-parse', 'HEAD'), f.baseline);
    assert.deepEqual(f.published.map(call => call.label), ['before', 'after']);
    const sourceName = (await readdir(join(f.output, 'before-source')))[0];
    const sourceRecord = JSON.parse(await readFile(join(f.output, 'before-source', sourceName), 'utf8'));
    assert.equal(sourceRecord.checkout, replacement);
    await rm(replacement, { recursive: true, force: true });
    f.published.length = 0;
    await compare({ ...f.options, 'force-before': true }, f.dependencies);
    assert.notEqual(f.published[0].checkout, replacement);
    assert.equal(git(f.runtime, 'status', '--porcelain'), f.initial.status);
    assert.ok(await loadBaseline(join(f.output, 'before', `${second.before.key}.json`), second.before.key));
});

test('Mono controls produce explicit warnings for mismatched or unverified measurement setup', async t => {
    const f = await fixture(t);
    const manifestPath = await f.dependencies.publishRuntime({
        label: 'mono-control', runtime: 'mono', variant: 'aot', 'runtime-repo': f.runtime, measureArgs: [],
    });
    const record = await measurementRecord(manifestPath);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.configuration = 'Debug';
    await writeFile(manifestPath, JSON.stringify(manifest));
    const setup = { variant: 'no-workload', configuration: 'Release', measurement: {
        engine: 'chrome', profile: 'desktop', 'cold-runs': 2, 'warm-runs': 1, 'walkthrough-runs': 1,
        timeout: 60000, retries: 0, 'deadline-minutes': 0, 'no-headless': false, 'system-chrome': true,
    } };
    await writeFile(join(record.resultsDir, 'context.json'), JSON.stringify({
        engines: ['chrome'], profiles: ['desktop'], coldRuns: 3, warmRuns: 1, walkthroughRuns: 1,
        timeout: 60000, retries: 0, deadlineMs: 0, headless: false,
    }));
    const warnings = await monoBaselineWarnings(record, setup);
    assert.ok(warnings.some(warning => warning.includes('variant aot')));
    assert.ok(warnings.some(warning => warning.includes('configuration Debug')));
    assert.ok(warnings.some(warning => warning.includes('--cold-runs=3')));
    assert.ok(warnings.some(warning => warning.includes('--no-headless=true')));
    assert.ok(warnings.some(warning => warning.includes('--system-chrome=false')));
    assert.ok(warnings.some(warning => warning.includes('browser version and benchmark-source')));
    await rm(join(record.resultsDir, 'context.json'));
    assert.ok((await monoBaselineWarnings(record, setup)).some(warning => warning.includes('options were not recorded')));
    manifest.sdkInfo.runtimeGitHash = f.baseline;
    manifest.sdkInfo.localRuntime = { source: { dirty: false } };
    await writeFile(manifestPath, JSON.stringify(manifest));
    const result = await compare({ ...f.options, 'mono-before': manifestPath }, f.dependencies);
    const comparison = JSON.parse(await readFile(result.comparisonPath, 'utf8'));
    const dashboard = JSON.parse(await readFile(join(dirname(result.comparisonPath), 'dashboard.json'), 'utf8'));
    assert.ok(comparison.warnings.some(warning => warning.includes('variant aot')));
    assert.ok(comparison.warnings.some(warning => warning.includes('options were not recorded')));
    assert.deepEqual(dashboard.warnings, comparison.warnings);
});

test('explicit public source exclusions reach both publishes and invalidate incompatible baseline evidence', async t => {
    const f = await fixture(t);
    const first = await compare(f.options, f.dependencies);
    f.published.length = 0;
    const second = await compare({ ...f.options, 'exclude-source': ['nuget.org'] }, f.dependencies);
    assert.notEqual(first.before.key, second.before.key);
    assert.equal(f.published.length, 2);
    assert.ok(f.published.every(call => JSON.stringify(call.excludedSources) === '["nuget.org"]'));
});
