import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildContext } from '../src/args.js';
import {
    getRuntimeSource,
    recordRuntimeSdk,
    sdkInfoForRuntime,
    type RuntimeSourceInfo,
    type RuntimeSources,
    type SdkInfo,
} from '../src/context.js';
import { App, Engine, Preset, Profile, Runtime } from '../src/enums.js';
import { buildResultFilename } from '../src/lib/measure-utils.js';
import { buildMeta } from '../src/stages/measure.js';
import {
    MONO_RUNTIME_REF,
    MONO_RUNTIME_REPO,
    resolveSourceBuiltRuntimeSources,
    type RuntimeSourceSelection,
} from '../src/stages/resolve-sdk.js';
import {
    comparisonSdkInfo,
    run as transformViews,
    runtimeComparisonKey,
} from '../src/stages/transform-views.js';

const CORECLR_COMMIT = '1111111111111111111111111111111111111111';
const MONO_COMMIT = '2222222222222222222222222222222222222222';

function source(
    selection: RuntimeSourceSelection,
    commit: string,
    committedAt: string,
): RuntimeSourceInfo {
    return {
        repo: selection.repo,
        ref: selection.ref,
        commit,
        committedAt,
        commitAuthor: `${selection.ref} author`,
        commitMessage: `${selection.ref} subject`,
    };
}

function sdkInfo(runtimeSources?: RuntimeSources): SdkInfo {
    return {
        sdkVersion: '12.0.100-alpha.1.26557.102',
        major: 12,
        minor: 0,
        patch: 100,
        channel: '12.0',
        isPrerelease: true,
        runtimeGitHash: CORECLR_COMMIT,
        aspnetCoreGitHash: '3333333333333333333333333333333333333333',
        sdkGitHash: '4444444444444444444444444444444444444444',
        vmrGitHash: '5555555555555555555555555555555555555555',
        runtimeCommitDateTime: '2026-11-15T12:00:00Z',
        runtimeCommitAuthor: 'CoreCLR author',
        runtimeCommitMessage: 'CoreCLR subject',
        aspnetCoreCommitDateTime: '2026-11-15T11:00:00Z',
        aspnetCoreCommitAuthor: 'ASP.NET author',
        aspnetCoreCommitMessage: 'ASP.NET subject',
        aspnetCoreVersion: '12.0.0-test',
        runtimePackVersion: '12.0.0-test',
        isRuntimeCustomBuild: true,
        workloadVersion: '12.0.100-test',
        bootstrapSdkVersion: '12.0.100-test',
        releaseDate: '2026-11-15',
        bundledFrameworkTfm: 'net12.0',
        runtimeSources,
    };
}

function splitSources(): RuntimeSources {
    const sources = {
        [Runtime.CoreCLR]: {
            ...source(
                { repo: 'fork/runtime', ref: 'feature/coreclr' },
                CORECLR_COMMIT,
                '2026-11-15T12:00:00Z',
            ),
            runtimePackVersion: '12.0.0-coreclr-test',
            sdkVersion: '12.0.100-alpha.1.26557.102',
            targetFramework: 'net12.0',
        },
        [Runtime.Mono]: {
            ...source(
                { repo: MONO_RUNTIME_REPO, ref: MONO_RUNTIME_REF },
                MONO_COMMIT,
                '2026-11-14T10:00:00Z',
            ),
            runtimePackVersion: '11.0.0-mono-test',
            sdkVersion: '11.0.100',
            targetFramework: 'net11.0',
        },
    };
    return {
        coreclr: recordRuntimeSdk(sources.coreclr, sdkInfo()),
        mono: recordRuntimeSdk(sources.mono, {
            ...sdkInfo(), sdkVersion: '11.0.100', major: 11, channel: '11.0',
            isPrerelease: false, bundledFrameworkTfm: 'net11.0',
            aspnetCoreVersion: '11.0.0', sdkGitHash: '7'.repeat(40),
        }),
    };
}

