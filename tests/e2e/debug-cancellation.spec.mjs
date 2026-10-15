import { test, expect } from 'playwright/test';
import { spawn } from 'node:child_process';
import { access, chmod, copyFile, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

function alive(pid) {
    try { process.kill(pid, 0); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    test(`${signal} during real browser navigation cleans SDK descendants and persists cancellation`, async () => {
        test.skip(process.platform === 'win32', 'The Debug supervisor supports macOS/Linux');
        const root = await mkdtemp(join(tmpdir(), 'debug-cancellation-'));
        const fakeDotnet = join(root, 'dotnet.mjs');
        await copyFile('tests/helpers/debug-cancellation-dotnet.mjs', fakeDotnet);
        await chmod(fakeDotnet, 0o755);
        const proc = spawn(process.execPath, [
            '--import', resolve('bench/node_modules/tsx/dist/loader.mjs'),
            resolve('tests/helpers/debug-cancellation-runner.mjs'), fakeDotnet,
        ], {
            cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, ARTIFACTS_DIR: join(root, 'artifacts'), DEBUG_CANCELLATION_FIXTURE: root, CI: '' },
        });
        let output = '';
        proc.stdout.on('data', chunk => { output += chunk; });
        proc.stderr.on('data', chunk => { output += chunk; });
        const exited = new Promise((resolveExit, reject) => {
            proc.once('error', reject);
            proc.once('close', (code, signal) => resolveExit({ code, signal }));
        });
        let ownedPids = [];
        try {
            await expect.poll(async () => {
                if (proc.exitCode !== null || proc.signalCode !== null) throw new Error(output);
                try { await access(join(root, 'navigation-pending')); return true; }
                catch (error) { if (error.code === 'ENOENT') return false; throw error; }
            }, { timeout: 20000 }).toBe(true);
            ownedPids = (await readFile(join(root, 'owned-pids'), 'utf8')).trim().split('\n').map(Number);
            expect(ownedPids).toHaveLength(2);
            const start = Date.now();
            proc.kill(signal);
            await sleep(30);
            // Repeated signals must not restore Node's default hard-exit behavior during cleanup.
            proc.kill(signal);
            await expect.poll(() => proc.exitCode, { timeout: 10000 }).not.toBeNull();
            expect(await exited).toEqual({ code: 1, signal: null });
            expect(Date.now() - start).toBeLessThan(10000);
            for (const pid of ownedPids) expect(alive(pid)).toBe(false);
            const resultsDir = join(root, 'artifacts', 'debug-results');
            const files = await readdir(resultsDir);
            expect(files).toHaveLength(1);
            const batch = JSON.parse(await readFile(join(resultsDir, files[0]), 'utf8'));
            const metric = batch.runtimes.mono.measurements['debug-first-run-to-first-render'];
            expect(batch.smoke).toBe(true);
            expect(metric.status).toBe('cancelled');
            expect(metric.attempts).toHaveLength(1);
            expect(metric.attempts[0].status).toBe('cancelled');
            expect(metric.attempts[0].reason).toContain(signal);
            expect(metric.valueMs).toBeNull();
            expect(metric.successful).toBe(0);
        } finally {
            if (proc.exitCode === null && proc.signalCode === null) {
                proc.kill('SIGTERM');
                await Promise.race([exited, sleep(10000)]);
                if (proc.exitCode === null && proc.signalCode === null) { proc.kill('SIGKILL'); await exited; }
            }
            if (!ownedPids.length) {
                try { ownedPids = (await readFile(join(root, 'owned-pids'), 'utf8')).trim().split('\n').map(Number); }
                catch (error) { if (error.code !== 'ENOENT') throw error; }
            }
            for (const pid of ownedPids) if (alive(pid)) process.kill(pid, 'SIGKILL');
            await rm(root, { recursive: true, force: true });
        }
    });
}
