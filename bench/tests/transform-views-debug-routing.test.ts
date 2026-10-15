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