test('source-built comparison resolves the fixed Mono branch independently from custom CoreCLR', async () => {
    const calls: RuntimeSourceSelection[] = [];
    const sources = await resolveSourceBuiltRuntimeSources(
        { repo: 'fork/runtime', ref: 'feature/coreclr', commitish: 'abc123' },
        async selection => {
            calls.push(selection);
            return selection.ref === MONO_RUNTIME_REF
                ? source(selection, MONO_COMMIT, '2026-11-14T10:00:00Z')
                : source(selection, CORECLR_COMMIT, '2026-11-15T12:00:00Z');
        },
    );

    assert.deepEqual(calls, [
        { repo: 'fork/runtime', ref: 'feature/coreclr', commitish: 'abc123' },
        { repo: MONO_RUNTIME_REPO, ref: MONO_RUNTIME_REF },
    ]);
    assert.equal(sources[Runtime.CoreCLR].repo, 'fork/runtime');
    assert.equal(sources[Runtime.CoreCLR].ref, 'feature/coreclr');
    assert.equal(sources[Runtime.CoreCLR].commit, CORECLR_COMMIT);
    assert.equal(sources[Runtime.Mono].repo, MONO_RUNTIME_REPO);
    assert.equal(sources[Runtime.Mono].ref, MONO_RUNTIME_REF);
    assert.equal(sources[Runtime.Mono].commit, MONO_COMMIT);
});

test('source resolution rejects non-canonical commit pins instead of silently falling back', async () => {
    await assert.rejects(
        resolveSourceBuiltRuntimeSources(
            { repo: 'fork/runtime', ref: 'feature/coreclr' },
            async selection => source(selection, 'abc123', '2026-11-15T12:00:00Z'),
        ),
        /full 40-character commit/,
    );
});

test('runtime-specific result metadata and filenames use the actual source arm', async () => {
    const resolved = sdkInfo(splitSources());
    const monoInfo = sdkInfoForRuntime(resolved, Runtime.Mono);
    const coreclrInfo = sdkInfoForRuntime(resolved, Runtime.CoreCLR);

    assert.equal(monoInfo.runtimeGitHash, MONO_COMMIT);
    assert.equal(monoInfo.runtimeCommitDateTime, '2026-11-14T10:00:00Z');
    assert.equal(monoInfo.runtimePackVersion, '11.0.0-mono-test');
    assert.equal(monoInfo.runtimeSources?.[Runtime.Mono]?.sdkVersion, '11.0.100');
    assert.equal(monoInfo.runtimeSources?.[Runtime.Mono]?.targetFramework, 'net11.0');
    assert.equal(monoInfo.sdkVersion, '11.0.100');
    assert.equal(monoInfo.major, 11);
    assert.equal(monoInfo.aspnetCoreVersion, '11.0.0');
    assert.equal(monoInfo.sdkGitHash, '7'.repeat(40));
    assert.equal(coreclrInfo.runtimeGitHash, CORECLR_COMMIT);
    assert.equal(coreclrInfo.runtimePackVersion, '12.0.0-coreclr-test');
    assert.match(
        buildResultFilename(
            monoInfo,
            Runtime.Mono,
            Preset.DevLoop,
            Profile.Desktop,
            Engine.Chrome,
            App.EmptyBlazor,
        ),
        new RegExp(`_${MONO_COMMIT.slice(0, 7)}_mono_`),
    );

    const ctx = { ...await buildContext([]), sdkInfo: resolved };
    const meta = buildMeta(ctx, {
        app: App.EmptyBlazor,
        preset: Preset.DevLoop,
        runtime: Runtime.Mono,
        compileTimeMs: 1,
        integrity: { fileCount: 1, totalBytes: 1 },
        publishDir: '/tmp/publish',
    }, Engine.Chrome, Profile.Desktop);
    assert.equal(meta.runtimeGitHash, MONO_COMMIT);
    assert.deepEqual(meta.runtimeSource, getRuntimeSource(monoInfo, Runtime.Mono));
});

test('missing runtime-specific SDK and TFM stay unknown', () => {
    const sources = splitSources();
    const mono = { ...sources[Runtime.Mono]! };
    delete mono.sdkVersion;
    delete mono.targetFramework;
    const projected = sdkInfoForRuntime(sdkInfo({
        ...sources,
        [Runtime.Mono]: mono,
    }), Runtime.Mono);

    assert.equal(projected.runtimeSources?.[Runtime.Mono]?.sdkVersion, undefined);
    assert.equal(projected.runtimeSources?.[Runtime.Mono]?.targetFramework, undefined);
});

