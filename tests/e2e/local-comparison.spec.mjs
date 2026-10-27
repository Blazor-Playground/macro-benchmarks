import { test, expect } from 'playwright/test';
import { routeLocalNavigation } from '../helpers/local-navigation-fixture.mjs';
import { FOCUS_FIXTURE_TIME, routeFocusFixture } from '../helpers/focus-fixture.mjs';
import { debugBatch, debugResources, routeDebugFixture } from '../helpers/debug-fixture.mjs';

function run(runtime, cold, commit = 'a'.repeat(40), dirty = false) {
    const variant = runtime === 'mono' ? 'no-workload' : 'composite';
    const preset = runtime === 'mono' ? 'no-workload' : 'aot';
    return {
        manifest: { runtime, preset, variant, sdkInfo: {
            sdkVersion: '12.0.100-fixture', runtimePackVersion: '12.0.0-fixture', bundledFrameworkTfm: 'net12.0',
            runtimeGitHash: commit, localRuntime: { source: { hash: commit, dirty } },
        } },
        results: ['desktop', 'mobile'].map(profile => ({
            meta: { app: 'havit-bootstrap', runtime, preset, engine: 'chrome', profile,
                benchmarkDateTime: '2026-10-14T12:00:00Z', timingAggregation: { rounds: 3 } },
            metrics: { 'time-to-reach-managed-cold': cold, 'time-to-reach-managed-warm': 250,
                'havit-walkthrough': 2000, 'download-size-cold': 5000000, 'compile-time': 10000 },
            samples: { 'time-to-reach-managed-cold': 30, 'time-to-reach-managed-warm': 15 },
        })),
    };
}

function fixture() {
    return {
        schemaVersion: 1, title: 'Local history fixture', createdAt: '2026-10-14T12:00:00Z', warnings: [],
        comparisonPath: '/fixture/current/comparison.json',
        before: run('coreclr', 900), monoBefore: run('mono', 550), after: run('coreclr', 500, 'a'.repeat(40), true),
        beforeHistory: [
            { day: '2026-10-08', commit: 'b'.repeat(40), status: 'passed',
                before: run('coreclr', 1100, 'b'.repeat(40)), monoBefore: run('mono', 800, 'b'.repeat(40)) },
            { day: '2026-10-09', commit: 'c'.repeat(40), status: 'failed', error: 'Unsupported composite snapshot' },
        ],
    };
}

