import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { quickStart, selectDefaults } from '../../bench/runtime-bench.mjs';
import { compare } from '../../bench/compare-local-runtime.mjs';
import { DEFAULT_FOCUS_SELECTION, FOCUS_FLAVORS } from '../../src/bench-viewer/wwwroot/chart/focus-selection.js';

async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'runtime-quick-start-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const calls = [];
    const dependencies = {
        stateFile: join(root, 'quick-start.json'), outputDir: join(root, 'output'),
        defaults: async () => ({ systemChrome: true, tar: 'bsdtar' }),
        check: async options => { calls.push({ check: options }); return { ok: true, browsers: { chrome: '154.fixture' } }; },
        report: () => {},
        run: async (options, deps) => { calls.push({ run: options }); assert.deepEqual(await deps.getBrowserIdentity(), { chrome: '154.fixture' }); },
    };
    return { root, calls, dependencies };
}

async function sourceSelectionFixture(t) {
    const f = await fixture(t);
    const source = join(f.root, 'fixture-remote');
    await mkdir(source);
    const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
    git(source, 'init', '--quiet', '--initial-branch=main');
    git(source, 'config', 'user.name', 'Fixture');
    git(source, 'config', 'user.email', 'fixture@example.invalid');
    await writeFile(join(source, 'global.json'), '{"sdk":{"version":"12.0.100"}}');
    await writeFile(join(source, 'tracked.txt'), 'main\n');
    git(source, 'add', '.');
    git(source, 'commit', '--quiet', '-m', 'source fixture');
    const main = git(source, 'rev-parse', 'HEAD');
    git(source, 'checkout', '--quiet', '-b', 'contributor-fix');
    await writeFile(join(source, 'tracked.txt'), 'requested revision\n');
    git(source, 'commit', '--quiet', '-am', 'requested ref fixture');
    const selected = git(source, 'rev-parse', 'HEAD');
    git(source, 'checkout', '--quiet', 'main');
    let builds = 0;
    f.dependencies.run = (options, hooks) => compare(options, {
        ...hooks, getBenchmarkDigest: async () => 'fixture',
        registerResult: async () => {},
        publishRuntime: async () => { throw new Error('Unexpected publish in source-selection fixture'); },
        run: async (command, args, { cwd }) => {
            if (command !== 'git') { builds++; throw new Error('fixture source build failed'); }
            const redirected = args[0] === 'clone' && args[1] === 'https://github.com/dotnet/runtime.git'
                ? ['clone', source, args[2]] : args;
            execFileSync(command, redirected, { cwd, stdio: 'pipe' });
        },
    });
    return { ...f, git, main, selected, builds: () => builds };
}

test('bootstrap takes one path and iteration remembers it without repeating browser/runtime flags', async t => {
    const f = await fixture(t);
    const oldTar = process.env.BENCH_TAR;
    await quickStart('bootstrap', './contributor-runtime', f.dependencies);
    const saved = JSON.parse(await readFile(f.dependencies.stateFile, 'utf8'));
    assert.equal(saved.runtimeRepo, resolve('./contributor-runtime'));
    assert.equal(saved.systemChrome, true);
    assert.equal(saved.tar, 'bsdtar');
    assert.equal(saved.version, 3);
    await quickStart('iterate', undefined, { ...f.dependencies,
        defaults: async () => { throw new Error('Iteration should not silently change browser selection'); } });
    const runs = f.calls.filter(call => call.run).map(call => call.run);
    const focus = FOCUS_FLAVORS.find(flavor => flavor.id === DEFAULT_FOCUS_SELECTION.flavor);
    assert.equal(runs[0]['before-variant'], 'composite');
    assert.equal(focus.monoPreset, 'no-workload');
    assert.ok(runs.every(options => options['runtime-repo'] === saved.runtimeRepo && options.runtime === 'coreclr' &&
        options.variant === 'composite' && options['before-variant'] === 'composite' &&
        options['include-mono-before'] && options.configuration === 'Release'));
    assert.deepEqual(runs[1].measureArgs, ['--profile', 'desktop,mobile', '--system-chrome']);
    assert.equal(process.env.BENCH_TAR, oldTar);
});