test('consolidated columns retain both sources while using CoreCLR as the comparison anchor', () => {
    const resolved = sdkInfo(splitSources());
    const monoResultInfo = sdkInfoForRuntime(resolved, Runtime.Mono);
    const column = comparisonSdkInfo(monoResultInfo);

    assert.equal(column.runtimeGitHash, CORECLR_COMMIT);
    assert.equal(column.runtimeSources?.[Runtime.Mono]?.commit, MONO_COMMIT);
    assert.equal(column.runtimeSources?.[Runtime.CoreCLR]?.commit, CORECLR_COMMIT);
    assert.equal(runtimeComparisonKey(monoResultInfo), runtimeComparisonKey(resolved));
    const differentMono = sdkInfo({
        ...splitSources(),
        [Runtime.Mono]: {
            ...splitSources()[Runtime.Mono]!,
            commit: '6666666666666666666666666666666666666666',
        },
    });
    assert.notEqual(runtimeComparisonKey(monoResultInfo), runtimeComparisonKey(differentMono));
    const differentSdk = sdkInfo(splitSources());
    differentSdk.runtimeSources!.mono!.sdkVersion = '11.0.101';
    assert.notEqual(runtimeComparisonKey(monoResultInfo), runtimeComparisonKey(differentSdk));
});

test('transform-views publishes both source descriptors in one comparison column', async t => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'runtime-provenance-'));
    const previousGitConfig = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = join(repoRoot, 'gitconfig');
    t.after(async () => {
        if (previousGitConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL;
        else process.env.GIT_CONFIG_GLOBAL = previousGitConfig;
        await rm(repoRoot, { recursive: true, force: true });
    });

    const ghPages = join(repoRoot, 'gh-pages');
    const remote = join(repoRoot, 'remote.git');
    await mkdir(ghPages, { recursive: true });
    execFileSync('git', ['init', '--bare', '--quiet', remote]);
    execFileSync('git', ['init', '--quiet', '-b', 'gh-pages'], { cwd: ghPages });
    execFileSync('git', [
        '-c', 'user.name=Test',
        '-c', 'user.email=test@example.com',
        'commit', '--allow-empty', '--quiet', '-m', 'Seed',
    ], { cwd: ghPages });
    execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: ghPages });
    execFileSync('git', ['push', '--quiet', '--set-upstream', 'origin', 'gh-pages'], { cwd: ghPages });

    const resolved = sdkInfo(splitSources());
    const resultsDir = join(repoRoot, 'results');
    await mkdir(resultsDir);
    for (const runtime of [Runtime.Mono, Runtime.CoreCLR]) {
        const runtimeInfo = sdkInfoForRuntime(resolved, runtime);
        await writeFile(join(resultsDir, `${runtime}.json`), JSON.stringify({
            meta: {
                ...runtimeInfo,
                runtimeSource: getRuntimeSource(runtimeInfo, runtime),
                runtime,
                preset: Preset.DevLoop,
                profile: Profile.Desktop,
                engine: Engine.Chrome,
                app: App.EmptyBlazor,
                benchmarkDateTime: '2026-11-16T12:00:00Z',
                ciRunId: '1234',
                ciRunUrl: 'https://github.com/example/bench/actions/runs/1234',
                environment: { os: `${runtime} capture host`, arch: 'arm64' },
                buildEnvironment: { os: `${runtime} build host`, arch: 'x64' },
            },
            metrics: {
                'time-to-reach-managed-cold': runtime === Runtime.Mono ? 110 : 100,
                'compile-time': 1000,
            },
        }));
    }

    const base = await buildContext(['--stages', 'transform-views']);
    await transformViews({
        ...base,
        repoRoot,
        resultsDir,
        artifactsInputDir: undefined,
        sdkInfo: resolved,
    });

    const viewsRoot = join(ghPages, 'data', 'views');
    const week = (await readdir(viewsRoot)).find(entry => /^\d{4}-\d{2}-\d{2}$/.test(entry));
    assert.ok(week);
    const header = JSON.parse(await readFile(join(viewsRoot, week, 'header.json'), 'utf-8')) as {
        columns: (SdkInfo & { benchmarkDateTime: string; ciRunId: string; ciRunUrl: string })[];
    };
    assert.equal(header.columns.length, 1);
    assert.equal(header.columns[0].runtimeGitHash, CORECLR_COMMIT);
    assert.equal(header.columns[0].sdkVersion, resolved.sdkVersion);
    assert.equal(header.columns[0].major, 12);
    assert.equal(header.columns[0].benchmarkDateTime, '2026-11-16T12:00:00Z');
    assert.equal(header.columns[0].ciRunId, '1234');
    assert.equal(header.columns[0].ciRunUrl, 'https://github.com/example/bench/actions/runs/1234');
    assert.equal(header.columns[0].runtimeSources?.[Runtime.Mono]?.commit, MONO_COMMIT);
    assert.equal(header.columns[0].runtimeSources?.[Runtime.CoreCLR]?.commit, CORECLR_COMMIT);
    for (const [metric, kind] of [['time-to-reach-managed-cold', 'capture'], ['compile-time', 'build']]) {
        const environments = JSON.parse(await readFile(
            join(viewsRoot, week, `empty-blazor_${metric}.environment.json`), 'utf8',
        ));
        for (const runtime of [Runtime.Mono, Runtime.CoreCLR]) {
            assert.deepEqual(environments[`${runtime}/dev-loop/desktop/chrome`][0], [{
                os: `${runtime} ${kind} host`, arch: kind === 'capture' ? 'arm64' : 'x64',
            }]);
        }
    }
});

