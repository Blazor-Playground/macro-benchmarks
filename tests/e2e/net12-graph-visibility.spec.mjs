import { expect, test } from 'playwright/test';
import { expectedComparison, FOCUS_FIXTURE_TIME, routeFocusFixture } from '../helpers/focus-fixture.mjs';

const path = '/macro-benchmarks/net12-focus';
async function open(page) {
    await page.clock.setFixedTime(FOCUS_FIXTURE_TIME);
    await routeFocusFixture(page);
    await page.goto(path);
    await expect(page.locator('.focus-kpi')).toHaveCount(4);
    await expect(page.locator('.focus-error')).toHaveCount(0);
}
async function state(page) {
    return page.evaluate(() => Object.values(Chart.instances).filter(chart => chart.canvas.id.startsWith('focus-')).map(chart => ({
        labels: chart.data.datasets.map(dataset => dataset.label),
        axes: Object.keys(chart.scales),
        values: chart.data.datasets.map(dataset => dataset.data),
    })));
}
async function repaint(page) {
    return page.evaluate(() => {
        globalThis.visibilityPaint = [];
        for (const chart of Object.values(Chart.instances)) {
            if (chart.canvas.id.startsWith('focus-')) chart.update('none');
        }
        return globalThis.visibilityPaint;
    });
}

