import { expect, test } from 'playwright/test';
import { expectedComparison, FOCUS_FIXTURE_TIME, routeFocusFixture } from '../helpers/focus-fixture.mjs';

async function open(page) {
    await page.clock.setFixedTime(FOCUS_FIXTURE_TIME);
    await routeFocusFixture(page);
    await page.goto('/macro-benchmarks/net12-focus');
    await expect(page.locator('.focus-metrics')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.focus-error')).toHaveCount(0);
    await expect(page.locator('.focus-kpi')).toHaveCount(4);
}

async function sampleTooltips(page) {
    return page.evaluate(() => {
        let checked = 0;
        const failures = [];
        for (const chart of Object.values(Chart.instances).filter(chart => chart.canvas.id.startsWith('focus-'))) {
            chart.data.datasets[0].data.forEach((_, index) => {
                const active = chart.data.datasets.flatMap((dataset, datasetIndex) =>
                    dataset.data[index].y === null ? [] : [{ datasetIndex, index }]);
                if (!active.length) return;
                const point = chart.getDatasetMeta(active[0].datasetIndex).data[index];
                chart.tooltip.setActiveElements(active, { x: point.x, y: point.y });
                chart.draw();
                const tooltip = chart.tooltip;
                checked++;
                if (!tooltip.options.enabled || tooltip.options.external
                    || tooltip.options.bodyFont.size < 10
                    || tooltip.x < -0.1 || tooltip.y < -0.1
                    || tooltip.x + tooltip.width > chart.width + 0.1
                    || tooltip.y + tooltip.height > chart.height + 0.1) {
                    failures.push({
                        metric: chart.canvas.closest('[data-metric]').dataset.metric, index,
                        canvas: [chart.width, chart.height],
                        tooltip: [tooltip.x, tooltip.y, tooltip.width, tooltip.height],
                        body: tooltip.body.flatMap(body => body.lines),
                    });
                }
            });
            chart.tooltip.setActiveElements([], { x: 0, y: 0 });
            chart.draw();
        }
        return { checked, failures: failures.slice(0, 3) };
    });
}

for (const viewport of [
    { width: 1280, height: 800 }, { width: 1600, height: 900 },
    { width: 390, height: 844 }, { width: 568, height: 320 },
]) {
    test(`native tooltip bounds cover raw and averaged cohorts at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page);
        await page.getByLabel('Percentage curve', { exact: true }).check();
        let checked = 0;
        for (const app of ['havit-bootstrap', 'semi-avalonia', 'uno-gallery']) {
            await page.locator('#focus-app').selectOption(app);
            for (const flavor of ['release-release', 'r2r-release', 'r2r-aot']) {
                await page.locator('#focus-flavor').selectOption(flavor);
                for (const profile of ['mobile', 'desktop']) {
                    await page.locator('#focus-startup-profile').selectOption(profile);
                    await expect(page.locator('.focus-metrics')).toHaveAttribute('aria-busy', 'false');
                    for (const mode of ['No average', '5-point average']) {
                        await page.getByRole('button', { name: mode, exact: true }).click();
                        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                        const result = await sampleTooltips(page);
                        expect(result.failures, `${app}/${flavor}/${profile}/${mode}`).toEqual([]);
                        checked += result.checked;
                    }
                }
            }
        }
        expect(checked).toBeGreaterThan(1000);
        await expect(page.locator('.net12-focus-tooltip, [role="tooltip"]')).toHaveCount(0);
        await expect(page.locator('.focus-error')).toHaveCount(0);
    });
}

test('responsive breakpoints keep native tooltip details inside intermediate-width canvases', async ({ page }) => {
    await open(page);
    await page.locator('#focus-app').selectOption('semi-avalonia');
    await page.locator('#focus-flavor').selectOption('release-release');
    await page.getByLabel('Percentage curve', { exact: true }).check();
    await page.getByRole('button', { name: '5-point average', exact: true }).click();
    for (const width of [1279, 1101, 800, 799]) {
        await page.setViewportSize({ width, height: 800 });
        await expect.poll(async () => (await sampleTooltips(page)).failures).toEqual([]);
        expect((await sampleTooltips(page)).checked).toBeGreaterThan(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.net12-focus').evaluate(element => { element.style.zoom = '1.5'; });
    await expect.poll(async () => (await sampleTooltips(page)).failures).toEqual([]);
    expect((await sampleTooltips(page)).checked).toBeGreaterThan(0);
});

test('native color boxes are painted for visible series and one-runtime gaps', async ({ page }) => {
    await page.addInitScript(() => {
        globalThis.nativeTooltipPaint = [];
        const fillRect = CanvasRenderingContext2D.prototype.fillRect;
        CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
            if (this.canvas.id.startsWith('focus-') && width > 0 && width <= 12 && height > 0 && height <= 12
                && ['#4285f4', '#f4b400', '#7b4bc4'].includes(this.fillStyle)) {
                globalThis.nativeTooltipPaint.push(this.fillStyle);
            }
            return fillRect.call(this, x, y, width, height);
        };
    });
    await open(page);
    const hover = async expectedColors => {
        const canvas = page.locator('[data-metric="startup"] canvas');
        await page.evaluate(() => { globalThis.nativeTooltipPaint = []; });
        const position = await canvas.evaluate(element => {
            const chart = Chart.getChart(element);
            const dataset = chart.data.datasets.findIndex(series => series.data.at(-1).y !== null);
            const point = chart.getDatasetMeta(dataset).data.at(-1);
            return { x: point.x, y: point.y };
        });
        await canvas.hover({ position });
        await expect.poll(() => canvas.evaluate(element => Chart.getChart(element).tooltip.opacity)).toBe(1);
        const tooltip = await canvas.evaluate(element => {
            const chart = Chart.getChart(element);
            return {
                enabled: chart.tooltip.options.enabled, external: !!chart.tooltip.options.external,
                colors: chart.tooltip.labelColors.map(color => color.backgroundColor.toLowerCase()),
            };
        });
        expect(tooltip).toEqual({ enabled: true, external: false, colors: expectedColors });
        expect(await page.evaluate(() => [...new Set(globalThis.nativeTooltipPaint)])).toEqual(expectedColors);
        await expect(page.locator('.net12-focus-tooltip, [role="tooltip"]')).toHaveCount(0);
    };
    await hover(['#4285f4', '#f4b400']);
    await page.getByLabel('Percentage curve', { exact: true }).check();
    await hover(['#4285f4', '#f4b400', '#7b4bc4']);
    await page.getByRole('button', { name: '5-point average', exact: true }).click();
    await hover(['#4285f4', '#f4b400', '#7b4bc4']);
    await page.getByLabel('Actual measurements', { exact: true }).uncheck();
    await hover(['#7b4bc4']);
    await page.getByLabel('Actual measurements', { exact: true }).check();
    await page.getByLabel('Percentage curve', { exact: true }).uncheck();
    await page.locator('#focus-app').selectOption('uno-gallery');
    await expect(page.locator('.focus-metrics')).toHaveAttribute('aria-busy', 'false');
    await hover(['#f4b400']);
    await page.getByLabel('Actual measurements', { exact: true }).uncheck();
    await expect(page.locator('.focus-card canvas')).toHaveCount(0);
    expect(await page.evaluate(() => Object.values(Chart.instances).filter(chart => chart.canvas.id.startsWith('focus-')).length)).toBe(0);
});

test('native tooltip keeps independent window counts, raw values and full SDK identities', async ({ page }) => {
    await open(page);
    await page.getByLabel('Percentage curve', { exact: true }).check();
    await page.getByRole('button', { name: '5-point average', exact: true }).click();
    const expected = expectedComparison('havit-bootstrap', 'r2r-release', 'mobile')[0];
    const firstPair = expected.points.findIndex(point => point.percent !== null);
    const source = expected.points[firstPair];
    const canvas = page.locator('[data-metric="startup"] canvas');
    const tooltip = await canvas.evaluate((element, index) => {
        const chart = Chart.getChart(element);
        const point = chart.getDatasetMeta(0).data[index];
        chart.tooltip.setActiveElements([0, 1, 2].map(datasetIndex => ({ datasetIndex, index })), { x: point.x, y: point.y });
        chart.draw();
        return { title: chart.tooltip.title.join(' '), body: chart.tooltip.body.map(body => body.lines.join(' ')) };
    }, firstPair);
    expect(tooltip.title).toContain(source.sdk);
    expect(tooltip.body[0]).toContain(`raw: ${source.coreclr.toLocaleString('en-US')} ms`);
    expect(tooltip.body[1]).toContain(`raw: ${source.mono.toLocaleString('en-US')} ms`);
    expect(tooltip.body[0]).toContain('1/5 points');
    expect(tooltip.body[1]).toContain('5/5 points');
    expect(tooltip.body[2]).toContain('1/5 points');
    expect(tooltip.body[0]).toContain(`From SDK ${source.sdk}`);
    expect(tooltip.body[1]).toContain(`From SDK ${expected.points[firstPair - 4].sdk}`);
    expect(tooltip.body[2]).toContain(`Mean +${source.percent.toFixed(1)}; min +${source.percent.toFixed(1)}; max +${source.percent.toFixed(1)}%`);
});
