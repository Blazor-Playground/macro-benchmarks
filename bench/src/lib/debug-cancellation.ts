// The harness, not Playwright, must finish SDK cleanup and persist cancelled trials.
export const DEBUG_BROWSER_SIGNAL_OPTIONS = {
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
} as const;

export function installDebugCancellation(): { signal: AbortSignal; dispose: () => void } {
    const controller = new AbortController();
    const handlers = (['SIGINT', 'SIGTERM', 'SIGHUP'] as const).map(signal => ({
        signal,
        handler: () => controller.abort(new Error(`Debug measurement cancelled by ${signal}`)),
    }));
    // Keep handlers installed through cleanup so a repeated signal cannot hard-exit early.
    for (const { signal, handler } of handlers) process.on(signal, handler);
    return {
        signal: controller.signal,
        dispose() {
            for (const { signal, handler } of handlers) process.removeListener(signal, handler);
        },
    };
}

/** Interrupt waits without detaching their rejection handlers; the owner closes the context in finally. */
export function waitForDebugOperation<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    let onAbort: () => void;
    const result = new Promise<T>((resolve, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
        operation().then(resolve, reject);
    });
    return result.finally(() => signal.removeEventListener('abort', onAbort));
}
