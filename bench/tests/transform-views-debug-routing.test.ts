import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContext } from '../src/args.js';
import { validateDebugBatch } from '../src/lib/debug-results.js';
import { writeDebugViews } from '../src/lib/debug-views.js';
import { run as transformViews } from '../src/stages/transform-views.js';
import { debugBatch } from '../../tests/helpers/debug-fixture.mjs';

test('ordinary transform-views neither creates nor merges Debug views', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'transform-views-debug-routing-'));
    const gitConfig = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = join(repoRoot, 'gitconfig');
    try {
        const ghPages = join(repoRoot, 'gh-pages');
        await mkdir(ghPages, { recursive: true });
        const remote = join(repoRoot, 'remote.git');
        execFileSync('git', ['init', '--bare', '--quiet', remote]);
        execFileSync('git', ['init', '--quiet', '-b', 'gh-pages'], { cwd: ghPages });
        execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com',
            'commit', '--allow-empty', '--quiet', '-m', 'Seed'], { cwd: ghPages });
        execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: ghPages });
        execFileSync('git', ['push', '--quiet', '--set-upstream', 'origin', 'gh-pages'], { cwd: ghPages });
        const resultsDir = join(repoRoot, 'results');
        await mkdir(resultsDir);
        await writeFile(join(resultsDir, 'debug-incoming.json'), JSON.stringify(debugBatch('havit-bootstrap')));
        const base = await buildContext(['--stages', 'transform-views']);
        const ctx = { ...base, repoRoot, resultsDir, artifactsInputDir: undefined };
        const debugDir = join(ghPages, 'data', 'views', 'debug');

        await transformViews(ctx);
        assert.equal(existsSync(debugDir), false);

        const seed: unknown = debugBatch('havit-bootstrap', '2026-09-28');
        validateDebugBatch(seed);
        await writeDebugViews([seed], debugDir);
        const indexPath = join(debugDir, 'index.json');
        const before = await readFile(indexPath, 'utf8');
        await transformViews(ctx);
        assert.equal(await readFile(indexPath, 'utf8'), before);
    } finally {
        if (gitConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL;
        else process.env.GIT_CONFIG_GLOBAL = gitConfig;
        await rm(repoRoot, { recursive: true, force: true });
    }
});

test('publish views retain replica environments per metric and never borrow the measurement host for build time', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'view-environment-'));
    const gitConfig = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = join(repoRoot, 'gitconfig');
    const ghPages = join(repoRoot, 'gh-pages');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: ghPages, stdio: 'pipe' });
    const save = () => {
        git('add', '.');
        git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'Fixture views');
        git('push', '--quiet', 'origin', 'gh-pages');
    };
    try {
        const remote = join(repoRoot, 'remote.git');
        execFileSync('git', ['init', '--bare', '--quiet', remote]);
        await mkdir(ghPages);
        git('init', '--quiet', '-b', 'gh-pages');
        git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '--allow-empty', '-m', 'Seed');
        git('remote', 'add', 'origin', remote);
        git('push', '--quiet', '--set-upstream', 'origin', 'gh-pages');
        const resultsDir = join(repoRoot, 'results');
        await mkdir(resultsDir);
        const meta = {
            sdkVersion: '11.0.100', major: 11, channel: '11.0', releaseDate: '2026-11-10',
            runtimeGitHash: 'a'.repeat(40), runtimeCommitDateTime: '2026-11-01T00:00:00Z',
            runtime: 'mono', preset: 'no-workload', profile: 'desktop', engine: 'chrome', app: 'havit-bootstrap',
        };
        for (const [replica, os] of ['Ubuntu 24.04', 'Ubuntu 22.04'].entries()) {
            await writeFile(join(resultsDir, `result-${replica}.json`), JSON.stringify({
                meta: { ...meta, environment: { os, arch: 'arm64' }, buildEnvironment: { os: 'Ubuntu 24.04', arch: 'x64' } },
                metrics: { 'compile-time': 1000, 'time-to-reach-managed-cold': 100 + replica * 20, 'memory-peak': 50 },
                ...(replica === 0 ? { rawSamples: { 'time-to-reach-managed-cold': [100] } } : {}),
            }));
        }
        const base = await buildContext(['--stages', 'transform-views']);
        const ctx = { ...base, repoRoot, resultsDir, artifactsInputDir: undefined };
        await transformViews(ctx);
        const dir = join(ghPages, 'data/views/releases/net11');
        const row = 'mono/no-workload/desktop/chrome';
        const build = JSON.parse(await readFile(join(dir, 'havit-bootstrap_compile-time.environment.json'), 'utf8'));
        const startup = JSON.parse(await readFile(join(dir, 'havit-bootstrap_time-to-reach-managed-cold.environment.json'), 'utf8'));
        assert.deepEqual(build[row][0], [{ os: 'Ubuntu 24.04', arch: 'x64' }]);
        assert.deepEqual(startup[row][0], [{ os: 'Ubuntu 24.04', arch: 'arm64' }],
            'sample-pooled metrics exclude replicas without raw samples');
        const memory = JSON.parse(await readFile(join(dir, 'havit-bootstrap_memory-peak.environment.json'), 'utf8'));
        assert.deepEqual(memory[row][0].map((e: { os: string }) => e.os).sort(), ['Ubuntu 22.04', 'Ubuntu 24.04']);
        const header = JSON.parse(await readFile(join(dir, 'header.json'), 'utf8'));
        assert.equal(header.columns[0].environment, undefined, 'one runner must not become SDK-wide metadata');
        save();

        const legacyDir = join(repoRoot, 'legacy');
        await mkdir(legacyDir);
        await writeFile(join(legacyDir, 'result.json'), JSON.stringify({ meta, metrics: { 'time-to-reach-managed-cold': 130 } }));
        await writeFile(join(legacyDir, 'known.json'), JSON.stringify({
            meta: { ...meta, environment: { os: 'Ubuntu 24.04', arch: 'arm64' } },
            metrics: { 'time-to-reach-managed-cold': 140 },
        }));
        await transformViews({ ...ctx, resultsDir: legacyDir });
        const updated = JSON.parse(await readFile(join(dir, 'header.json'), 'utf8'));
        assert.deepEqual(updated.environments['havit-bootstrap'], ['compile-time', 'memory-peak'],
            'an unknown overwrite clears stale host metadata');
        assert.deepEqual(JSON.parse(await readFile(join(dir, 'havit-bootstrap_time-to-reach-managed-cold.json'), 'utf8'))[row], [135]);
        assert.deepEqual(JSON.parse(await readFile(join(dir, 'havit-bootstrap_compile-time.environment.json'), 'utf8')), build);
    } finally {
        if (gitConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL;
        else process.env.GIT_CONFIG_GLOBAL = gitConfig;
        await rm(repoRoot, { recursive: true, force: true });
    }
});
