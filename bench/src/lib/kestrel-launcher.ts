/**
 * kestrel-launcher.ts — Start/stop a self-hosted Kestrel app for blazor-perf measurement.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { join, dirname } from 'node:path';
import { platform } from 'node:os';
import { readdir, chmod } from 'node:fs/promises';
import { debug } from '../log.js';

export interface KestrelServer {
    port: number;
    url: string;
    close: () => Promise<void>;
}

/**
 * Find the executable in the publish directory.
 */
async function findExecutable(publishDir: string): Promise<string> {
    const isWindows = platform() === 'win32';
    const entries = await readdir(publishDir);

    if (isWindows) {
        // Self-contained or framework-dependent: look for .exe
        const exe = entries.find(f => f.endsWith('.exe') && !f.startsWith('createdump'));
        if (exe) return join(publishDir, exe);
    } else {
        // Self-contained on Linux: native executable (no extension) with a matching .dll
        for (const entry of entries) {
            if (!entry.includes('.') && entries.includes(entry + '.dll')) {
                return join(publishDir, entry);
            }
        }
    }

    // Fall back to DLL (framework-dependent on Linux)
    const dll = entries.find(f => f.endsWith('.dll') && !f.startsWith('Microsoft.') && !f.startsWith('System.'));
    if (dll) return join(publishDir, dll);

    throw new Error(`No executable found in ${publishDir}`);
}

/**
 * Start a Kestrel server from a published Blazor Web App.
 * Returns once the server is listening. Retries with a different port on bind failures.
 */
export async function startKestrelServer(publishDir: string, dotnetBin?: string): Promise<KestrelServer> {
    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await tryStartKestrel(publishDir, dotnetBin);
        } catch (e: any) {
            const isPortConflict = e?.message?.includes('exited with code') && attempt < maxAttempts - 1;
            if (isPortConflict) {
                debug(`Kestrel bind failed (attempt ${attempt + 1}/${maxAttempts}), retrying with different port...`);
                continue;
            }
            throw e;
        }
    }
    throw new Error(`Kestrel failed to start after ${maxAttempts} attempts`);
}

async function tryStartKestrel(publishDir: string, dotnetBin?: string): Promise<KestrelServer> {
    // Use a random high port; avoid low ephemeral range where Hyper-V reserves blocks
    const port = 10000 + Math.floor(Math.random() * 50000);
    const url = `http://127.0.0.1:${port}`;
    const execPath = await findExecutable(publishDir);

    let proc: ChildProcess;
    const dotnetRoot = dotnetBin ? dirname(dotnetBin) : undefined;
    const env = {
        ...process.env,
        ASPNETCORE_URLS: url,
        ASPNETCORE_ENVIRONMENT: 'Production',
        DOTNET_ENVIRONMENT: 'Production',
        ...(dotnetRoot ? { DOTNET_ROOT: dotnetRoot } : {}),
    };

    if (execPath.endsWith('.dll')) {
        // Framework-dependent: run with dotnet
        const dotnet = dotnetBin || 'dotnet';
        proc = spawn(dotnet, [execPath], { env, cwd: publishDir, stdio: ['ignore', 'pipe', 'pipe'] });
    } else {
        // Self-contained executable — ensure it has execute permission (lost during artifact transfer)
        if (platform() !== 'win32') {
            await chmod(execPath, 0o755);
        }
        proc = spawn(execPath, [], { env, cwd: publishDir, stdio: ['ignore', 'pipe', 'pipe'] });
    }

    // Drain stdout/stderr — capture last lines for diagnostics on crash
    const stderrChunks: string[] = [];
    let stderrLen = 0;
    proc.stdout?.resume();
    proc.stderr?.on('data', (chunk: Buffer) => {
        const str = chunk.toString();
        stderrChunks.push(str);
        stderrLen += str.length;
        // Keep only last 4KB
        while (stderrLen > 4096 && stderrChunks.length > 1) {
            stderrLen -= stderrChunks.shift()!.length;
        }
    });

    // Wait for the server to start listening
    await waitForServer(url, proc, 30_000, stderrChunks);

    debug(`Kestrel started on ${url} (pid=${proc.pid})`);

    let closed = false;
    return {
        port,
        url,
        close: async () => {
            if (closed || proc.exitCode !== null) return;
            closed = true;
            proc.kill('SIGTERM');
            await new Promise<void>((resolve) => {
                const timeout = setTimeout(() => {
                    proc.kill('SIGKILL');
                    resolve();
                }, 5000);
                proc.on('exit', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
        },
    };
}

/**
 * Poll the server URL until it responds or timeout expires.
 */
async function waitForServer(url: string, proc: ChildProcess, timeoutMs: number, stderrChunks: string[]): Promise<void> {
    const start = Date.now();
    const healthUrl = url + '/';

    while (Date.now() - start < timeoutMs) {
        // Check if process died
        if (proc.exitCode !== null) {
            const stderr = stderrChunks.join('').trim();
            const detail = stderr ? `\nstderr: ${stderr}` : '';
            throw new Error(`Kestrel process exited with code ${proc.exitCode} before becoming ready${detail}`);
        }

        try {
            const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
            if (response.ok || response.status === 404) {
                // Any HTTP response means Kestrel is listening
                return;
            }
        } catch {
            // Connection refused — server not ready yet
        }

        await new Promise(r => setTimeout(r, 200));
    }

    proc.kill('SIGKILL');
    throw new Error(`Kestrel server did not start within ${timeoutMs}ms`);
}