test('legacy same-source contexts preserve their original result and column semantics', async () => {
    const legacy = sdkInfo();
    const monoInfo = sdkInfoForRuntime(legacy, Runtime.Mono);
    assert.equal(monoInfo, legacy);
    assert.equal(comparisonSdkInfo(legacy), legacy);
    assert.equal(runtimeComparisonKey(legacy), CORECLR_COMMIT);

    const ctx = { ...await buildContext([]), sdkInfo: legacy };
    const meta = buildMeta(ctx, {
        app: App.EmptyBlazor,
        preset: Preset.DevLoop,
        runtime: Runtime.Mono,
        compileTimeMs: 1,
        integrity: { fileCount: 1, totalBytes: 1 },
        publishDir: '/tmp/publish',
    }, Engine.Chrome, Profile.Desktop);
    assert.equal(meta.runtimeGitHash, CORECLR_COMMIT);
    assert.equal('runtimeSource' in meta, false);
});

test('manual runtime commit inputs remain the CoreCLR selection contract', async () => {
    const ctx = await buildContext([
        '--runtime-commit', 'abc123',
        '--runtime-repo', 'fork/runtime',
    ]);
    assert.equal(ctx.runtimeCommit, 'abc123');
    assert.equal(ctx.runtimeRepo, 'fork/runtime');
    assert.equal(ctx.runtimeRef, '');
});

test('production workflow checks out runtime-specific pins while preserving compatibility outputs', async () => {
    const workflow = await readFile(
        join(import.meta.dirname, '..', '..', '.github', 'workflows', 'benchmark.yml'),
        'utf-8',
    );
    const monoJob = workflow.slice(
        workflow.indexOf('  build-runtime-mono:'),
        workflow.indexOf('  build-runtime-coreclr:'),
    );
    const coreclrJob = workflow.slice(
        workflow.indexOf('  build-runtime-coreclr:'),
        workflow.indexOf('  build-aspnetcore:'),
    );

    assert.match(workflow, /runtime-commit: \$\{\{ steps\.sdk-version\.outputs\.runtime-commit \}\}/);
    assert.match(monoJob, /needs\.resolve\.outputs\.mono-runtime-repo/);
    assert.match(monoJob, /needs\.resolve\.outputs\.mono-runtime-commit/);
    assert.doesNotMatch(monoJob, /needs\.resolve\.outputs\.runtime-commit/);
    assert.match(coreclrJob, /needs\.resolve\.outputs\.coreclr-runtime-repo/);
    assert.match(coreclrJob, /needs\.resolve\.outputs\.coreclr-runtime-commit/);
    assert.match(workflow, /Record source-built runtime pack versions/);
});
