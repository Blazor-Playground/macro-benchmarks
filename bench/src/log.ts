// ── Shared Logging Helpers ───────────────────────────────────────────────────

export function banner(msg: string): void {
    console.error(`\n\x1b[1;36m═══ ${msg} ═══\x1b[0m`);
}

export function info(msg: string): void {
    console.error(`\x1b[0;32m▶ ${msg}\x1b[0m`);
}

export function err(msg: string): void {
    console.error(`\x1b[0;31m✗ ${msg}\x1b[0m`);
}

const t0 = performance.now();

/** Verbose-only debug logging — call with ctx.verbose guard */
export function debug(msg: string): void {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.error(`\x1b[0;90m  [+${elapsed}s] ${msg}\x1b[0m`);
}
