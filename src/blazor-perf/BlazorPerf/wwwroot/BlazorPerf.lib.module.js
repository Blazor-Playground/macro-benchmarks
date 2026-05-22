// Blazor JavaScript initializer — updates bench timing after Blazor fully starts.
export function afterWebStarted() {
    globalThis.bench_results = { 'time-to-reach-managed': Math.round(performance.now()) };
}

export function afterStarted() {
    globalThis.bench_results = { 'time-to-reach-managed': Math.round(performance.now()) };
}
