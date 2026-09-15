import { dotnet } from './_framework/dotnet.js'

// Startup metrics (read by bench/src/stages/measure.ts via globalThis.bench_results):
//   time-to-create-dotnet  — dotnet.create() resolved
//   time-to-reach-managed  — Avalonia OnFrameworkInitializationCompleted
// bench_complete is set once the first Avalonia frame is rendered, so scenarios start with the view attached.

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
        'wasm-memory-size': globalThis.getDotnetRuntime(0).Module.HEAPU8.byteLength,
    };
    globalThis.bench_complete = true;
    // After startup metrics are recorded, so the optional panel never affects them.
    setupManualUi();
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

// ── Manual run UI (only with ?ui, so automated runs load no extra DOM) ──────

const UNITS = { managed: 'ops/s', async: 'ops/s', frames: 'fps', input: 'ms' };

function setupManualUi() {
    if (!new URLSearchParams(globalThis.location?.search ?? '').has('ui')) return;

    const style = document.createElement('style');
    style.textContent = `
        #bench-ui { position: fixed; top: 8px; right: 8px; z-index: 10; width: 300px; max-height: calc(100% - 16px);
            display: flex; flex-direction: column; gap: 6px; padding: 8px; box-sizing: border-box;
            font: 12px system-ui, sans-serif; color: #111; background: rgba(255,255,255,.95);
            border: 1px solid #999; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
        #bench-ui .head { display: flex; justify-content: space-between; align-items: center; }
        #bench-ui .opts { display: flex; gap: 4px; }
        #bench-ui .opts label { display: flex; flex-direction: column; flex: 1; }
        #bench-ui input { width: 100%; box-sizing: border-box; }
        #bench-ui .scenarios { display: flex; flex-wrap: wrap; gap: 4px; }
        #bench-ui button { font: inherit; padding: 2px 6px; cursor: pointer; }
        #bench-ui button:disabled { cursor: default; }
        #bench-ui pre { margin: 0; min-height: 60px; overflow: auto; white-space: pre-wrap; font: 11px ui-monospace, monospace; }
        #bench-ui.collapsed .body { display: none; }
        #bench-ui .body { display: flex; flex-direction: column; gap: 6px; min-height: 0; }`;
    document.head.append(style);

    const panel = document.createElement('div');
    panel.id = 'bench-ui';
    panel.innerHTML = `
        <div class="head"><strong>avalonia-bench</strong><button data-toggle title="Collapse">–</button></div>
        <div class="body">
            <div class="opts">
                <label>warmup<input name="warmup" type="number" min="0" value="1"></label>
                <label>samples<input name="samples" type="number" min="1" value="5"></label>
                <label>sample ms<input name="sampleDurationMs" type="number" min="100" step="100" value="1000"></label>
            </div>
            <div class="scenarios"></div>
            <div><button data-all>Run all</button> <button data-clear>Clear</button></div>
            <pre></pre>
        </div>`;
    document.body.append(panel);

    const log = panel.querySelector('pre');
    const write = (line) => { log.textContent += line + '\n'; log.scrollTop = log.scrollHeight; };
    const buttons = [];
    const setBusy = (busy) => buttons.forEach(b => { b.disabled = busy; });
    const readOptions = () => Object.fromEntries(
        [...panel.querySelectorAll('.opts input')].map(i => [i.name, Number(i.value)]));
    const median = (values) => {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };
    const format = (v) => v >= 100 ? Math.round(v).toString() : v.toFixed(1);

    async function runOne({ name, kind }) {
        write(`${name}…`);
        // Let the status text paint before the (blocking) run starts.
        await new Promise(resolve => setTimeout(resolve, 50));
        try {
            const values = await runScenario(name, readOptions());
            write(`  median ${format(median(values))} ${UNITS[kind]}  [${values.map(format).join(', ')}]`);
        } catch (e) {
            write(`  failed: ${e?.message ?? e}`);
        }
    }

    const scenarios = listScenarios();
    const container = panel.querySelector('.scenarios');
    for (const scenario of scenarios) {
        const button = document.createElement('button');
        button.textContent = scenario.name;
        button.title = `${scenario.kind} (${UNITS[scenario.kind]})`;
        button.addEventListener('click', async () => {
            setBusy(true);
            await runOne(scenario);
            setBusy(false);
        });
        buttons.push(button);
        container.append(button);
    }

    const runAll = panel.querySelector('[data-all]');
    runAll.addEventListener('click', async () => {
        setBusy(true);
        for (const scenario of scenarios) await runOne(scenario);
        write('done');
        setBusy(false);
    });
    buttons.push(runAll);
    panel.querySelector('[data-clear]').addEventListener('click', () => { log.textContent = ''; });
    panel.querySelector('[data-toggle]').addEventListener('click', () => panel.classList.toggle('collapsed'));

    const r = globalThis.bench_results;
    write(`startup: create-dotnet ${r['time-to-create-dotnet']} ms, reach-managed ${r['time-to-reach-managed']} ms`);
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
