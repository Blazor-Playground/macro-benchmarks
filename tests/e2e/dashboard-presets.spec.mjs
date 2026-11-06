import { expect, test } from 'playwright/test';
import { focusFixture, routeFocusFixture } from '../helpers/focus-fixture.mjs';

test('R2R presets are selectable before their first published results', async ({ page }) => {
    const fixture = focusFixture();
    fixture.index.dimensions.presets = ['no-workload', 'aot', 'unknown-preset'];
    await routeFocusFixture(page, fixture);
    await page.goto('/macro-benchmarks/');

    await expect(page.locator('#filter-presets-no-workload')).toBeChecked();
    await expect(page.locator('#filter-presets-aot')).not.toBeChecked();
    await expect(page.locator('#filter-presets-unknown-preset')).toHaveCount(0);
    for (const [preset, label] of [
        ['r2r-pgo', 'R2R PGO'],
    ]) {
        const checkbox = page.locator(`#filter-presets-${preset}`);
        await expect(checkbox).toBeVisible();
        await expect(checkbox).not.toBeChecked();
        await expect(page.locator(`label[for="filter-presets-${preset}"]`)).toHaveText(label);
        await checkbox.check();
        await expect(checkbox).toBeChecked();
    }
    await expect(page.locator('#filter-presets-aot')).toHaveCount(1);
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

test('unknown historical presets are ignored in daily and release chart datasets', async ({ page }) => {
    const fixture = focusFixture();
    const release = structuredClone(fixture.buckets[0]);
    release.path = 'releases/net12';
    release.header.release = 'net12';
    delete release.header.week;
    fixture.index.releases.push('net12');
    fixture.buckets.push(release);
    fixture.index.dimensions.presets.push('unknown-preset');
    for (const bucket of fixture.buckets) {
        for (const metrics of Object.values(bucket.appMetrics)) {
            for (const rows of Object.values(metrics)) {
                rows['coreclr/unknown-preset/desktop/chrome'] = bucket.header.columns.map(() => 123);
            }
        }
    }
    await routeFocusFixture(page, fixture);
    await page.goto('/macro-benchmarks/');
    await expect(page.locator('#filter-presets-no-workload')).toBeChecked();
    await expect.poll(() => page.evaluate(() => Object.values(Chart.instances)
        .flatMap(chart => chart.data.datasets).length)).toBeGreaterThan(0);
    const datasets = await page.evaluate(() => Object.values(Chart.instances).flatMap(chart =>
        chart.data.datasets.map(dataset => ({ rowKey: dataset.rowKey, points: dataset.data }))));
    expect(datasets.some(dataset => dataset.rowKey?.includes('/unknown-preset/'))).toBe(false);
    expect(datasets.flatMap(dataset => dataset.points).some(point => point.bucketType === 'week')).toBe(true);
    expect(datasets.flatMap(dataset => dataset.points).some(point => point.bucketType === 'release')).toBe(true);
    await expect(page.locator('#filter-presets-unknown-preset')).toHaveCount(0);
    await expect(page.locator('#blazor-error-ui')).toBeHidden();
});