test('four visibility combinations control actual datasets, axes, bands, legend and parity without refetching', async ({ page }) => {
    await page.addInitScript(() => {
        globalThis.visibilityPaint = [];
        const originalFill = CanvasRenderingContext2D.prototype.fill;
        const originalText = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fill = function (...args) {
            if (this.canvas.id.startsWith('focus-') && Math.abs(this.globalAlpha - 0.2) < 1e-6) {
                globalThis.visibilityPaint.push({ kind: 'band', color: this.fillStyle });
            }
            return originalFill.apply(this, args);
        };
        CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
            if (this.canvas.id.startsWith('focus-') && text === '0% parity') {
                globalThis.visibilityPaint.push({ kind: 'parity' });
            }
            return originalText.call(this, text, ...args);
        };
    });
    let requests = 0;
    page.on('request', request => { if (request.url().includes('/data/views/')) requests++; });
    await open(page);
    const percentage = page.getByLabel('Percentage curve', { exact: true });
    const measurements = page.getByLabel('Actual measurements', { exact: true });
    await expect(percentage).not.toBeChecked();
    await expect(measurements).toBeChecked();
    await expect.poll(async () => (await state(page)).map(chart => chart.labels))
        .toEqual(Array(4).fill(['CoreCLR R2R', 'Mono Release']));
    for (const chart of await state(page)) expect(chart.axes).toEqual(['x', 'y']);
    const defaultPaint = await repaint(page);
    expect(defaultPaint.some(item => item.kind === 'parity')).toBeFalsy();
    expect(defaultPaint.some(item => item.kind === 'band')).toBeFalsy();
    await expect(page.getByRole('button', { name: 'No average', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Show min-max bands')).toBeDisabled();
    await expect(page.getByLabel('Show min-max bands')).toBeChecked();
    await page.getByRole('button', { name: '5-point average', exact: true }).click();
    const summaries = await page.locator('.focus-card-summary').allTextContents();
    const sdk = await page.locator('.focus-latest-builds').innerText();
    const initialRequests = requests;
    const modes = [
        { percentage: true, measurements: false, labels: ['CoreCLR vs Mono (%)'], axes: ['x', 'comparison'], legend: ['vs Mono %'], bands: ['#7b4bc4'] },
        { percentage: true, measurements: true, labels: ['CoreCLR R2R', 'Mono Release', 'CoreCLR vs Mono (%)'], axes: ['x', 'y', 'comparison'], legend: ['CoreCLR', 'Mono', 'vs Mono %'], bands: ['#4285f4', '#f4b400', '#7b4bc4'] },
        { percentage: false, measurements: true, labels: ['CoreCLR R2R', 'Mono Release'], axes: ['x', 'y'], legend: ['CoreCLR', 'Mono'], bands: ['#4285f4', '#f4b400'] },
        { percentage: false, measurements: false, labels: [], axes: [], legend: [], bands: [] },
    ];
    for (const mode of modes) {
        await percentage.setChecked(mode.percentage);
        await measurements.setChecked(mode.measurements);
        await expect.poll(async () => (await state(page)).map(chart => chart.labels)).toEqual(mode.labels.length ? Array(4).fill(mode.labels) : []);
        for (const chart of await state(page)) expect(chart.axes).toEqual(mode.axes);
        await expect(page.locator('.focus-legend > span')).toHaveText(mode.legend);
        const painted = await repaint(page);
        expect([...new Set(painted.filter(item => item.kind === 'band').map(item => item.color))].sort()).toEqual([...mode.bands].sort());
        expect(painted.some(item => item.kind === 'parity')).toBe(mode.percentage);
        expect(await page.locator('.focus-card-summary').allTextContents()).toEqual(summaries);
        expect(await page.locator('.focus-latest-builds').innerText()).toBe(sdk);
    }
    await expect(page.locator('.focus-card canvas')).toHaveCount(0);
    await expect(page.locator('.focus-card-chart')).toHaveCount(0);
    await expect(page.locator('.focus-legend')).toHaveCount(0);
    await expect(page.locator('.focus-summary-only')).toHaveCount(4);
    await expect(page.getByText('Graphs off · summaries still update')).toBeVisible();
    await expect(percentage).toBeEnabled();
    await expect(measurements).toBeEnabled();
    await expect(page.getByRole('button', { name: '5-point average', exact: true })).toBeDisabled();
    await expect(page.getByLabel('Show min-max bands')).toBeDisabled();
    expect(requests).toBe(initialRequests);
});

test('fresh and re-entered raw defaults preserve exact runtime points and the independent 5 avg captions', async ({ page }) => {
    await open(page);
    const expected = expectedComparison('havit-bootstrap', 'r2r-release', 'mobile');
    const summaries = await page.locator('.focus-card-summary').allTextContents();
    async function checkRaw() {
        await expect(page.getByRole('button', { name: 'No average', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByLabel('Percentage curve', { exact: true })).not.toBeChecked();
        await expect(page.getByLabel('Actual measurements', { exact: true })).toBeChecked();
        await expect(page.getByLabel('Show min-max bands')).toBeDisabled();
        await expect(page.getByLabel('Show min-max bands')).toBeChecked();
        const graphs = await state(page);
        expect(graphs).toHaveLength(4);
        for (let i = 0; i < graphs.length; i++) {
            const divisor = i === 0 ? 1 : i === 2 ? 1_000_000 : 1000;
            expect(graphs[i].axes).toEqual(['x', 'y']);
            expect(graphs[i].values[0].at(-1).y).toBe(expected[i].latest.coreclr / divisor);
            expect(graphs[i].values[1].at(-1).y).toBe(expected[i].latest.mono / divisor);
        }
        expect(await page.locator('.focus-card-summary').allTextContents()).toEqual(summaries);
        await expect(page.locator('.focus-rolling-caption')).toHaveCount(4);
    }
    await checkRaw();
    await page.getByRole('button', { name: '5-point average', exact: true }).click();
    await expect(page.getByLabel('Show min-max bands')).toBeEnabled();
    expect(await page.locator('.focus-card-summary').allTextContents()).toEqual(summaries);
    await page.getByRole('link', { name: 'All benchmarks', exact: true }).click();
    await expect(page.locator('#filter-profiles-mobile')).toBeChecked();
    await page.getByRole('link', { name: 'NET12 focus', exact: true }).click();
    await expect(page.locator('.focus-kpi')).toHaveCount(4);
    await checkRaw();
});

test('percentage-only tooltips use the percentage dataset and not hidden runtime units', async ({ page }) => {
    await open(page);
    await page.getByLabel('Percentage curve', { exact: true }).check();
    await page.getByLabel('Actual measurements', { exact: true }).uncheck();
    await expect.poll(async () => (await state(page)).map(chart => chart.labels.length)).toEqual([1, 1, 1, 1]);
    const canvas = page.locator('[data-metric="startup"] canvas');
    const position = await canvas.evaluate(element => {
        const point = Chart.getChart(element).getDatasetMeta(0).data.at(-1);
        return { x: point.x, y: point.y };
    });
    await canvas.hover({ position });
    await expect.poll(() => canvas.evaluate(element => Chart.getChart(element).tooltip.opacity)).toBe(1);
    const labels = await canvas.evaluate(element => Chart.getChart(element).tooltip.body.flatMap(item => item.lines).join('\n'));
    expect(labels).toContain('CoreCLR vs Mono (%) raw: +119.3%');
    expect(labels).not.toContain('CoreCLR R2R raw:');
    expect(labels).not.toMatch(/\d ms/);
});

test('graphs off keeps selectors and both summaries live and restores the prior graph-only settings', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'No average', exact: true }).click();
    await page.getByLabel('Actual measurements', { exact: true }).uncheck();
    await expect.poll(async () => (await state(page)).length).toBe(0);
    await page.locator('#focus-flavor').selectOption('r2r-aot');
    await page.locator('#focus-startup-profile').selectOption('desktop');
    await page.locator('#focus-app').selectOption('empty-blazor');
    await page.getByRole('button', { name: '1 month', exact: true }).click();
    await expect(page.locator('.focus-metrics')).toHaveAttribute('aria-busy', 'false');
    const expected = expectedComparison('empty-blazor', 'r2r-aot', 'desktop');
    const ids = ['startup', 'walkthrough', 'download', 'build'];
    for (const [i, id] of ids.entries()) {
        const card = page.locator(`[data-metric="${id}"]`);
        if (expected[i].latest) {
            await expect(card.locator('.focus-percentage')).toHaveText(`${Math.abs(expected[i].latest.percent).toFixed(1)}%`);
            expect(Number(await card.locator('.focus-rolling-caption').getAttribute('data-average'))).toBeCloseTo(expected[i].latest.average, 9);
        } else {
            await expect(card).toContainText('no equivalent elapsed-time walkthrough');
        }
    }
    await expect(page.locator('.focus-card')).toHaveCount(4);
    await expect(page.locator('.focus-card canvas')).toHaveCount(0);
    expect(await state(page)).toHaveLength(0);
    await expect(page.locator('.focus-latest-builds')).toBeVisible();
    const summaries = await page.locator('.focus-card-summary').allTextContents();
    await expect(page.getByRole('button', { name: 'No average', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Show min-max bands')).toBeChecked();
    await page.getByLabel('Actual measurements', { exact: true }).check();
    await expect.poll(async () => (await state(page)).length).toBe(3);
    await expect(page.getByRole('button', { name: 'No average', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Show min-max bands')).toBeDisabled();
    expect((await state(page))[0].values[0].at(-1).y).toBe(expected[0].latest.coreclr);
    // Only the unavailable card's explanatory text changes location between layouts.
    expect((await page.locator('.focus-card-summary').allTextContents()).filter((_, i) => i !== 1))
        .toEqual(summaries.filter((_, i) => i !== 1));
    await page.getByRole('button', { name: '5-point average', exact: true }).click();
    await expect(page.getByLabel('Show min-max bands')).toBeEnabled();
    await expect(page.getByLabel('Show min-max bands')).toBeChecked();
});

test('an in-flight selection cannot resurrect graphs after both-off; repeated toggles and navigation dispose correctly', async ({ page }) => {
    await open(page);
    let release;
    let blocked = 0;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/blazing-pizza_*.json', async route => { blocked++; await gate; await route.fallback(); });
    await page.locator('#focus-app').selectOption('blazing-pizza');
    await expect.poll(() => blocked).toBeGreaterThan(0);
    await page.getByLabel('Actual measurements', { exact: true }).uncheck();
    release();
    await expect(page.locator('.focus-metrics')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.focus-kpi')).toHaveCount(4);
    await expect(page.locator('.focus-card canvas')).toHaveCount(0);
    expect(await state(page)).toHaveLength(0);
    for (let i = 0; i < 3; i++) {
        await page.getByLabel('Percentage curve', { exact: true }).check();
        await expect.poll(async () => (await state(page)).length).toBe(4);
        await page.getByLabel('Percentage curve', { exact: true }).uncheck();
        await expect.poll(async () => (await state(page)).length).toBe(0);
    }
    await page.getByRole('link', { name: 'All benchmarks', exact: true }).click();
    await expect(page.locator('#filter-profiles-mobile')).toBeChecked();
    await expect.poll(() => page.evaluate(() => Object.keys(Chart.instances).length)).toBeGreaterThan(0);
    expect(await state(page)).toHaveLength(0);
    await page.getByRole('link', { name: 'NET12 focus', exact: true }).click();
    await expect(page.getByLabel('Percentage curve', { exact: true })).not.toBeChecked();
    await expect(page.getByLabel('Actual measurements', { exact: true })).toBeChecked();
    await expect.poll(async () => (await state(page)).map(chart => chart.labels.length)).toEqual([2, 2, 2, 2]);
    expect(await page.evaluate(() => Object.keys(Chart.instances).length)).toBe(4);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 1600, height: 900 }, { width: 390, height: 844 }]) {
    test(`visibility controls and summary-only layout remain usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page);
        const measurements = page.getByLabel('Actual measurements', { exact: true });
        await measurements.focus();
        await page.keyboard.press('Space');
        await expect(measurements).not.toBeChecked();
        await expect(page.locator('.focus-card canvas')).toHaveCount(0);
        await page.locator('.focus-main').scrollIntoViewIfNeeded();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        if (viewport.width >= 1280) {
            expect(await page.locator('.focus-card').evaluateAll(cards => cards.every(card => {
                const r = card.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight;
            }))).toBeTruthy();
        } else {
            await page.locator('.net12-focus').evaluate(element => { element.style.zoom = '1.5'; });
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        }
        await page.getByLabel('Actual measurements', { exact: true }).check();
        await expect.poll(async () => (await state(page)).map(chart => chart.labels.length)).toEqual([2, 2, 2, 2]);
        await expect(page.locator('.focus-error')).toHaveCount(0);
    });
}
