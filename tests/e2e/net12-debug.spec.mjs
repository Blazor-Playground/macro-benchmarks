import { test, expect } from 'playwright/test';
import { debugBatch, debugResources, routeDebugFixture } from '../helpers/debug-fixture.mjs';

test('clean Debug renders real cards, values, capability gaps and reusable Chart.js curves', async ({ page }) => {
    await routeDebugFixture(page);
    await page.goto('/macro-benchmarks/net12-debug');
    await expect(page.getByRole('heading', { name: 'NET12 dev-loop.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'NET12 dev-loop', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveTitle('NET12 dev-loop - .NET WASM Benchmarks');
    await expect(page.locator('.focus-cohort')).toContainText('dev-loop · Debug (SDK defaults)');
    await expect(page.locator('.debug-dashboard .focus-card')).toHaveCount(5);
    const first = page.locator('[data-metric="first-run"]');
    await expect(page.locator('.debug-dashboard .debug-provenance')).toHaveCount(0);
    await expect(first).not.toContainText('SDK day');
    await expect(first).not.toContainText('Batch started');
    await expect(first.locator('.focus-values dd')).toHaveText(['1.25 s', '1.00 s']);
    await expect(first.locator('.focus-percentage')).toHaveText('25.0%');
    const hot = page.locator('[data-metric="hot-reload"]');
    await expect(hot.locator('.focus-percentage')).toHaveCount(0);
    await expect(hot.locator('.focus-values dd')).toHaveText(['Not available', '5,000.0 ms']);
    await expect(hot.getByText(/MetadataUpdater.IsSupported=false/)).toBeVisible();
    await expect(first.locator('canvas')).toBeVisible();
    await page.locator('#debug-measurements').uncheck();
    await expect(page.locator('.debug-dashboard canvas')).toHaveCount(0);
    await expect(first.locator('.focus-percentage')).toHaveText('25.0%');
    await page.locator('#debug-percentage').check();
    await expect(first.locator('canvas')).toBeVisible();
    await expect(hot.locator('canvas')).toHaveCount(0);
    await page.locator('#debug-app').selectOption('empty-blazor');
    await expect(page.locator('[data-metric="walkthrough"] .debug-reason')).toHaveCount(2);
    await expect(page.locator('[data-metric="walkthrough"] .debug-reason').first()).toContainText('No elapsed-time walkthrough for this app');
    await page.getByRole('button', { name: '14 days', exact: true }).click();
});

test('Debug fetch failures remain errors, never legacy fallback, and narrow layout is usable', async ({ page }) => {
    await routeDebugFixture(page);
    await page.route('**/data/views/debug/index.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
    await page.goto('/macro-benchmarks/net12-debug');
    await expect(page.getByRole('alert')).toContainText('HTTP 503');
    await page.unroute('**/data/views/debug/index.json');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('.debug-dashboard .focus-card')).toHaveCount(5);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'NET12 focus', exact: true }).click();
    await expect(page.locator('.debug-dashboard')).toHaveCount(0);
    await page.getByRole('link', { name: 'NET12 dev-loop', exact: true }).click();
    await expect(page.locator('.debug-dashboard .focus-card')).toHaveCount(5);
});

test('14-day history shows every recorded environment without a cohort selector', async ({ page }) => {
    const batches = ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30'].map((day, i) => {
        const batch = debugBatch('havit-bootstrap', day);
        batch.environment.cpu = i === 2 ? 'Intel Xeon' : `AMD EPYC ${i}`;
        batch.environment.os = i % 2 ? 'linux 7.0' : 'linux 6.17';
        batch.environment.node = i % 2 ? 'v24.22.0' : 'v24.21.0';
        batch.environment.memoryBytes += i * 4096;
        for (const runtime of Object.values(batch.runtimes)) {
            const host = i === 2 ? 'linux-arm64' : 'linux-x64';
            runtime.properties.NETCoreSdkRuntimeIdentifier = host;
            for (const metric of Object.values(runtime.measurements)) {
                if (metric.valueMs !== null) metric.valueMs *= i + 1;
                for (const attempt of metric.attempts) {
                    attempt.properties.NETCoreSdkRuntimeIdentifier = host;
                    if (attempt.valueMs !== null) attempt.valueMs *= i + 1;
                }
            }
        }
        return batch;
    });
    const old = debugBatch('havit-bootstrap', '2026-09-14');
    await routeDebugFixture(page, debugResources([old, ...batches]));
    await page.goto('/macro-benchmarks/net12-debug');
    await expect(page.locator('#debug-cohort')).toHaveCount(0);
    await expect(page.getByText('All recorded environments.', { exact: false })).toBeVisible();
    const first = page.locator('[data-metric="first-run"]');
    await expect(first.locator('.focus-values dd')).toHaveText(['5.00 s', '4.00 s']);
    const pointCount = () => first.locator('canvas').evaluate(element => Chart.getChart(element)?.data.datasets[0].data.length);
    await expect.poll(pointCount).toBe(4);
    await page.getByRole('button', { name: '1 month', exact: true }).click();
    await expect.poll(pointCount).toBe(5);
    await page.getByRole('button', { name: '14 days', exact: true }).click();
    await expect.poll(pointCount).toBe(4);
    await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
    await expect(first.locator('.focus-values dd')).toHaveText(['5.00 s', '4.00 s']);
    await expect.poll(pointCount).toBe(4);
});