test('no-path bootstrap uses the managed clone, then iterate explicitly uses that checkout', async t => {
    const f = await fixture(t);
    await quickStart('bootstrap', undefined, f.dependencies);
    await quickStart('iterate', undefined, f.dependencies);
    const runs = f.calls.filter(call => call.run).map(call => call.run);
    assert.equal(runs[0]['runtime-repo'], undefined);
    assert.equal(runs[1]['runtime-repo'], join(f.dependencies.outputDir, 'runtime-coreclr'));
});

test('missing prerequisites do not build or save success-shaped settings', async t => {
    const f = await fixture(t);
    await assert.rejects(quickStart('bootstrap', './runtime', {
        ...f.dependencies, check: async () => ({ ok: false, browsers: {} }),
    }), /missing prerequisites/);
    assert.equal(f.calls.length, 0);
    await assert.rejects(readFile(f.dependencies.stateFile), /ENOENT/);
    await assert.rejects(quickStart('iterate', undefined, f.dependencies), /bootstrap.*once before iterating/);
});

test('failed bootstrap build retains checkout settings for an iterative retry without hiding failure', async t => {
    const f = await fixture(t);
    await assert.rejects(quickStart('bootstrap', './runtime', {
        ...f.dependencies, run: async () => { throw new Error('source build failed'); },
    }), /source build failed/);
    await quickStart('iterate', undefined, f.dependencies);
    assert.equal(f.calls.filter(call => call.run).length, 1);
});

test('failed ref selection blocks iteration instead of measuring the managed clone default branch', async t => {
    const f = await sourceSelectionFixture(t);
    await assert.rejects(quickStart('bootstrap', undefined, f.dependencies,
        ['--runtime-ref', 'origin/does-not-exist']), /does-not-exist/);
    const saved = JSON.parse(await readFile(f.dependencies.stateFile, 'utf8'));
    assert.equal(saved.pendingRuntimeRef, 'origin/does-not-exist');
    assert.equal(f.git(saved.runtimeRepo, 'rev-parse', 'HEAD'), f.main);
    await assert.rejects(quickStart('iterate', undefined, f.dependencies), /was not confirmed.*refusing to measure a different/);
    assert.equal(f.builds(), 0);
    assert.equal(f.git(saved.runtimeRepo, 'rev-parse', 'HEAD'), f.main);
});

test('successful requested-ref selection permits build-failure retries without switching later local edits', async t => {
    const f = await sourceSelectionFixture(t);
    await assert.rejects(quickStart('bootstrap', undefined, f.dependencies,
        ['--runtime-ref', 'origin/contributor-fix']), /fixture source build failed/);
    const saved = JSON.parse(await readFile(f.dependencies.stateFile, 'utf8'));
    assert.equal(saved.pendingRuntimeRef, undefined);
    assert.equal(saved.selectedRuntimeCommit, f.selected);
    assert.equal(f.git(saved.runtimeRepo, 'rev-parse', 'HEAD'), f.selected);
    await writeFile(join(saved.runtimeRepo, 'tracked.txt'), 'local edit after selection\n');
    const dirty = f.git(saved.runtimeRepo, 'status', '--porcelain');
    await assert.rejects(quickStart('iterate', undefined, f.dependencies), /fixture source build failed/);
    assert.equal(f.builds(), 2);
    assert.equal(f.git(saved.runtimeRepo, 'rev-parse', 'HEAD'), f.selected);
    assert.equal(f.git(saved.runtimeRepo, 'status', '--porcelain'), dirty);
    assert.equal(await readFile(join(saved.runtimeRepo, 'tracked.txt'), 'utf8'), 'local edit after selection\n');
});

