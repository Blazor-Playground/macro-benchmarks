import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';

const execFileAsync = promisify(execFile);
interface ProcessIdentity { pid: number; ppid: number; birth: string; command: string }

async function processTable(): Promise<ProcessIdentity[]> {
    const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid=,lstart=,command='],
        { env: { ...process.env, LC_ALL: 'C' } });
    return stdout.split('\n').flatMap(line => {
        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+\d+:\d+:\d+\s+\d{4})\s+(.*)$/);
        return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), birth: match[3], command: match[4] }] : [];
    });
}

export class DebugProcessError extends Error {
    constructor(message: string, readonly output: string) { super(message); }
}

/** Owns only this invocation's processes, including children orphaned when dotnet exits. */
export class DebugProcess {
    readonly started = performance.now();
    readonly child;
    private known = new Map<number, ProcessIdentity>();
    private tracking: Promise<void> = Promise.resolve();
    private timer: ReturnType<typeof setInterval>;
    private monitorError: unknown;
    private spawnError: Error | null = null;
    output = '';
    exited = false;
    exitCode: number | null = null;
    ended = 0;

    constructor(readonly command: string, readonly args: string[], cwd: string, env: NodeJS.ProcessEnv) {
        this.child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        const append = (chunk: Buffer) => {
            this.output = (this.output + chunk.toString()).slice(-16_384);
        };
        this.child.stdout.on('data', append);
        this.child.stderr.on('data', append);
        this.child.once('error', error => { this.spawnError = error; this.exited = true; });
        this.child.once('exit', code => { this.ended = performance.now(); this.exitCode = code; this.exited = true; });
        this.timer = setInterval(() => {
            this.tracking = this.tracking.then(() => this.track()).catch(error => { this.monitorError = error; });
        }, 100);
    }

    private async track(): Promise<void> {
        const rows = await processTable();
        const owned = new Set<number>();
        for (const row of rows) {
            if ((row.pid === this.child.pid && !this.exited) || this.known.get(row.pid)?.birth === row.birth) owned.add(row.pid);
        }
        let added = true;
        while (added) {
            added = false;
            for (const row of rows) {
                // SDK build servers may be shared with other invocations; they are not app hosts.
                if (/VBCSCompiler\.dll|MSBuild\.dll.*nodemode:/i.test(row.command)) continue;
                if (owned.has(row.ppid) && !owned.has(row.pid)) { owned.add(row.pid); added = true; }
            }
        }
        for (const row of rows) if (owned.has(row.pid)) this.known.set(row.pid, row);
    }

    check(): void {
        if (this.monitorError) throw new Error(`Cannot monitor owned dotnet processes: ${this.monitorError}`);
        if (this.spawnError) throw new DebugProcessError(this.spawnError.message, this.output);
        if (this.exited) throw new DebugProcessError(`dotnet exited (${this.exitCode}) before the expected event`, this.output);
    }

    async hostPids(): Promise<number[]> {
        await this.track();
        const rows = await processTable();
        return rows.filter(row => this.known.get(row.pid)?.birth === row.birth
            && /(?:WasmAppHost|blazor-devserver)\.dll/i.test(row.command)).map(row => row.pid).sort((a, b) => a - b);
    }

    async wait(timeout: number, signal: AbortSignal): Promise<string> {
        const deadline = performance.now() + timeout;
        while (!this.exited) {
            signal.throwIfAborted();
            if (performance.now() >= deadline) throw new Error(`Process timeout after ${timeout} ms`);
            await sleep(20);
        }
        signal.throwIfAborted();
        if (this.spawnError || this.exitCode !== 0) {
            throw new DebugProcessError(this.spawnError?.message ?? `dotnet exited (${this.exitCode})`, this.output);
        }
        return this.output;
    }

    async close(): Promise<void> {
        clearInterval(this.timer);
        await this.tracking;
        await this.track();
        const alive = async () => (await processTable()).filter(row => this.known.get(row.pid)?.birth === row.birth);
        const send = (rows: ProcessIdentity[], signal: NodeJS.Signals) => {
            for (const row of rows.reverse()) {
                try { process.kill(row.pid, signal); }
                catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
            }
        };
        send(await alive(), 'SIGTERM');
        const deadline = performance.now() + 5000;
        while ((await alive()).length && performance.now() < deadline) await sleep(50);
        const survivors = await alive();
        if (survivors.length) {
            send(survivors, 'SIGKILL');
            await sleep(100);
            if ((await alive()).length) throw new Error('Owned dotnet processes did not terminate');
        }
        if (this.monitorError) throw new Error(`Process monitoring failed: ${this.monitorError}`);
    }
}