test('full local paired values and percentages are labeled as local experiments, not smoke or CI', async ({ page }) => {
    const batch = debugBatch();
    batch.environment.controlled = false;
    batch.environment.comparisonScope = 'local-paired';
    await routeDebugFixture(page, debugResources([batch]));
    await page.goto('/macro-benchmarks/net12-debug');
    const first = page.locator('[data-metric="first-run"]');
    await expect(first.locator('.focus-percentage')).toHaveText('25.0%');
    await expect(first.locator('.debug-result-status').last()).toContainText('Full local paired run');
    await expect(first.locator('.debug-result-status').last()).toContainText('not CI');
    await expect(first).not.toContainText('Smoke run');
});

test('latest and 5 avg summaries remain distinct and visible with graphs off', async ({ page }) => {
    const batches = ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30'].map((day, i) => {
        const batch = debugBatch('havit-bootstrap', day);
        batch.environment.cpu = `Runner ${i}`;
        for (const runtime of Object.values(batch.runtimes)) for (const metric of Object.values(runtime.measurements)) {
            if (metric.valueMs !== null) metric.valueMs *= i + 1;
            for (const attempt of metric.attempts) if (attempt.valueMs !== null) attempt.valueMs *= i + 1;
        }
        return batch;
    });
    await routeDebugFixture(page, debugResources(batches));
    await page.goto('/macro-benchmarks/net12-debug');
    const first = page.locator('[data-metric="first-run"]');
    await expect(first.locator('.focus-values dd')).toHaveText(['5.00 s', '4.00 s']);
    await expect(first.locator('.debug-average-values dd')).toHaveText(['3.12 s', '2.50 s']);
    await expect(first.locator('.debug-average-values [data-runtime="coreclr"]')).toHaveAttribute('data-count', '4');
    await expect(first.locator('.focus-rolling-caption')).toContainText('5 avg');
    await expect(first.locator('.focus-rolling-caption')).toHaveAttribute('data-count', '4');
    const hot = page.locator('[data-metric="hot-reload"]');
    await expect(hot.locator('.debug-average-values dd')).toHaveText(['Not available', '12,500.0 ms']);
    await expect(hot.locator('.focus-rolling-caption')).toHaveCount(0);
    const rebuild = page.locator('[data-metric="rebuild"]');
    await rebuild.locator('.debug-build-breakdown summary').click();
    await expect(rebuild.locator('.debug-build-detail').last()).toContainText('CoreCLR 12.50 s (4/5)');
    await page.locator('#debug-measurements').uncheck();
    await expect(page.locator('.debug-dashboard canvas')).toHaveCount(0);
    await expect(first.locator('.debug-average-values dd')).toHaveText(['3.12 s', '2.50 s']);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('issue scenarios separate run-to-render from edit-to-render and keep build time as a breakdown', async ({ page }) => {
    await routeDebugFixture(page);
    await page.goto('/macro-benchmarks/net12-debug');
    const run = page.getByRole('region', { name: 'Run to first render', exact: true });
    const edit = page.getByRole('region', { name: 'Incremental development loop', exact: true });
    const optional = page.getByRole('region', { name: 'Walkthrough (optional)', exact: true });
    await expect(run.locator('.focus-card')).toHaveCount(2);
    await expect(edit.locator('.focus-card')).toHaveCount(2);
    await expect(optional.locator('.focus-card')).toHaveCount(1);
    await expect(run.getByRole('heading', { name: 'First dotnet run', level: 3, exact: true })).toBeVisible();
    await expect(run.getByRole('heading', { name: 'Incremental dotnet run', level: 3, exact: true })).toBeVisible();
    await expect(run.locator('.debug-boundary')).toHaveText([
        'Start dotnet run to first render', 'Start dotnet run to first render',
    ]);
    await expect(run.locator('[data-metric="incremental-run"]')).toContainText('not stopping the previous run');
    const rebuild = edit.locator('[data-metric="rebuild"]');
    await expect(rebuild.getByRole('heading', { name: 'Incremental rebuild', level: 3, exact: true })).toBeVisible();
    await expect(edit.locator('.debug-boundary')).toHaveText([
        'Save edit to updated render', 'Save edit to updated render',
    ]);
    await expect(rebuild).toContainText('Includes shutdown time');
    await expect(rebuild.locator('.debug-build-detail').first()).toBeHidden();
    await rebuild.locator('.debug-build-breakdown summary').click();
    await expect(rebuild.locator('.debug-build-detail').first()).toContainText('not a separate end-to-end metric');
    await expect(page.locator('.focus-heading a')).toHaveAttribute('href', 'https://github.com/dotnet/runtime/issues/133691');
    await page.locator('#debug-app').selectOption('empty-blazor');
    await page.getByRole('button', { name: '1 month', exact: true }).click();
    await page.getByRole('link', { name: 'Metric definitions', exact: true }).click();
    await expect(page).toHaveURL(/\/macro-benchmarks\/net12-debug#debug-methodology$/);
    await expect(page.locator('#debug-app')).toHaveValue('empty-blazor');
    await expect(page.getByRole('button', { name: '1 month', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-metric="first-run"] .focus-values dd')).toHaveText(['1.25 s', '1.00 s']);
    await expect(page.locator('.debug-dashboard .focus-card')).toHaveCount(5);
    const definitions = page.locator('#debug-methodology');
    await expect(definitions).toHaveAttribute('open', '');
    await expect(definitions.locator('summary')).toBeInViewport();
    await expect(definitions.locator('p').first()).toBeVisible();
    await expect(definitions).toContainText('previous process is already stopped');
    await expect(definitions).toContainText('while the app is running');
    await definitions.locator('summary').click();
    await expect(definitions).not.toHaveAttribute('open', '');
    await page.getByRole('link', { name: 'Metric definitions', exact: true }).click();
    await expect(definitions).toHaveAttribute('open', '');
    await expect(definitions.locator('summary')).toBeInViewport();
});

test('definitions deep link opens during loading, stays in view after data arrives and works on reload', async ({ page }) => {
    await routeDebugFixture(page);
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/data/views/debug/index.json', async route => {
        await pending;
        await route.fallback();
    });
    try {
        await page.goto('/macro-benchmarks/net12-debug#debug-methodology');
        const definitions = page.locator('#debug-methodology');
        await expect(definitions).toHaveAttribute('open', '');
        await expect(definitions.locator('summary')).toBeInViewport();
        release();
        await expect(page.locator('.debug-dashboard .focus-card')).toHaveCount(5);
        await expect(definitions.locator('summary')).toBeInViewport();
        await page.reload();
        await expect(page.locator('.debug-dashboard .focus-card')).toHaveCount(5);
        await expect(definitions).toHaveAttribute('open', '');
        await expect(definitions.locator('summary')).toBeInViewport();
    } finally { release(); }
});

test('definitions deep link remains usable when measurement loading fails', async ({ page }) => {
    await routeDebugFixture(page);
    await page.route('**/data/views/debug/index.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
    await page.goto('/macro-benchmarks/net12-debug#debug-methodology');
    await expect(page.getByRole('alert')).toContainText('HTTP 503');
    const definitions = page.locator('#debug-methodology');
    await expect(definitions).toHaveAttribute('open', '');
    await expect(definitions.locator('p').first()).toBeVisible();
    await expect(definitions.locator('summary')).toBeInViewport();
});

test('14-day default excludes older SDKs until a wider history window is selected', async ({ page }) => {
    const batch = debugBatch('havit-bootstrap', '2026-09-14');
    batch.measuredAt = '2026-09-30T12:00:00Z';
    for (const runtime of Object.values(batch.runtimes)) {
        for (const metric of Object.values(runtime.measurements)) {
            for (const attempt of metric.attempts) attempt.startedAt = batch.measuredAt;
        }
    }
    await routeDebugFixture(page, debugResources([batch]));
    await page.goto('/macro-benchmarks/net12-debug');
    const first = page.locator('[data-metric="first-run"]');
    await expect(page.getByRole('button', { name: '14 days', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(first.locator('.focus-values dd')).toHaveText(['Not available', 'Not available']);
    await page.getByRole('button', { name: '1 month', exact: true }).click();
    await expect(page.getByRole('button', { name: '1 month', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(first.locator('.focus-values dd')).toHaveText(['1.25 s', '1.00 s']);
    await expect(first).not.toContainText('SDK day');
    await expect(first).not.toContainText('Batch started');
    await page.getByRole('button', { name: '14 days', exact: true }).click();
    await expect(first.locator('.focus-values dd')).toHaveText(['Not available', 'Not available']);
    await page.getByRole('button', { name: '1 month', exact: true }).click();
    await expect(first.locator('.focus-values dd')).toHaveText(['1.25 s', '1.00 s']);
});
