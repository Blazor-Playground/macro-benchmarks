import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DebugProcess } from '../src/lib/debug-process.js';

for (const outcome of ['zombie', 'delayed-exit', 'kill-zombie', 'survivor', 'reused-pid']) {
    test(`owned process cleanup handles ${outcome}`, { skip: process.platform === 'win32' }, async t => {
        const cwd = await mkdtemp(join(tmpdir(), 'debug-process-cleanup-'));
        const previousPath = process.env.PATH;
        let proc: DebugProcess | undefined;
        const signals: NodeJS.Signals[] = [];
        try {
            await writeFile(join(cwd, 'phase'), 'initial');
            await writeFile(join(cwd, 'count'), '0');
            await writeFile(join(cwd, 'ps'), `#!/bin/sh
cd '${cwd}' || exit 1
phase=$(cat phase)
if [ "$phase" = done ]; then exit 0; fi
pid=$(cat pid)
birth='Wed Oct 14 17:36:37 2026'
state=Sl
if [ "$phase" != initial ]; then
    case '${outcome}' in
        zombie) state=Z ;;
        reused-pid) birth='Wed Oct 14 17:36:38 2026' ;;
    esac
fi
if [ "$phase" = SIGKILL ]; then
    count=$(cat count)
    count=$((count + 1))
    echo "$count" > count
    case '${outcome}' in
        delayed-exit) if [ "$count" -ge 5 ]; then exit 0; fi ;;
        kill-zombie) state=Z ;;
    esac
fi
printf '%s %s %s %s %s\\n' "$pid" '${process.pid}' "$birth" "$state" 'node blazor-devserver.dll'
`, { mode: 0o755 });
            process.env.PATH = `${cwd}:${previousPath ?? ''}`;
            proc = new DebugProcess(process.execPath, ['-e', 'setTimeout(() => {}, 100)'], cwd, process.env);
            assert.ok(proc.child.pid);
            const pid = proc.child.pid;
            await writeFile(join(cwd, 'pid'), String(pid));
            assert.deepEqual(await proc.hostPids(), [pid]);
            t.mock.method(process, 'kill', (target: number, signal?: number | NodeJS.Signals) => {
                assert.equal(target, pid);
                assert.ok(signal === 'SIGTERM' || signal === 'SIGKILL');
                signals.push(signal);
                writeFileSync(join(cwd, 'phase'), signal);
                return true;
            });
            if (outcome === 'zombie' || outcome === 'reused-pid') {
                await proc.wait(10_000, new AbortController().signal);
                await writeFile(join(cwd, 'phase'), 'exited');
            }
            if (outcome === 'survivor') {
                await assert.rejects(() => proc!.close(), error => {
                    assert.ok(error instanceof Error);
                    assert.match(error.message, /Owned dotnet processes did not terminate/);
                    assert.ok(error.message.includes(`pid=${pid} ppid=${process.pid} state=Sl`));
                    assert.match(error.message, /command=node blazor-devserver\.dll/);
                    return true;
                });
            } else {
                await proc.close();
            }
            assert.deepEqual(signals, outcome === 'zombie' || outcome === 'reused-pid'
                ? [] : ['SIGTERM', 'SIGKILL']);
        } finally {
            t.mock.restoreAll();
            try {
                if (proc) {
                    await writeFile(join(cwd, 'phase'), 'done');
                    await proc.close();
                    await proc.wait(10_000, new AbortController().signal);
                }
            } finally {
                if (previousPath === undefined) delete process.env.PATH;
                else process.env.PATH = previousPath;
                await rm(cwd, { recursive: true, force: true });
            }
        }
    });
}
