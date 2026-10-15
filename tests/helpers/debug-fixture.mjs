// Synthetic protocol fixtures, not measured performance results.
export const debugKeys = [
    'debug-first-run-to-first-render', 'debug-incremental-run-to-first-render',
    'debug-rebuild-edit-to-render', 'debug-incremental-build', 'debug-hot-reload-edit-to-render', 'havit-walkthrough',
];

export function debugBatch(app = 'havit-bootstrap', day = '2026-09-29') {
    const before = { version: 'before-0001', documentId: 'fixture-document', runtimeId: 'fixture-runtime',
        generation: 0, counter: 1, debuggerAttached: false, metadataUpdates: true, runtime: 'mono' };
    const measurements = runtime => Object.fromEntries(debugKeys.map((key, index) => {
        const unsupported = (key === 'debug-hot-reload-edit-to-render' && runtime === 'coreclr')
            || (key === 'havit-walkthrough' && app !== 'havit-bootstrap');
        const status = unsupported ? key === 'havit-walkthrough' ? 'unsupported-app' : 'unsupported-runtime' : 'ok';
        const reason = unsupported ? key === 'havit-walkthrough' ? 'No elapsed-time walkthrough for this app'
            : 'MetadataUpdater.IsSupported=false; CoreCLR WASM hot reload is not available' : '';
        const valueMs = unsupported ? null : (index + 1) * (runtime === 'mono' ? 1000 : 1250);
        const attempts = Array.from({ length: 5 }, (_, i) => ({
            trial: i + 1, status, reason, startedAt: `${day}T12:00:00Z`, valueMs, phases: { deltaApplied: 100 },
            commands: [['dotnet', 'run']], sourceBefore: 'before-hash', sourceAfter: 'after-hash',
            before, after: { ...before, version: 'after--0001', generation: 1 },
            navigations: 0, contextResets: 0, hostPidsBefore: [1234], hostPidsAfter: [1234],
            properties: { Configuration: 'Debug', TargetFramework: 'net12.0', NETCoreSdkRuntimeIdentifier: 'linux-arm64' },
        }));
        return [key, { status, reason,
            valueMs, successful: unsupported ? 0 : 5, requested: 5, aggregation: 'median', attempts }];
    }));
    return {
        kind: 'debug-dev-loop', schemaVersion: 1, methodology: 'debug-sdk-defaults-v1',
        id: `fixture-${day}-${app}`, app, preset: 'dev-loop', configuration: 'Debug', measuredAt: `${day}T12:00:00Z`, smoke: false,
        sdk: { version: `12.0.100-alpha.1.264${day.slice(-2)}.101`, day,
            sdkHash: 'a'.repeat(40), runtimeHash: 'b'.repeat(40), aspnetHash: 'c'.repeat(40), vmrHash: 'd'.repeat(40) },
        source: { harnessSha: 'a'.repeat(40), harnessDigest: 'b'.repeat(64), appDigest: 'c'.repeat(64) },
        environment: { os: 'linux 6.8', arch: 'arm64', cpu: 'Fixture CPU', cpuCount: 4, memoryBytes: 16_000_000_000,
            browser: '140.0', browserChannel: 'chromium', playwright: '1.58.2', node: 'v24.0.0', headless: true,
            runnerClass: 'github-hosted', runnerId: `fixture-runner-${day}`, controlled: true, policy: 'fixture-prepared-dependencies' },
        runtimes: Object.fromEntries(['mono', 'coreclr'].map(runtime => [runtime, {
            properties: { Configuration: 'Debug', TargetFramework: 'net12.0', RuntimeFlavor: runtime === 'mono' ? 'Mono' : 'CoreCLR',
                NETCoreSdkRuntimeIdentifier: 'linux-arm64' },
            measurements: measurements(runtime),
        }])),
    };
}

export function debugResources(batches = [debugBatch(), debugBatch('empty-blazor')]) {
    const generation = 'a'.repeat(64);
    const apps = [...new Set(batches.map(b => b.app))].map(id => ({ id, file: `generations/${generation}/${id}.json` }));
    const index = { schemaVersion: 1, generation, lastUpdated: '2026-09-30T12:00:00Z', apps };
    return new Map([
        ['index.json', index],
        ...apps.map(app => [app.file, { schemaVersion: 1, generation, app: app.id, batches: batches.filter(b => b.app === app.id) }]),
    ]);
}

export async function routeDebugFixture(page, resources = debugResources()) {
    await page.clock.setFixedTime(new Date('2026-09-30T12:00:00Z'));
    await page.route('**/data/views/debug/**', route => {
        const key = new URL(route.request().url()).pathname.split('/data/views/debug/')[1];
        return resources.has(key) ? route.fulfill({ json: resources.get(key) })
            : route.fulfill({ status: 404, body: 'No fixture resource' });
    });
}