test('browser and ZIP extractor defaults are platform-aware and honor explicit extractor choice', async () => {
    const probeTar = async name => ({ ok: name === 'bsdtar' });
    const mac = await selectDefaults({ platform: 'darwin', env: {}, home: '/home',
        exists: path => path.startsWith('/Applications/'), checkTar: probeTar });
    assert.deepEqual(mac, { systemChrome: true, tar: 'bsdtar' });
    const windows = await selectDefaults({ platform: 'win32', env: { PROGRAMFILES: '/programs', BENCH_TAR: 'custom-tar' },
        exists: () => true, checkTar: async () => { throw new Error('Do not replace an explicit extractor'); } });
    assert.deepEqual(windows, { systemChrome: true, tar: 'custom-tar' });
    const linux = await selectDefaults({ platform: 'linux', env: {},
        probe: () => ({ ok: false }), checkTar: async () => ({ ok: true }) });
    assert.deepEqual(linux, { systemChrome: false, tar: 'tar' });
});

test('bootstrap forwards and remembers explicit variant, SDK/source and measurement options', async t => {
    const f = await fixture(t);
    await quickStart('bootstrap', './runtime', f.dependencies,
        ['--variant', 'r2r', '--sdk', './matching-sdk', '--exclude-source', 'nuget.org',
            '--', '--cold-runs', '3', '--warm-runs', '2']);
    await quickStart('iterate', undefined, f.dependencies);
    const runs = f.calls.filter(call => call.run).map(call => call.run);
    assert.ok(runs.every(options => options.variant === 'aot' && options['before-variant'] === 'aot'));
    assert.deepEqual(runs[1]['exclude-source'], ['nuget.org']);
    assert.equal(runs[1].sdk, resolve('./matching-sdk'));
    assert.ok(runs[1].measureArgs.includes('3'));
    await quickStart('iterate', undefined, f.dependencies, ['--variant', 'composite']);
    assert.equal(f.calls.filter(call => call.run).at(-1).run.variant, 'composite');
    assert.equal(f.calls.filter(call => call.run).at(-1).run['before-variant'], 'composite');
});

test('previous mixed-mode settings migrate to matched variants without changing the supplied checkout', async t => {
    const f = await fixture(t);
    await quickStart('bootstrap', './runtime', f.dependencies);
    const saved = JSON.parse(await readFile(f.dependencies.stateFile, 'utf8'));
    saved.version = 2;
    saved.compareArgs.splice(saved.compareArgs.indexOf('--'), 0, '--before-variant', 'aot');
    await writeFile(f.dependencies.stateFile, JSON.stringify(saved));
    await quickStart('iterate', undefined, f.dependencies);
    const migrated = JSON.parse(await readFile(f.dependencies.stateFile, 'utf8'));
    assert.equal(migrated.version, 3);
    assert.equal(migrated.runtimeRepo, saved.runtimeRepo);
    const options = f.calls.filter(call => call.run).at(-1).run;
    assert.equal(options.variant, 'composite');
    assert.equal(options['before-variant'], 'composite');
    await quickStart('iterate', undefined, f.dependencies, ['--variant', 'r2r']);
    assert.equal(f.calls.filter(call => call.run).at(-1).run['before-variant'], 'aot');
});

test('old interpreter settings require an explicit bootstrap rather than silently switching the experiment', async t => {
    const f = await fixture(t);
    await writeFile(f.dependencies.stateFile, JSON.stringify({ version: 1 }));
    await assert.rejects(quickStart('iterate', undefined, f.dependencies), /Old interpreter-only settings.*bootstrap/);
    assert.equal(f.calls.length, 0);
});

test('thin bootstrap/iterate entry points share help and reject extra arguments before doing work', () => {
    for (const script of ['bootstrap', 'iterate']) {
        const path = fileURLToPath(new URL(`../../bench/${script}.mjs`, import.meta.url));
        const help = spawnSync(process.execPath, [path, '--help'], { encoding: 'utf8' });
        assert.equal(help.status, 0, help.stderr);
        assert.match(help.stdout, /node bench\/bootstrap\.mjs \[runtime-path\]/);
        assert.match(help.stdout, /node bench\/iterate\.mjs/);
        assert.match(help.stdout, /separate clean merge-base checkout/);
        const invalid = spawnSync(process.execPath, [path, 'runtime', 'extra'], { encoding: 'utf8' });
        assert.equal(invalid.status, 1);
        assert.match(invalid.stderr, /Only bootstrap accepts one optional runtime path|Unexpected argument/);
        assert.equal(invalid.stdout, '');
    }
});
