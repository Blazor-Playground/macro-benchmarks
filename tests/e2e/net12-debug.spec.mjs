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

test('native and translated SDK hosts have distinct selectable history cohorts', async ({ page }) => {
    const native = debugBatch('havit-bootstrap', '2026-09-29');
    const translated = debugBatch('havit-bootstrap', '2026-09-30');
    for (const [batch, host, scale] of [[native, 'osx-arm64', 1], [translated, 'osx-x64', 2]]) {
        batch.environment.os = 'darwin';
        batch.environment.arch = 'arm64';
        for (const runtime of Object.values(batch.runtimes)) {
            runtime.properties.NETCoreSdkRuntimeIdentifier = host;
            for (const metric of Object.values(runtime.measurements)) {
                if (metric.valueMs !== null) metric.valueMs *= scale;
                for (const attempt of metric.attempts) {
                    attempt.properties.NETCoreSdkRuntimeIdentifier = host;
                    if (attempt.valueMs !== null) attempt.valueMs *= scale;
                }
            }
        }
    }
    await routeDebugFixture(page, debugResources([native, translated]));
    await page.goto('/macro-benchmarks/net12-debug');
    const options = page.locator('#debug-cohort option');
    await expect(options).toHaveCount(2);
    const first = page.locator('[data-metric="first-run"]');
    await expect(first.locator('.focus-values dd')).toHaveText(['2.50 s', '2.00 s']);
    const nativeLabel = await options.filter({ hasText: 'SDK hosts: Mono osx-arm64, CoreCLR osx-arm64' }).textContent();
    await page.locator('#debug-cohort').selectOption({ label: nativeLabel });
    await expect(first.locator('.focus-values dd')).toHaveText(['1.25 s', '1.00 s']);
    await expect(first.locator('.debug-provenance')).toContainText('SDK day 2026-09-29');
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
    await expect(rebuild.locator('.debug-build-detail')).toBeHidden();
    await rebuild.locator('.debug-build-breakdown summary').click();
    await expect(rebuild.locator('.debug-build-detail')).toContainText('not a separate end-to-end metric');
    await expect(page.locator('.focus-heading a')).toHaveAttribute('href', 'https://github.com/dotnet/runtime/issues/133691');
    await page.getByRole('link', { name: 'Metric definitions', exact: true }).click();
    await expect(page).toHaveURL(/\/macro-benchmarks\/net12-debug#debug-methodology$/);
    await expect(page.locator('.debug-dashboard .focus-card')).toHaveCount(5);
    await page.locator('#debug-methodology summary').click();
    await expect(page.locator('#debug-methodology')).toContainText('previous process is already stopped');
    await expect(page.locator('#debug-methodology')).toContainText('while the app is running');
});
