import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildContext } from '../src/args.js';
import { run as schedule } from '../src/stages/schedule.js';

function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}

for (const scenario of ['expired-lock', 'older-servicing', 'pull-failure', 'push-failure', 'active-lock', 'dry-run']) {
    test(`scheduler handles ${scenario} without dirtying the tracking checkout before pulling`, async t => {
        const root = await mkdtemp(join(tmpdir(), 'benchmark-schedule-'));
        const token = process.env.GH_TOKEN;
        process.env.GH_TOKEN = 'test-token';
        try {
            const tracking = join(root, 'tracking');
            const remote = join(root, 'remote.git');
            const artifacts = join(root, 'artifacts');
            await mkdir(tracking);
            await mkdir(artifacts);
            git(root, 'init', '--bare', remote);
            git(tracking, 'init', '-b', 'tracking');
            git(tracking, 'config', 'user.name', 'Test');
            git(tracking, 'config', 'user.email', 'test@example.com');
            const sdkVersion = scenario === 'older-servicing' ? '10.0.108' : '11.0.100';
            await mkdir(join(tracking, 'locks'));
            const lockPath = join(tracking, 'locks', `${sdkVersion}.lock`);
            const originalLock = {
                dispatchedAt: scenario === 'active-lock' ? new Date().toISOString() : '2026-10-13T00:00:00Z',
                ciRunId: 'old-run', attempt: 1,
            };
            await writeFile(lockPath, JSON.stringify(originalLock));
            git(tracking, 'add', '.');
            git(tracking, 'commit', '-m', 'Seed lock');
            git(tracking, 'remote', 'add', 'origin', remote);
            git(tracking, 'push', '--set-upstream', 'origin', 'tracking');
            if (scenario === 'pull-failure') {
                git(tracking, 'remote', 'set-url', 'origin', join(root, 'missing.git'));
            } else if (scenario === 'push-failure') {
                git(tracking, 'remote', 'set-url', '--push', 'origin', join(root, 'missing.git'));
            }
            await writeFile(join(artifacts, 'release-packs-list.json'), JSON.stringify({
                packs: [{ sdkVersion, runtimeGitHash: 'runtime-fixture' }],
            }));
            const dispatches: unknown[] = [];
            t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
                assert.equal(String(input), 'https://api.github.com/repos/test/bench/actions/workflows/benchmark.yml/dispatches');
                dispatches.push(JSON.parse(String(init?.body)));
                return new Response(null, { status: 204 });
            });
            const ctx = {
                ...await buildContext(['--sdk-channel', sdkVersion.split('.').slice(0, 2).join('.')]),
                repoRoot: root, artifactsDir: artifacts, repo: 'test/bench', branch: 'main',
                ciRunId: 'new-run', dryRun: scenario === 'dry-run',
            };
            if (scenario === 'pull-failure' || scenario === 'push-failure') {
                await assert.rejects(schedule(ctx), /Command failed|Cannot persist.*lock|Failed to.*lock/);
                assert.deepEqual(dispatches, []);
            } else {
                await schedule(ctx);
                if (scenario === 'active-lock' || scenario === 'dry-run') {
                    assert.deepEqual(dispatches, []);
                } else {
                    assert.deepEqual(dispatches, [{
                        ref: 'main', inputs: { sdk_version: sdkVersion, sdk_channel: ctx.sdkChannel },
                    }]);
                    const persisted = JSON.parse(git(tracking, 'show', `origin/tracking:locks/${sdkVersion}.lock`));
                    assert.equal(persisted.attempt, 2);
                    assert.equal(persisted.ciRunId, 'new-run');
                }
                if (scenario === 'dry-run') {
                    assert.equal(JSON.parse(await readFile(lockPath, 'utf8')).attempt, 2);
                    await schedule(ctx);
                    assert.equal(JSON.parse(await readFile(lockPath, 'utf8')).attempt, 2);
                    assert.deepEqual(dispatches, []);
                }
            }
            if (scenario !== 'dry-run') assert.equal(git(tracking, 'status', '--porcelain'), '');
        } finally {
            if (token === undefined) delete process.env.GH_TOKEN;
            else process.env.GH_TOKEN = token;
            await rm(root, { recursive: true, force: true });
        }
    });
}
