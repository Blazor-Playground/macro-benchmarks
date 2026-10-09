import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';

export function terminalStylesEnabled(stream = process.stdout, env = process.env) {
    return !!stream.isTTY && env.TERM !== 'dumb' && env.NO_COLOR === undefined &&
        env.FORCE_COLOR !== '0' && typeof stream.hasColors === 'function' && stream.hasColors(16, env);
}

export function formatCommand(command, args, cwd) {
    const quote = value => /^[a-zA-Z0-9_./:=+-]+$/.test(value) ? value : JSON.stringify(value);
    return `${cwd ? `(cwd: ${quote(cwd)}) ` : ''}${[command, ...args].map(quote).join(' ')}`;
}

export function statusLine(command, status, color = terminalStylesEnabled()) {
    const code = status === 'OK' || status === 'CACHED' ? 32 : status === 'FAILED' ? 31 : 36;
    return `${command} ${color ? `\u001b[${code}m` : ''}[${status}]${color ? '\u001b[0m' : ''}`;
}

export async function runCommand(command, args, { cwd, env = process.env, logPath, writeLine = console.log } = {}) {
    const display = formatCommand(command, args, cwd);
    writeLine(statusLine(display, 'RUNNING'));
    const started = performance.now();
    let tail = '';
    let log;
    try {
        if (logPath) {
            log = createWriteStream(logPath);
            await once(log, 'open');
        }
        const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        const code = await new Promise((resolveCode, reject) => {
            child.once('error', reject);
            child.once('close', resolveCode);
            log?.once('error', error => { child.kill(); reject(error); });
            const record = chunk => {
                tail = (tail + chunk.toString()).slice(-12000);
                if (log) log.write(chunk);
                else process.stdout.write(chunk);
            };
            child.stdout.on('data', record);
            child.stderr.on('data', record);
        });
        if (log) {
            const closed = once(log, 'close');
            log.end();
            await closed;
        }
        if (code !== 0) throw new Error(`Command exited with ${code}${logPath ? `; log: ${logPath}` : ''}\n${tail}`);
        writeLine(statusLine(display, 'OK'));
        if (logPath) writeLine(`Log: ${logPath}`);
        return Math.round(performance.now() - started);
    } catch (error) {
        log?.destroy();
        writeLine(statusLine(display, 'FAILED'));
        throw error;
    }
}
