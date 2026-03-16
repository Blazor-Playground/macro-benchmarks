import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExecOptions {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
    /** 'inherit' pipes to parent stdio; 'pipe' captures stdout/stderr */
    stdio?: 'inherit' | 'pipe';
    /** If true (default), throw on non-zero exit code */
    throwOnError?: boolean;
    /** Label for verbose logging */
    label?: string;
    /** Suppress child stdout (redirect to stderr) — prevents polluting $GITHUB_OUTPUT */
    suppressStdout?: boolean;
}

export interface ExecResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

export interface DockerRunOptions {
    cwd?: string;
    volumes?: Array<{ host: string; container: string }>;
    env?: Record<string, string>;
    extraArgs?: string[];
    user?: string;
    /** Timeout in ms */
    timeout?: number;
    label?: string;
}

// ── Platform Detection ───────────────────────────────────────────────────────

export type Platform = 'windows' | 'linux' | 'darwin';

export function getPlatform(): Platform {
    switch (process.platform) {
        case 'win32': return 'windows';
        case 'darwin': return 'darwin';
        default: return 'linux';
    }
}

export function isWindows(): boolean {
    return process.platform === 'win32';
}

export function isInDocker(): boolean {
    return existsSync('/.dockerenv') || process.env['container'] === 'docker';
}

export function isCI(): boolean {
    return !!(process.env['CI'] || process.env['GITHUB_ACTIONS']);
}

// ── WSL Path Conversion ─────────────────────────────────────────────────────

/**
 * Convert a Windows path to a WSL path.
 * E.g. `D:\macro-benchmarks` → `/mnt/d/macro-benchmarks`
 * On non-Windows, returns the path unchanged.
 */
export function toWslPath(winPath: string): string {
    if (!isWindows()) return winPath;
    const resolved = resolve(winPath);
    const match = resolved.match(/^([A-Za-z]):\\(.*)/);
    if (!match) return resolved.replace(/\\/g, '/');
    const drive = match[1].toLowerCase();
    const rest = match[2].replace(/\\/g, '/');
    return `/mnt/${drive}/${rest}`;
}

/**
 * Convert a WSL path back to a Windows path.
 * E.g. `/mnt/d/macro-benchmarks` → `D:\macro-benchmarks`
 */
