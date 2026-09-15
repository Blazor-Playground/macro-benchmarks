import { dotnet } from './_framework/dotnet.js'

// Startup metrics (read by bench/src/stages/measure.ts via globalThis.bench_results):
//   time-to-create-dotnet  — dotnet.create() resolved
//   time-to-reach-managed  — Avalonia OnFrameworkInitializationCompleted
//   time-to-exit           — REUSED as "first frame rendered": a UI app never exits, so the
//                            end-of-startup marker is the first presented Avalonia frame.

let scenarioExports = null;

function setManagedReady() {
    globalThis.dotnet_managed_ready = performance.now();
}

function setFirstFrameRendered() {
    globalThis.dotnet_first_frame = performance.now();
    tryComplete();
}

function tryComplete() {
    if (globalThis.bench_complete || !scenarioExports || globalThis.dotnet_first_frame === undefined) return;
    globalThis.bench_results = {
        'time-to-create-dotnet': Math.round(globalThis.dotnet_created - globalThis.js_loaded),
        'time-to-reach-managed': Math.round(globalThis.dotnet_managed_ready - globalThis.js_loaded),
        'time-to-exit': Math.round(globalThis.dotnet_first_frame - globalThis.js_loaded),
        'wasm-memory-size': globalThis.getDotnetRuntime(0).Module.HEAPU8.byteLength,
    };
    globalThis.bench_complete = true;
}

// ── Scenario signals (C# → JS) ──────────────────────────────────────────────

const signalWaiters = new Map();

function scenarioSignal(name, value) {
    const resolve = signalWaiters.get(name);
    if (resolve) {
        signalWaiters.delete(name);
        resolve(value);
    }
}

/** Register before dispatching input, so a synchronous signal is not missed. */
function waitForSignal(name, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signalWaiters.delete(name);
            reject(new Error(`Timed out waiting for scenario signal '${name}'`));
        }, timeoutMs);
        signalWaiters.set(name, (value) => { clearTimeout(timer); resolve(value); });
    });
}

// ── Input drivers (one per Input scenario; return elapsed ms for one sample) ──

/** The element a real pointer at (clientX, clientY) would hit inside the Avalonia container. */
function pointerTarget(clientX, clientY) {
    const container = document.querySelector('.avalonia-container');
    if (!container) throw new Error('Avalonia container not found');
    const hit = document.elementFromPoint(clientX, clientY);
    return hit && container.contains(hit) ? hit : container;
}

/**
 * Synthetic pointer event that looks like a trusted one to Avalonia: untrusted events have an
 * empty getCoalescedEvents(), which Avalonia's input path doesn't handle, so include the event itself.
 */
function pointerEvent(type, init) {
    const full = { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...init };
    return new PointerEvent(type, { ...full, coalescedEvents: [new PointerEvent(type, full)] });
}

const inputDrivers = {
    // Moves across the view with strictly increasing X; C# signals once it sees the final X.
    'pointer-move': async ({ name, timeoutMs }) => {
        const container = document.querySelector('.avalonia-container');
        const rect = container.getBoundingClientRect();
        const count = 200;
        const startX = Math.round(rect.left + rect.width / 2 - count / 2);
        const y = Math.round(rect.top + rect.height / 2);
        const target = pointerTarget(startX, y);
        const signal = waitForSignal(name, timeoutMs);
        scenarioExports.BeginInputSample(startX + count - 1 - rect.left);
        const start = performance.now();
        for (let i = 0; i < count; i++) {
            target.dispatchEvent(pointerEvent('pointermove', { clientX: startX + i, clientY: y }));
        }
        await signal;
        return performance.now() - start;
    },
};

// ── Managed sampling (tight loop, ops/sec) ──────────────────────────────────

function runManagedSample(durationMs) {
    const start = performance.now();
    let ops = 0;
    while (performance.now() - start < durationMs) {
        // Each iteration reports how many operations it performed (e.g. 100 hit tests).
        ops += scenarioExports.RunManagedIteration();
    }
    return ops / ((performance.now() - start) / 1000);
}

// ── Public scenario API (used by bench/src/lib/avalonia-scenarios.ts) ───────

function listScenarios() {
    return scenarioExports.ListScenarios().split(';').filter(Boolean).map(entry => {
        const [name, kind] = entry.split(':');
        return { name, kind };
    });
}

async function runScenario(name, { warmup = 1, samples = 5, sampleDurationMs = 1000, timeoutMs = 30000 } = {}) {
    const scenario = listScenarios().find(s => s.name === name);
    if (!scenario) throw new Error(`Unknown scenario '${name}'`);
    if (scenario.kind === 'input' && !inputDrivers[name]) throw new Error(`No input driver for scenario '${name}'`);

    await scenarioExports.PrepareScenario(name);
    try {
        const values = [];
        for (let i = 0; i < warmup + samples; i++) {
            const value = scenario.kind === 'managed' ? runManagedSample(sampleDurationMs)
                : scenario.kind === 'frames' ? await scenarioExports.RunFrameSample(sampleDurationMs)
                : scenario.kind === 'async' ? await scenarioExports.RunAsyncSample(sampleDurationMs)
                : await inputDrivers[name]({ name, timeoutMs });
            if (i >= warmup) values.push(value);
        }
        return values;
    } finally {
        scenarioExports.ClearScenario();
    }
}

// ── Startup ─────────────────────────────────────────────────────────────────

async function outer() {
    globalThis.onConsole = [];
    globalThis.console.logOriginal = globalThis.console.log;
    globalThis.console.log = (...args) => {
        for (const handler of globalThis.onConsole) {
            handler(...args);
        }
        globalThis.console.logOriginal(...args);
    };

    globalThis.js_loaded = performance.now();

    const { setModuleImports, getAssemblyExports, runMain } = await dotnet
        .withApplicationArgumentsFromQuery()
        .create();

    setModuleImports('main.mjs', {
        bench: {
            setManagedReady,
            setFirstFrameRendered,
            scenarioSignal,
        }
    });

    globalThis.dotnet_created = performance.now();
    globalThis.bench_results = {};

    // Main keeps the Avalonia app alive; don't gate startup on it resolving.
    runMain("AvaloniaBench", []).catch(e => console.error(e));

    const exports = await getAssemblyExports("AvaloniaBench");
    scenarioExports = exports.AvaloniaBench.Scenarios.ScenarioExports;
    globalThis.avaloniaBench = { list: listScenarios, run: runScenario };
    tryComplete();
}

await outer();
