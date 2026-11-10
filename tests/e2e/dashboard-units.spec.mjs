import { expect, test } from 'playwright/test';
import { focusFixture, routeFocusFixture } from '../helpers/focus-fixture.mjs';

test('All Benchmarks charts and details use MiB and KiB at the binary threshold', async ({ page }) => {
    const fixture = focusFixture();
    const app = 'blazing-pizza';
    const downloadMetric = 'download-size-cold';
    const heapMetric = 'blazor-counter-heavy-server-otel-heap-mb';
    const allocationMetric = 'blazor-counter-heavy-server-otel-alloc-rate';
    const metrics = [downloadMetric, heapMetric, allocationMetric];
    const latestBucket = fixture.buckets.at(-1);
    const downloadRows = latestBucket.appMetrics[app][downloadMetric];

    for (const values of Object.values(downloadRows)) {
        values[values.length - 2] = 1_048_576;
        values[values.length - 1] = 1_000_000;
    }
    const otelRows = value => Object.fromEntries(Object.entries(downloadRows).map(([row, values]) => [
        row, values.map(measurement => measurement == null ? null : value),
    ]));
    latestBucket.appMetrics[app][heapMetric] = otelRows(12.5);
    latestBucket.appMetrics[app][allocationMetric] = otelRows(3.2);
    latestBucket.header.apps[app] = metrics;
    fixture.index.apps = [app];
    fixture.index.metrics = { [app]: metrics };

    await routeFocusFixture(page, fixture);
    await page.goto('/macro-benchmarks/');

    const canvas = page.locator(`#chart-${app}-${downloadMetric}`);
    await expect(canvas).toBeVisible();
    await expect.poll(() => canvas.evaluate(element => !!Chart.getChart(element))).toBe(true);
    const points = await canvas.evaluate(element => {
        const chart = Chart.getChart(element);
        const datasetIndex = chart.data.datasets.findIndex((dataset, index) =>
            dataset.rowKey === 'coreclr/no-workload/desktop/chrome' && chart.isDatasetVisible(index));
        if (datasetIndex < 0) throw new Error('Expected visible CoreCLR no-workload dataset');
        return chart.getDatasetMeta(datasetIndex).data.slice(-2).map(point => ({ x: point.x, y: point.y }));
    });

    const tooltipText = async position => {
        await canvas.hover({ position });
        await expect.poll(() => canvas.evaluate(element => Chart.getChart(element).tooltip.opacity)).toBe(1);
        return canvas.evaluate(element =>
            Chart.getChart(element).tooltip.body.flatMap(item => item.lines).join('\n'));
    };
    expect(await tooltipText(points[0])).toContain('1.00 MiB');
    expect(await tooltipText(points[1])).toContain('976.56 KiB');

    await canvas.click({ position: points[0] });
    const metricsList = page.locator('.detail-panel .metrics-list').first();
    await expect(metricsList).toContainText('Download Size Cold: 1.00 MiB');
    await expect(metricsList).toContainText('Heap Size: 12.5 MiB');
    await expect(metricsList).toContainText('Alloc Rate: 3.2 MiB/s');

    await page.locator('.detail-panel-header button').click();
    await expect(page.locator('.detail-panel')).toHaveCount(0);
    await canvas.click({ position: points[1] });
    await expect(metricsList).toContainText('Download Size Cold: 976.6 KiB');
    expect(await metricsList.innerText()).not.toMatch(/\b(?:MB|KB)(?:\/s)?\b/);
});
