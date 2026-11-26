import { expect, test } from 'playwright/test';
import { focusFixture, routeFocusFixture } from '../helpers/focus-fixture.mjs';

test('Havit Bootstrap is the first and initially selected app tab', async ({ page }) => {
    await routeFocusFixture(page);
    await page.goto('/macro-benchmarks/');

    const tabs = page.locator('main .nav-tabs');
    await expect(tabs.getByRole('link').first()).toHaveText('Havit Bootstrap');
    await expect(tabs.locator('.nav-link.active')).toHaveText('Havit Bootstrap');
});

test('AOT/R2R is selected by default even if the R2R presets are missing from the index', async ({ page }) => {
    const fixture = focusFixture();
    fixture.index.dimensions.presets = ['no-workload'];
    await routeFocusFixture(page, fixture);
    await page.goto('/macro-benchmarks/');

    await expect(page.getByRole('checkbox', { name: 'AOT/R2R', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'no-workload', exact: true })).not.toBeChecked();
    const pgo = page.getByRole('checkbox', { name: 'R2R PGO', exact: true });
    await expect(pgo).not.toBeChecked();
    await pgo.check();
    await expect(pgo).toBeChecked();
    await expect(page.locator('#blazor-error-ui')).toBeHidden();
});

test('published R2R dimensions do not produce duplicate preset checkboxes', async ({ page }) => {
    const fixture = focusFixture();
    fixture.index.dimensions.presets.push('r2r-pgo');
    await routeFocusFixture(page, fixture);
    await page.goto('/macro-benchmarks/');
    for (const preset of ['aot', 'r2r-pgo']) {
        await expect(page.locator(`#filter-presets-${preset}`)).toHaveCount(1);
        await expect(page.locator(`#filter-presets-${preset}`)).toBeVisible();
    }
    await expect(page.locator('#blazor-error-ui')).toBeHidden();
});

test('retired and unknown historical presets are ignored in filters and chart datasets', async ({ page }) => {
    const fixture = focusFixture();
    const release = structuredClone(fixture.buckets[0]);
    release.path = 'releases/net12';
    release.header.release = 'net12';
    delete release.header.week;
    fixture.index.releases.push('net12');
    fixture.buckets.push(release);
    const excludedPresets = ['no-jiterp', 'invariant', 'no-reflection-emit', 'unknown-preset'];
    fixture.index.dimensions.presets = [...new Set([...fixture.index.dimensions.presets, ...excludedPresets])];
    for (const bucket of fixture.buckets) {
        for (const metrics of Object.values(bucket.appMetrics)) {
            for (const rows of Object.values(metrics)) {
                for (const preset of excludedPresets) {
                    rows[`coreclr/${preset}/desktop/chrome`] = bucket.header.columns.map(() => 123);
                }
            }
        }
    }
    await routeFocusFixture(page, fixture);
    await page.goto('/macro-benchmarks/');
    const canvas = page.locator('#chart-havit-bootstrap-download-size-cold');
    await expect.poll(() => canvas.evaluate(element => !!Chart.getChart(element))).toBe(true);
    const datasets = await canvas.evaluate(element => {
        const chart = Chart.getChart(element);
        return chart.data.datasets.map((dataset, index) => ({
            preset: dataset.rowKey.split('/')[1], points: dataset.data, visible: chart.isDatasetVisible(index),
        }));
    });
    expect(datasets.some(dataset => dataset.preset === 'no-workload')).toBe(true);
    expect([...new Set(datasets.filter(dataset => dataset.visible).map(dataset => dataset.preset))]).toEqual(['aot']);
    expect(datasets.some(dataset => excludedPresets.includes(dataset.preset))).toBe(false);
    expect(datasets.flatMap(dataset => dataset.points).some(point => point.bucketType === 'week')).toBe(true);
    expect(datasets.flatMap(dataset => dataset.points).some(point => point.bucketType === 'release')).toBe(true);
    for (const preset of excludedPresets) {
        await expect(page.locator(`#filter-presets-${preset}`)).toHaveCount(0);
    }
    await expect(page.locator('#blazor-error-ui')).toBeHidden();
});
