/**
 * kestrel-launcher.ts — Start/stop a self-hosted Kestrel app for blazor-perf measurement.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { join, dirname } from 'node:path';
import { platform } from 'node:os';
import { readdir } from 'node:fs/promises';
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

    // Look for an .exe on Windows, or a file matching the project name on Linux
    if (isWindows) {
        const exe = entries.find(f => f.endsWith('.exe') && !f.includes('.dll'));
        if (exe) return join(publishDir, exe);
    }

    // On Linux, look for the main DLL and run with dotnet
    const dll = entries.find(f => f === 'BlazorPerf.dll');
    if (dll) return join(publishDir, dll);

    throw new Error(`No executable found in ${publishDir}`);
}

/**
 * Start a Kestrel server from a published Blazor Web App.
 * Returns once the server is listening.
 */
export async function startKestrelServer(publishDir: string, dotnetBin?: string): Promise<KestrelServer> {
    // Use a random high port to avoid conflicts
    const port = 5000 + Math.floor(Math.random() * 60000);
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
        // Self-contained executable
        proc = spawn(execPath, [], { env, cwd: publishDir, stdio: ['ignore', 'pipe', 'pipe'] });
    }

    // Wait for the server to start listening
    await waitForServer(url, proc, 30_000);

    debug(`Kestrel started on ${url} (pid=${proc.pid})`);

    return {
        port,
        url,
        close: async () => {
            if (proc.exitCode === null) {
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
            }
        },
    };
}

/**
 * Poll the server URL until it responds or timeout expires.
 */
async function waitForServer(url: string, proc: ChildProcess, timeoutMs: number): Promise<void> {
    const start = Date.now();
    const healthUrl = url + '/';

    while (Date.now() - start < timeoutMs) {
        // Check if process died
        if (proc.exitCode !== null) {
            throw new Error(`Kestrel process exited with code ${proc.exitCode} before becoming ready`);
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