export function toWindowsPath(wslPath: string): string {
    const match = wslPath.match(/^\/mnt\/([a-z])\/(.*)/);
    if (!match) return wslPath;
    const drive = match[1].toUpperCase();
    const rest = match[2].replace(/\//g, '\\');
    return `${drive}:\\${rest}`;
}

// ── Core Exec ────────────────────────────────────────────────────────────────

/**
 * Spawn a child process. Returns a promise with exit code and captured output.
 */
export function exec(command: string, args: string[], opts?: ExecOptions): Promise<ExecResult> {
    const {
        cwd,
        env,
        timeout,
        stdio = 'inherit',
        throwOnError = true,
        label,
        suppressStdout = false,
    } = opts ?? {};

    return new Promise((resolve, reject) => {
        const spawnOpts: SpawnOptions = {
            cwd,
            env: env ? { ...process.env, ...env } : process.env,
            timeout: timeout || undefined,
        };

        if (stdio === 'pipe') {
            spawnOpts.stdio = 'pipe';
        } else if (suppressStdout) {
            // Redirect child stdout to parent stderr to avoid polluting $GITHUB_OUTPUT
            spawnOpts.stdio = ['inherit', process.stderr, 'inherit'];
        } else {
            spawnOpts.stdio = 'inherit';
        }

        const cmdStr = [command, ...args].join(' ');
        if (label) {
            console.info(`[exec] ${label}: ${cmdStr}`);
        } else {
            console.info(`[exec] ${cmdStr}`);
        }

        const child = spawn(command, args, spawnOpts);

        let stdout = '';
        let stderr = '';

        if (stdio === 'pipe') {
            child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
            child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        }

        child.on('error', (err) => {
            reject(new Error(`Failed to spawn '${command}': ${err.message}`));
        });

        child.on('close', (code) => {
            const exitCode = code ?? 1;
            const result: ExecResult = { exitCode, stdout, stderr };
            if (throwOnError && exitCode !== 0) {
                const msg = label ?? [command, ...args].join(' ');
                reject(new Error(`Command failed (exit ${exitCode}): ${msg}${stderr ? '\n' + stderr : ''}`));
            } else {
                resolve(result);
            }
        });
    });
}

/**
 * Exec and return captured stdout (trimmed). Throws on non-zero exit.
 */
export async function execCapture(command: string, args: string[], opts?: Omit<ExecOptions, 'stdio'>): Promise<string> {
    const result = await exec(command, args, { ...opts, stdio: 'pipe' });
    return result.stdout.trim();
}

// ── Docker Helpers ───────────────────────────────────────────────────────────

/**
 * Run a docker command, routing through `wsl.exe` on Windows.
 */
export function dockerExec(dockerArgs: string[], opts?: ExecOptions): Promise<ExecResult> {
    if (isWindows()) {
        return exec('wsl.exe', ['docker', ...dockerArgs], opts);
    }
    return exec('docker', dockerArgs, opts);
}

/**
 * Build a Docker image from a Dockerfile target.
 */
export function dockerBuild(
    tag: string,
    target: string,
    dockerfile: string,
    context: string,
    opts?: ExecOptions,
): Promise<ExecResult> {
    const dfPath = toWslPath(dockerfile);
    const ctxPath = toWslPath(context);
    return dockerExec([
        'build', '--target', target,
        '-t', tag,
        '-f', dfPath,
        ctxPath,
    ], { label: `docker build ${tag}`, ...opts });
}

/**
 * Check whether a Docker image exists locally.
 */
export async function dockerImageExists(tag: string): Promise<boolean> {
    try {
        const result = await dockerExec(
            ['image', 'inspect', tag],
            { stdio: 'pipe', throwOnError: false },
        );
        return result.exitCode === 0;
    } catch {
        return false;
    }
}

/**
 * Run a command inside a Docker container with volume mounts and env vars.
 */
export function dockerRun(
    image: string,
    command: string[],
    opts?: DockerRunOptions,
): Promise<ExecResult> {
    const args: string[] = ['run', '--rm'];

    // User
    if (opts?.user) {
        args.push('--user', opts.user);
    }

    // Volume mounts
    if (opts?.volumes) {
        for (const v of opts.volumes) {
            const hostPath = toWslPath(v.host);
            args.push('-v', `${hostPath}:${v.container}`);
        }
    }

    // Working directory
    if (opts?.cwd) {
        args.push('-w', opts.cwd);
    }

    // Environment variables
    if (opts?.env) {
        for (const [key, value] of Object.entries(opts.env)) {
            args.push('-e', `${key}=${value}`);
        }
    }

    // Extra args
    if (opts?.extraArgs) {
        args.push(...opts.extraArgs);
    }

    // Image + command
    args.push(image, ...command);

    return dockerExec(args, {
        label: opts?.label ?? `docker run ${image}`,
        timeout: opts?.timeout,
    });
}

/**
 * Fix file permissions on Docker-created directories (ownership issues on host).
 * Only needed when running Docker on Linux/WSL where container runs as root.
 */
export async function dockerFixPermissions(image: string, hostDir: string): Promise<void> {
    const mountPath = toWslPath(hostDir);
    try {
        await dockerExec([
            'run', '--rm',
            '-v', `${mountPath}:/a`,
            image,
            'chmod', '-R', 'a+rw', '/a',
        ], { stdio: 'pipe', throwOnError: false });
    } catch {
        // Ignore — best effort
    }
}

// ── .NET Helpers ─────────────────────────────────────────────────────────────

/**
 * Run `dotnet restore` with MSBuild arguments.
 */
export function dotnetRestore(
    dotnetBin: string,
    args: string[],
    opts?: ExecOptions,
): Promise<ExecResult> {
    return exec(dotnetBin, ['restore', ...args], {
        label: 'dotnet restore',
        suppressStdout: true,
        ...opts,
    });
}

/**
 * Run `dotnet publish` with MSBuild arguments.
 */
export function dotnetPublish(
    dotnetBin: string,
    args: string[],
    opts?: ExecOptions,
): Promise<ExecResult> {
    return exec(dotnetBin, ['publish', ...args], {
        label: 'dotnet publish',
        suppressStdout: true,
        ...opts,
    });
}

/**
 * Run `dotnet workload install <workload>`.
 */
export function dotnetWorkloadInstall(
    dotnetBin: string,
    workload: string,
    opts?: ExecOptions,
): Promise<ExecResult> {
    return exec(dotnetBin, ['workload', 'install', workload], {
        label: `dotnet workload install ${workload}`,
        suppressStdout: true,
        ...opts,
    });
}

/**
 * Run `dotnet workload list` and capture output.
 */
export async function dotnetWorkloadList(dotnetBin: string): Promise<string> {
    return execCapture(dotnetBin, ['workload', 'list']);
}

/**
 * Run `dotnet --info` and capture output.
 */
export async function dotnetInfo(dotnetBin: string): Promise<string> {
    return execCapture(dotnetBin, ['--info']);
}
