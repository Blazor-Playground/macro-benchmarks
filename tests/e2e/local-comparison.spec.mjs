import { test, expect } from 'playwright/test';

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