async function open(page, data) {
    await routeLocalNavigation(page, { focus: true });
    await page.route('**/data/local-runtime-comparison.json', route => route.fulfill({ json: data }));
    await page.goto('/macro-benchmarks/net12-focus?local=true');
    await expect(page.locator('.focus-metrics')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#blazor-error-ui')).toBeHidden();
}

async function startupChart(page) {
    return page.evaluate(() => {
        const chart = Chart.getChart(document.querySelector('[data-metric="startup"] canvas'));
        return chart?.data.datasets.map(dataset => ({ label: dataset.label, values: dataset.data.map(point => point.y) }));
    });
}

test('local history keeps before dots separate from its after reference, reloads current data and switches to matched controls', async ({ page }) => {
    const data = fixture();
    await open(page, data);
    await expect(page.locator('[data-fixed-reference="true"]')).toContainText('Pooled from 3 rounds');
    const card = page.locator('[data-metric="startup"]');
    await expect(card.locator('.focus-values dd')).toHaveText(['500 ms', '800 ms', '1,100 ms']);
    const publishedLink = page.getByRole('link', { name: 'NET12 focus', exact: true });
    await expect(publishedLink).toHaveAttribute('href', 'net12-focus');
    await expect(publishedLink).not.toHaveAttribute('aria-current', 'page');
    const focusLink = page.getByRole('link', { name: 'Local NET12 focus', exact: true });
    await expect(focusLink).toHaveAttribute('href', 'net12-focus?local=true');
    await expect(focusLink).toHaveAttribute('aria-current', 'page');
    await focusLink.click();
    await expect(page).toHaveURL(/\/net12-focus\?local=true$/);
    await expect(card.locator('.focus-values dd')).toHaveText(['500 ms', '800 ms', '1,100 ms']);
    await expect(page.locator('.focus-cohort dd[title]')).toHaveText(data.comparisonPath);
    await expect.poll(() => startupChart(page)).toEqual([
        { label: 'Before (Mono interpreter)', values: [800, null] },
        { label: 'Before (CoreCLR publish/R2R composite)', values: [1100, null] },
    ]);

    data.comparisonPath = '/fixture/next/comparison.json';
    for (const row of data.after.results) row.metrics['time-to-reach-managed-cold'] = 600;
    await page.getByRole('button', { name: 'Reload local data' }).click();
    await expect(card.locator('.focus-values dd')).toHaveText(['600 ms', '800 ms', '1,100 ms']);
    await expect(page.locator('.focus-cohort dd[title]')).toHaveText(data.comparisonPath);

    await page.locator('#local-focus-view').selectOption('matched');
    await expect(page.locator('[data-fixed-reference="true"]')).toHaveCount(0);
    await expect(card.locator('.focus-values dd')).toHaveText(['600 ms', '550 ms', '900 ms']);
    await expect.poll(() => startupChart(page)).toEqual([
        { label: 'After (CoreCLR publish/R2R composite)', values: [600] },
        { label: 'Before (Mono interpreter)', values: [550] },
        { label: 'Before (CoreCLR publish/R2R composite)', values: [900] },
    ]);
});

for (const [focus, debug] of [[false, false], [true, false], [false, true], [true, true]]) {
    test(`local navigation is conditional and separate: focus=${focus}, dev-loop=${debug}`, async ({ page }) => {
        await routeFocusFixture(page);
        await page.clock.setFixedTime(FOCUS_FIXTURE_TIME);
        await routeLocalNavigation(page, { focus, debug });
        await page.goto('/macro-benchmarks/net12-focus');
        await expect(page.locator('.focus-metrics')).toHaveAttribute('aria-busy', 'false');
        await expect(page.getByRole('navigation', { name: 'Dashboard views' })).toHaveAttribute('aria-busy', 'false');
        await expect(page.getByRole('link', { name: 'Local NET12 focus', exact: true })).toHaveCount(focus ? 1 : 0);
        await expect(page.getByRole('link', { name: 'Local NET12 dev-loop', exact: true })).toHaveCount(debug ? 1 : 0);
        await expect(page.getByRole('link', { name: 'NET12 focus', exact: true })).toHaveAttribute('href', 'net12-focus');
        await expect(page.getByRole('link', { name: 'NET12 focus', exact: true })).toHaveAttribute('aria-current', 'page');
        await expect(page.getByRole('link', { name: 'NET12 dev-loop', exact: true })).toHaveAttribute('href', 'net12-debug');
    });
}

test('local dev-loop uses its own data and raw links when switching from and back to published dev-loop', async ({ page }) => {
    await routeDebugFixture(page);
    const localBatch = debugBatch();
    localBatch.environment.controlled = false;
    localBatch.environment.comparisonScope = 'local-paired';
    for (const runtime of Object.values(localBatch.runtimes)) {
        for (const metric of Object.values(runtime.measurements)) {
            if (metric.valueMs !== null) metric.valueMs *= 2;
            for (const attempt of metric.attempts) if (attempt.valueMs !== null) attempt.valueMs *= 2;
        }
    }
    await routeDebugFixture(page, debugResources([localBatch]), true);
    await routeLocalNavigation(page, { debug: true });
    await page.goto('/macro-benchmarks/net12-debug');
    const first = page.locator('[data-metric="first-run"] .focus-values dd');
    await expect(first).toHaveText(['1.25 s', '1.00 s']);
    await page.getByRole('link', { name: 'Local NET12 dev-loop', exact: true }).click();
    await expect(page).toHaveTitle('Local NET12 dev-loop - .NET WASM Benchmarks');
    await expect(first).toHaveText(['2.50 s', '2.00 s']);
    await expect(page.getByRole('link', { name: 'Local NET12 dev-loop', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: 'NET12 dev-loop', exact: true })).not.toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: 'Raw batch and per-trial evidence' })).toHaveAttribute('href', /\/data\/local-debug\/generations\//);
    await page.getByRole('link', { name: 'Metric definitions', exact: true }).click();
    await expect(page).toHaveURL(/net12-debug\?local=true#debug-methodology$/);
    await expect(first).toHaveText(['2.50 s', '2.00 s']);
    await page.getByRole('link', { name: 'NET12 dev-loop', exact: true }).click();
    await expect(first).toHaveText(['1.25 s', '1.00 s']);
    await expect(page.getByRole('link', { name: 'Raw batch and per-trial evidence' })).toHaveAttribute('href', /\/data\/views\/debug\/generations\//);
});

test('failed local discovery is explicit without hiding an independently available local dataset', async ({ page }) => {
    await routeFocusFixture(page);
    await page.clock.setFixedTime(FOCUS_FIXTURE_TIME);
    await routeLocalNavigation(page, { focus: true });
    await page.route('**/data/local-debug/index.json', route => route.fulfill({ status: 500, body: 'broken local data' }));
    await page.goto('/macro-benchmarks/net12-focus');
    await expect(page.getByRole('link', { name: 'Local NET12 focus', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Unable to check Local NET12 dev-loop');
    await expect(page.locator('[data-metric="startup"] .focus-values')).toBeVisible();
});

test('all-failed history remains unavailable instead of displaying matched controls', async ({ page }) => {
    const data = fixture();
    data.beforeHistory = [data.beforeHistory[1]];
    await open(page, data);
    await expect(page.locator('[data-fixed-reference="true"]')).toBeVisible();
    await expect(page.locator('.focus-percentage')).toHaveCount(0);
    await expect(page.locator('.focus-values')).toHaveCount(0);
    await expect(page.locator('.focus-older-pair')).toHaveCount(0);
    await expect(page.locator('[data-metric="startup"]')).toContainText('No daily baseline has completed successfully');
    await expect.poll(() => startupChart(page)).toEqual([
        { label: 'Before (Mono interpreter)', values: [null] },
        { label: 'Before (CoreCLR publish/R2R composite)', values: [null] },
    ]);
});
