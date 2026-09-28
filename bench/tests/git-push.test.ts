import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { commitAndPushWithRetry } from '../src/lib/git-push.js';

function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function configureIdentity(dir: string): void {
    git(dir, 'config', 'user.name', 'Test');
    git(dir, 'config', 'user.email', 'test@example.com');
}

test('commitAndPushWithRetry reapplies changes after a concurrent push', async () => {
    const root = await mkdtemp(join(tmpdir(), 'git-push-retry-'));
    try {
        const remote = join(root, 'remote.git');
        const seed = join(root, 'seed');
        const worker = join(root, 'worker');
        const racer = join(root, 'racer');
        await mkdir(remote);
        git(remote, 'init', '--bare');
        git(root, 'clone', remote, seed);
        configureIdentity(seed);
        await writeFile(join(seed, 'README.md'), 'seed\n');
        git(seed, 'add', 'README.md');
        git(seed, 'commit', '-m', 'seed');
        git(seed, 'branch', '-M', 'tracking');
        git(seed, 'push', '-u', 'origin', 'tracking');
        git(root, 'clone', '--branch', 'tracking', remote, worker);
        git(root, 'clone', '--branch', 'tracking', remote, racer);
        configureIdentity(worker);
        configureIdentity(racer);

        let applyCount = 0;
        const pushed = await commitAndPushWithRetry({
            dir: worker,
            addPaths: ['locks/test.failed'],
            commitMessage: 'report failure',
            label: 'test marker',
            dryRun: false,
            maxRetries: 3,
            applyChanges: async () => {
                applyCount++;
                if (applyCount === 1) {
                    await writeFile(join(racer, 'concurrent.txt'), 'concurrent\n');
                    git(racer, 'add', 'concurrent.txt');
                    git(racer, 'commit', '-m', 'concurrent');
                    git(racer, 'push');
                }
                await mkdir(join(worker, 'locks'), { recursive: true });
                await writeFile(join(worker, 'locks', 'test.failed'), `attempt ${applyCount}\n`);
            },
        });

        assert.equal(pushed, true);
        assert.equal(applyCount, 2);
        assert.equal((await readFile(join(worker, 'concurrent.txt'), 'utf-8')).trim(), 'concurrent');
        assert.equal(git(worker, 'show', 'origin/tracking:locks/test.failed'), 'attempt 2');
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('commitAndPushWithRetry cleans up a commit after retries are exhausted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'git-push-cleanup-'));
    try {
        const remote = join(root, 'remote.git');
        const seed = join(root, 'seed');
        const worker = join(root, 'worker');
        await mkdir(remote);
        git(remote, 'init', '--bare');
        git(root, 'clone', remote, seed);
        configureIdentity(seed);
        await writeFile(join(seed, 'README.md'), 'seed\n');
        git(seed, 'add', 'README.md');
        git(seed, 'commit', '-m', 'seed');
        git(seed, 'branch', '-M', 'tracking');
        git(seed, 'push', '-u', 'origin', 'tracking');
        git(root, 'clone', '--branch', 'tracking', remote, worker);
        configureIdentity(worker);
        git(worker, 'remote', 'set-url', '--push', 'origin', join(root, 'missing.git'));

        const pushed = await commitAndPushWithRetry({
            dir: worker,
            addPaths: ['locks/test.failed'],
            commitMessage: 'report failure',
            label: 'test marker',
            dryRun: false,
            maxRetries: 1,
            applyChanges: async () => {
                await mkdir(join(worker, 'locks'), { recursive: true });
                await writeFile(join(worker, 'locks', 'test.failed'), 'failure\n');
            },
        });

        assert.equal(pushed, false);
        assert.equal(git(worker, 'status', '--porcelain'), '');
        assert.equal(git(worker, 'rev-parse', 'HEAD'), git(worker, 'rev-parse', 'origin/tracking'));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
