import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { debugBatch } from '../../tests/helpers/debug-fixture.mjs';
import { publishDebugViews } from '../src/lib/debug-publication.js';
import { writeDebugViews } from '../src/lib/debug-views.js';

function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function commit(dir: string, message: string): void {
    git(dir, 'config', 'user.name', 'Debug publication test');
    git(dir, 'config', 'user.email', 'debug-test@example.com');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', message, '-m', 'Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>');
}

async function seedPublication(root: string) {
    const remote = join(root, 'remote.git'), seed = join(root, 'seed'), worker = join(root, 'worker');
    await mkdir(remote);
    git(remote, 'init', '--bare', '--initial-branch=gh-pages');
    git(root, 'clone', remote, seed);
    const batch = debugBatch('empty-blazor', '2026-09-28');
    await writeDebugViews([batch], join(seed, 'data/views/debug'));
    await writeFile(join(seed, 'data/views/index.json'), '{"legacy":"unchanged"}\n');
    commit(seed, 'Seed test publication');
    git(seed, 'push', '-u', 'origin', 'gh-pages');
    git(root, 'clone', remote, worker);
    return { remote, worker, batch };
}

test('Debug publication recomputes the union after a concurrent publisher wins the push', async () => {
    const root = await mkdtemp(join(tmpdir(), 'debug-publication-race-'));
    try {
        const { remote, worker, batch: original } = await seedPublication(root);
        const racer = join(root, 'racer');
        git(root, 'clone', remote, racer);
        const concurrent = debugBatch('havit-bootstrap', '2026-09-29');
        const incoming = debugBatch('havit-bootstrap', '2026-09-30');
        await writeDebugViews([concurrent], join(racer, 'data/views/debug'));
        commit(racer, 'Concurrent Debug batch');
        const hook = join(worker, '.git/hooks/pre-push');
        const marker = join(root, 'concurrent-push-complete');
        await writeFile(hook, `#!/usr/bin/env node
const { existsSync, writeFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
if (!existsSync(${JSON.stringify(marker)})) {
    writeFileSync(${JSON.stringify(marker)}, 'pushed');
    execFileSync('git', ['-C', ${JSON.stringify(racer)}, 'push'], { stdio: 'inherit' });
}
`);
        await chmod(hook, 0o755);

        // All Git traffic is between isolated local repositories, never a GitHub remote.
        await publishDebugViews([incoming], worker);

        assert.equal(await readFile(marker, 'utf8'), 'pushed');
        assert.equal(git(worker, 'status', '--porcelain'), '');
        assert.equal(git(worker, 'rev-parse', 'HEAD'), git(worker, 'rev-parse', 'origin/gh-pages'));
        const index = JSON.parse(git(worker, 'show', 'origin/gh-pages:data/views/debug/index.json'));
        const ids = index.apps.flatMap((app: { file: string }) => {
            const data = JSON.parse(git(worker, 'show', `origin/gh-pages:data/views/debug/${app.file}`));
            assert.equal(data.generation, index.generation);
            return data.batches.map((b: { id: string }) => b.id);
        });
        assert.deepEqual(ids.sort(), [original.id, concurrent.id, incoming.id].sort());
        assert.equal(git(worker, 'show', 'origin/gh-pages:data/views/index.json'), '{"legacy":"unchanged"}');
        assert.equal(git(worker, 'log', '--format=%s', '--grep=Update clean Debug results').split('\n').length, 1);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('publication errors preserve user work and fail explicitly after bounded retries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'debug-publication-errors-'));
    try {
        const { worker } = await seedPublication(root);
        const incoming = debugBatch('havit-bootstrap');
        const original = JSON.stringify(incoming);
        const userFile = join(worker, 'user-change.txt');
        await writeFile(userFile, 'preserve me');
        await assert.rejects(() => publishDebugViews([incoming], worker), /clean, dedicated/);
        assert.equal(await readFile(userFile, 'utf8'), 'preserve me');
        await rm(userFile);

        git(worker, 'remote', 'set-url', '--push', 'origin', join(root, 'missing.git'));
        await assert.rejects(() => publishDebugViews([incoming], worker), /failed after bounded retries/);
        assert.equal(JSON.stringify(incoming), original);
        assert.equal(git(worker, 'status', '--porcelain'), '');
        assert.equal(git(worker, 'rev-parse', 'HEAD'), git(worker, 'rev-parse', 'origin/gh-pages'));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
