import { test, expect } from 'playwright/test';
import { expectedComparison, focusFixture, FOCUS_FIXTURE_TIME, routeFocusFixture } from '../helpers/focus-fixture.mjs';

const path = '/macro-benchmarks/net12-focus';
const titles = ['Cold startup', 'Walkthrough', 'Cold download size', 'Build time'];

async function selectComparison(page, flavor = 'release-release', profile = 'desktop') {
    await page.locator('#focus-flavor').selectOption(flavor);
    await page.locator('#focus-startup-profile').selectOption(profile);
    await expect(page.locator('.focus-metrics')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('[data-metric="startup"]')).toHaveAttribute('data-profile', profile);
}

async function open(page, fixture = focusFixture(), selection = { flavor: 'release-release', startupProfile: 'desktop' }) {
    await page.clock.setFixedTime(FOCUS_FIXTURE_TIME);
    await routeFocusFixture(page, fixture);
    await page.goto(path);
    await expect(page.locator('.focus-metrics')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.focus-error')).toHaveCount(0);
    await expect(page.locator('.focus-card')).toHaveCount(4);
    await expect(page.locator('#blazor-error-ui')).toBeHidden();
    if (selection) await selectComparison(page, selection.flavor, selection.startupProfile);
}

async function charts(page) {
    return page.evaluate(() => Object.values(Chart.instances).filter(chart => chart.canvas.id.startsWith('focus-')).map(chart => ({
        id: chart.canvas.id,
        labels: chart.data.datasets.map(dataset => dataset.label),
        values: chart.data.datasets.map(dataset => dataset.data),
        spanGaps: chart.data.datasets.map(dataset => dataset.spanGaps),
        axes: chart.data.datasets.map(dataset => dataset.yAxisID),
        percentMin: chart.scales.comparison?.min,
        percentMax: chart.scales.comparison?.max,
        runtimeMax: chart.scales.y?.max,
        xPixels: chart.data.datasets[0].data.map(point => chart.scales.x.getPixelForValue(point.x)),
    })));
}

async function assertSelectionValues(page, app, flavor, profile, fixture = focusFixture()) {
    const expected = expectedComparison(app, flavor, profile, fixture);
    for (const [index, id] of ['startup', 'walkthrough', 'download', 'build'].entries()) {
        const card = page.locator(`[data-metric="${id}"]`);
        const source = expected[index];
        await expect(card).toHaveAttribute('data-profile', source.profile);
        await expect(card).toHaveAttribute('data-coreclr-row', source.coreclrRow);
        await expect(card).toHaveAttribute('data-mono-row', source.monoRow);
        if (!source.latest) {
            await expect(card.locator('.focus-kpi')).toHaveCount(0);
            await expect(card.locator('.focus-rolling-caption')).toHaveCount(0);
            continue;
        }
        await expect(card.locator('.focus-percentage')).toHaveText(`${Math.abs(source.latest.percent).toFixed(1)}%`);
        const format = value => index === 0 ? `${value.toLocaleString('en-US')} ms`
            : `${(value / (index === 2 ? 1_000_000 : 1000)).toLocaleString('en-US', {
                minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false,
            })} ${index === 2 ? 'MB' : 's'}`;
        await expect(card.locator('.focus-values dd')).toHaveText([format(source.latest.coreclr), format(source.latest.mono)]);
        const caption = card.locator('.focus-rolling-caption');
        expect(Number(await caption.getAttribute('data-average'))).toBeCloseTo(source.latest.average, 9);
        await expect(caption).toHaveAttribute('data-count', String(source.latest.count));
        await expect(caption).toHaveAttribute('data-end-sdk', source.latest.sdk);
    }
}

function boundaryPublication(columns, coreclr, mono) {
    const fixture = focusFixture();
    const app = 'havit-bootstrap';
    const path = '2026-07-06';
    const keys = ['time-to-reach-managed-cold', 'havit-walkthrough', 'download-size-cold', 'compile-time'];
    const template = fixture.buckets[0].header.columns[0];
    const header = {
        week: path,
        columns: columns.map((column, index) => ({
            ...template,
            sdkVersion: `12.0.100-alpha.1.26400.${index + 1}`,
            vmrGitHash: (index + 1).toString(16).padStart(40, '0'),
            ...column,
        })),
        apps: { [app]: keys },
    };
    const metrics = Object.fromEntries(keys.map((key, index) => {
        const profile = index === 0 ? 'mobile' : 'desktop';
        return [key, {
            [`coreclr/aot/${profile}/chrome`]: [...coreclr],
            [`mono/no-workload/${profile}/chrome`]: [...mono],
        }];
    }));
    fixture.index = { ...fixture.index, apps: [app], weeks: [path], releases: [], metrics: { [app]: keys } };
    fixture.buckets = [{ path, header, appMetrics: { [app]: metrics } }];
    return fixture;
}

test('the browser crops SDK days but retains pre-range rolling lookback from an older commit-week bucket', async ({ page }) => {
    const fixture = boundaryPublication(
        ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-07', '2026-09-20']
            .map(releaseDate => ({ releaseDate })),
        [100, 200, 300, 400, 500, 600, 700],
        [100, 100, 100, 100, 100, 100, 100],
    );
    await open(page, fixture, null);
    await expect.poll(async () => (await charts(page))[0]?.values[0].map(point => point.y)).toEqual([600, 700]);
    const startup = page.locator('[data-metric="startup"]');
    await expect(startup.locator('.focus-percentage')).toHaveText('600.0%');
    await expect(startup.locator('.focus-rolling-caption')).toContainText('400.0% slower');
    await expect(startup.locator('.focus-rolling-caption')).toHaveAttribute('data-count', '5');
    await page.getByLabel('Percentage curve', { exact: true }).check();
    await page.getByRole('button', { name: '5-point average', exact: true }).click();
    await expect.poll(async () => (await charts(page))[0]?.values[0].map(point => point.y)).toEqual([400, 500]);
    await expect.poll(async () => (await charts(page))[0]?.values[2].map(point => point.y)).toEqual([300, 400]);
    await page.getByRole('button', { name: '1 month', exact: true }).click();
    await expect.poll(async () => (await charts(page))[0]?.values[0].map(point => point.y)).toEqual([100, 150, 200, 250, 300, 400, 500]);
    await expect(startup.locator('.focus-percentage')).toHaveText('600.0%');
    await expect(startup.locator('.focus-rolling-caption')).toContainText('400.0% slower');
    await page.getByRole('button', { name: '14 days', exact: true }).click();
    await expect.poll(async () => (await charts(page))[0]?.values[0].map(point => point.y)).toEqual([400, 500]);
});

test('same-day same-SDK variants stay distinct and use full identity rather than VMR-only ordering', async ({ page }) => {
    const fixture = boundaryPublication([
        { releaseDate: '2026-09-20', sdkVersion: '12.0.100-alpha.1.26400.1', sdkGitHash: 'f'.repeat(40), vmrGitHash: '1'.repeat(40) },
        { releaseDate: '2026-09-20', sdkVersion: '12.0.100-alpha.1.26400.1', sdkGitHash: 'a'.repeat(40), vmrGitHash: 'f'.repeat(40) },
    ], [500, 300], [100, 100]);
    await open(page, fixture, null);
    await expect.poll(async () => (await charts(page))[0]?.values[0]).toEqual([{ x: 0, y: 300 }, { x: 1, y: 500 }]);
    const startup = page.locator('[data-metric="startup"]');
    await expect(startup.locator('.focus-values dd')).toHaveText(['500 ms', '100 ms']);
    await expect(startup.locator('.focus-percentage')).toHaveText('400.0%');
    await expect(startup.locator('.focus-rolling-caption')).toContainText('300.0% slower');
    await expect(startup.locator('.focus-rolling-caption')).toHaveAttribute('data-count', '2');
    const chart = (await charts(page))[0];
    expect(chart.xPixels[1]).toBeGreaterThan(chart.xPixels[0]);
});

test('a publication without SDK12 buckets reports no history rather than a load error or older-channel values', async ({ page }) => {
    const fixture = focusFixture();
    fixture.index.weeks = [];
    fixture.buckets = [];
    await open(page, fixture, null);
    await expect(page.locator('.focus-card[data-status="no-history"]')).toHaveCount(4);
    await expect(page.locator('.focus-kpi')).toHaveCount(0);
    await expect(page.locator('.focus-card canvas')).toHaveCount(0);
    await expect(page.locator('.focus-latest-builds')).toHaveCount(0);
    await expect(page.locator('.focus-empty').first()).toContainText('No eligible SDK 12 builds are published');
    await page.getByRole('button', { name: '12 months', exact: true }).click();
    await expect(page.locator('.focus-card[data-status="no-history"]')).toHaveCount(4);
    await expect(page.locator('.focus-error')).toHaveCount(0);
});

test('default selections, flavor/profile mappings and sidebar navigation are explicit', async ({ page }) => {
    let requests = 0;
    page.on('request', request => { if (request.url().includes('/data/views/')) requests++; });
    await open(page, focusFixture(), null);
    await expect(page.locator('#focus-flavor')).toHaveValue('r2r-release');
    await expect(page.locator('#focus-startup-profile')).toHaveValue('mobile');
    await expect(page.locator('#focus-flavor option')).toHaveText([
        'Release vs Release', 'Release/R2R vs Release', 'Release/R2R vs Release/AOT',
    ]);
    await expect(page.locator('.focus-header')).toHaveCount(0);
    const sidebar = page.getByRole('complementary', { name: 'NET12 focus settings' });
    await expect(sidebar.getByRole('link', { name: /WASM benchmarks/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'NET12 focus', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(sidebar.getByRole('link', { name: 'All benchmarks', exact: true })).toHaveAttribute('href', '');
    await expect(sidebar).toContainText('Startup: mobile; other metrics: desktop');
    expect(await sidebar.evaluate(element => {
        const brand = element.querySelector('.dashboard-brand').getBoundingClientRect();
        const navigation = element.querySelector('.dashboard-mode-tabs').getBoundingClientRect();
        return navigation.top >= brand.bottom;
    })).toBeTruthy();
    await assertSelectionValues(page, 'havit-bootstrap', 'r2r-release', 'mobile');
    const originalRequests = requests;
    for (const flavor of ['release-release', 'r2r-release', 'r2r-aot']) {
        await selectComparison(page, flavor, 'desktop');
        const otherCards = await page.locator('.focus-card-summary').allTextContents();
        await assertSelectionValues(page, 'havit-bootstrap', flavor, 'desktop');
        await selectComparison(page, flavor, 'mobile');
        await assertSelectionValues(page, 'havit-bootstrap', flavor, 'mobile');
        expect((await page.locator('.focus-card-summary').allTextContents()).slice(1)).toEqual(otherCards.slice(1));
        await expect(sidebar).toContainText('Startup: mobile; other metrics: desktop');
        await expect(page.locator('[data-metric="startup"] .focus-measurement')).toContainText('Mobile');
        await expect(page.locator('[data-metric="build"] .focus-measurement')).toContainText('Desktop');
    }
    expect(requests).toBe(originalRequests);
    await page.getByRole('button', { name: 'No average', exact: true }).click();
    await assertSelectionValues(page, 'havit-bootstrap', 'r2r-aot', 'mobile');
    expect(requests).toBe(originalRequests);
});

test('all apps retain honest availability in all six selector combinations', async ({ page }) => {
    await open(page, focusFixture(), null);
    for (const app of focusFixture().index.apps) {
        await page.locator('#focus-app').selectOption(app);
        for (const flavor of ['release-release', 'r2r-release', 'r2r-aot']) {
            for (const profile of ['desktop', 'mobile']) {
                await selectComparison(page, flavor, profile);
                await expect(page.locator('.focus-card')).toHaveCount(4);
                await expect(page.locator('.focus-error')).toHaveCount(0);
                await assertSelectionValues(page, app, flavor, profile);
                expect(await page.locator('.focus-percentage').evaluateAll(values =>
                    values.every(value => value.scrollWidth <= value.clientWidth))).toBeTruthy();
            }
        }
    }
});

test('older missing R2R rows stay gaps and rapid app/flavor/profile changes cannot restore stale choices', async ({ page }) => {
    await open(page, focusFixture(), null);
    await page.getByLabel('Actual measurements', { exact: true }).check();
    await page.getByLabel('Percentage curve', { exact: true }).check();
    const currentCharts = await charts(page);
    expect(currentCharts[0].values[0][0].y).toBeNull();
    expect(currentCharts[0].values[1][0].y).not.toBeNull();
    expect(currentCharts[0].values[2][0].y).toBeNull();
    await page.locator('#focus-app').selectOption('mud-blazor');
    await page.locator('#focus-flavor').selectOption('release-release');
    await page.locator('#focus-startup-profile').selectOption('desktop');
    await page.locator('#focus-app').selectOption('havit-bootstrap');
    await selectComparison(page, 'r2r-aot', 'mobile');
    await assertSelectionValues(page, 'havit-bootstrap', 'r2r-aot', 'mobile');
    await expect.poll(async () => (await charts(page)).length).toBe(4);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 1600, height: 900 }]) {
    test(`all four complete and partial cards fit ${viewport.width}x${viewport.height} at normal zoom`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page, focusFixture(), null);
        for (const app of ['havit-bootstrap', 'empty-blazor']) {
            await page.getByLabel('Application', { exact: true }).selectOption(app);
            await expect(page.locator('.focus-metrics')).toHaveAttribute('aria-busy', 'false');
            const bounds = await page.locator('.focus-card').evaluateAll(cards => cards.map(card => {
                const r = card.getBoundingClientRect();
                return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
            }));
            for (const rect of bounds) {
                expect(rect.top).toBeGreaterThanOrEqual(0);
                expect(rect.bottom).toBeLessThanOrEqual(viewport.height);
                expect(rect.left).toBeGreaterThanOrEqual(0);
                expect(rect.right).toBeLessThanOrEqual(viewport.width);
            }
            expect(await page.evaluate(() => window.scrollY)).toBe(0);
            await page.getByText('net11.0', { exact: true }).scrollIntoViewIfNeeded();
            await expect(page.getByText('net11.0', { exact: true })).toBeInViewport({ ratio: 1 });
            expect(await page.evaluate(() => window.scrollY)).toBe(0);
        }
    });
}

test('real Blazor deep-link preserves the explicit Release/desktop comparison and 5 avg captions', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page);
    await expect(page.getByRole('link', { name: 'NET12 focus', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('navigation', { name: 'Dashboard views' }).getByRole('link')).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Delta reports', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Application', { exact: true })).toHaveValue('havit-bootstrap');
    await expect(page.getByRole('button', { name: '14 days', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'No average', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Show min-max bands', { exact: true })).toBeChecked();
    await expect(page.locator('.focus-cohort')).toContainText('net11.0');
    await expect(page.locator('.focus-provenance')).toContainText('not a controlled same-runner result');
    await expect(page.locator('[data-metric="startup"] .focus-measurement')).toContainText('Time to managed (cold)');
    await expect(page.locator('[data-metric="startup"] .focus-measurement')).toContainText('Desktop');
    await expect(page.locator('[data-metric="startup"] .focus-measurement')).toHaveAttribute('title', /time-to-reach-managed-cold.*desktop\/Chromium.*no CPU or network throttling/);
    await expect(page.locator('.focus-card h2')).toHaveText(titles);
    await expect(page.locator('.focus-card-number')).toHaveCount(0);
    expect(await page.locator('.focus-card-summary').evaluateAll(summaries =>
        summaries.every(summary => !summary.textContent.includes('Latest CoreCLR vs Mono') && !summary.textContent.includes('Not averaged')))).toBeTruthy();
    await expect(page.locator('.focus-percentage')).toHaveText(['91.3%', '193.7%', '8.5%', '10.0%']);
    await expect(page.locator('.focus-rolling-caption')).toHaveText([
        '(64.2% slower · 5 avg)', '(155.6% slower · 5 avg)', '(8.5% larger · 5 avg)', '(11.6% slower · 5 avg)',
    ]);
    for (const card of await page.locator('.focus-card').all()) {
        const caption = card.locator('.focus-rolling-caption');
        await expect(caption).toHaveAttribute('aria-label', /5 of 5.*ending at SDK 12\.0\.100-alpha\.1\.26469\.103/);
        expect(await caption.evaluate(element => parseFloat(getComputedStyle(element).fontSize)))
            .toBeLessThan(await card.locator('.focus-percentage').evaluate(element => parseFloat(getComputedStyle(element).fontSize)));
    }
    await page.reload();
    await selectComparison(page);
    await expect(page.locator('.focus-percentage')).toHaveText(['91.3%', '193.7%', '8.5%', '10.0%']);
    expect(errors).toEqual([]);
});

test('ratio panels emphasize larger values and labels, with quieter axes and shared SDK details', async ({ page }) => {
    await open(page);
    await page.getByLabel('Actual measurements', { exact: true }).check();
    await page.getByLabel('Percentage curve', { exact: true }).check();
    const styles = await page.locator('.focus-card').evaluateAll(cards => cards.map(card => {
        const percentage = card.querySelector('.focus-percentage');
        return {
            percentageSize: parseFloat(getComputedStyle(percentage).fontSize),
            titleSize: parseFloat(getComputedStyle(card.querySelector('h2')).fontSize),
            verdictSize: parseFloat(getComputedStyle(card.querySelector('.focus-verdict')).fontSize),
            summaryWidth: card.querySelector('.focus-card-summary').getBoundingClientRect().width,
            cardWidth: card.getBoundingClientRect().width,
            graphWidth: card.querySelector('.focus-card-chart').getBoundingClientRect().width,
            clippedValue: percentage.scrollWidth > percentage.clientWidth,
        };
    }));
    for (const style of styles) {
        expect(style.percentageSize).toBeGreaterThanOrEqual(48);
        expect(style.titleSize).toBeGreaterThanOrEqual(15);
        expect(style.verdictSize).toBeGreaterThanOrEqual(16);
        expect(style.summaryWidth).toBeGreaterThanOrEqual(200);
        expect(style.graphWidth).toBeLessThan(style.cardWidth - 146);
        expect(style.clippedValue).toBeFalsy();
    }
    await expect(page.locator('.focus-latest-build')).toHaveCount(1);
    await expect(page.locator('.focus-latest-build')).toContainText('Latest SDK day 2026-09-19');
    await expect(page.locator('.focus-latest-build')).toContainText('1 day ago');
    await expect(page.locator('.focus-latest-build')).toContainText('12.0.100-alpha.1.26469.103');
    await expect(page.locator('.focus-card .focus-sdk')).toHaveCount(0);
    expect(await page.locator('.focus-card').evaluateAll(cards =>
        cards.every(card => !card.textContent.includes('Latest SDK day')))).toBeTruthy();
    const belowGrid = await page.locator('.focus-latest-builds').evaluate(element =>
        element.getBoundingClientRect().top >= document.querySelector('.focus-metrics').getBoundingClientRect().bottom);
    expect(belowGrid).toBeTruthy();
    const axisSizes = await page.evaluate(() => Object.values(Chart.instances).flatMap(chart =>
        ['x', 'y', 'comparison'].map(axis => chart.options.scales[axis].ticks.font.size)));
    expect(axisSizes).toHaveLength(12);
    expect(axisSizes.every(size => size === 8)).toBeTruthy();
});

test('three dual-axis ordinal series retain same-day builds and do not mutate summaries on graph toggles', async ({ page }) => {
    let dataRequests = 0;
    const origins = new Set();
    page.on('request', request => {
        if (request.url().includes('/data/views/')) {
            dataRequests++;
            origins.add(new URL(request.url()).origin);
        }
    });
    await open(page);
    await page.getByLabel('Actual measurements', { exact: true }).check();
    await page.getByLabel('Percentage curve', { exact: true }).check();
    await page.getByRole('button', { name: '5-point average', exact: true }).click();
    const initial = await charts(page);
    expect(initial).toHaveLength(4);
    expect([...origins]).toEqual([new URL(page.url()).origin]);
    for (const chart of initial) {
        expect(chart.labels).toEqual(['CoreCLR Release', 'Mono Release', 'CoreCLR vs Mono (%)']);
        expect(chart.axes).toEqual(['y', 'y', 'comparison']);
        expect(chart.spanGaps).toEqual([false, false, false]);
        expect(chart.values[0]).toHaveLength(23);
        expect(chart.xPixels.every((value, index, points) => index === 0 || value > points[index - 1])).toBeTruthy();
        expect(chart.percentMin).toBeLessThanOrEqual(0);
        expect(chart.percentMax).toBeGreaterThanOrEqual(0);
    }
    const summaries = await page.locator('.focus-card-summary').allTextContents();
    const requestsBefore = dataRequests;
    await page.getByRole('button', { name: 'No average', exact: true }).click();
    await expect(page.getByLabel('Show min-max bands')).toBeDisabled();
    await expect(page.getByLabel('Show min-max bands')).toBeChecked();
    await expect.poll(async () => (await charts(page))[0]?.values[0].at(-1).y).toBe(767);
    const raw = await charts(page);
    expect(raw[0].runtimeMax).toBe(initial[0].runtimeMax);
    expect(await page.locator('.focus-card-summary').allTextContents()).toEqual(summaries);
    await page.getByRole('button', { name: '5-point average', exact: true }).click();
    await expect(page.getByLabel('Show min-max bands')).toBeEnabled();
    await expect(page.getByLabel('Show min-max bands')).toBeChecked();
    await expect.poll(async () => (await charts(page))[0]?.values[0]).toEqual(initial[0].values[0]);
    await page.getByLabel('Show min-max bands').uncheck();
    expect(await page.locator('.focus-card-summary').allTextContents()).toEqual(summaries);
    expect(dataRequests).toBe(requestsBefore);
    await page.getByRole('button', { name: 'No average', exact: true }).click();
    await page.getByRole('button', { name: '5-point average', exact: true }).click();
    await expect(page.getByLabel('Show min-max bands')).not.toBeChecked();
});

test('all app selections keep four cards with truthful partial and unavailable explanations', async ({ page }) => {
    await open(page);
    await expect(page.locator('#focus-app option')).toHaveCount(10);
    const cases = [
        ['blazing-pizza', 4], ['mud-blazor', 4], ['igniteui-light', 4],
        ['blazor-perf', 3], ['empty-blazor', 3], ['empty-browser', 3],
        ['micro-benchmarks', 1], ['semi-avalonia', 0], ['uno-gallery', 0],
    ];
    for (const [app, available] of cases) {
        await page.getByLabel('Application', { exact: true }).selectOption(app);
        await expect(page.locator('.focus-metrics')).toHaveAttribute('aria-busy', 'false');
        await expect(page.locator('.focus-card')).toHaveCount(4);
        await expect(page.locator('.focus-kpi')).toHaveCount(available);
        await expect(page.locator('.focus-rolling-caption')).toHaveCount(available);
        await expect(page.locator('.focus-error')).toHaveCount(0);
        if (available < 4) await expect(page.locator('.focus-empty').first()).toContainText('Comparison unavailable');
        await expect(page.locator('.focus-latest-build')).toHaveCount(available ? 1 : 0);
        expect(await page.locator('.focus-percentage').evaluateAll(values =>
            values.every(value => value.scrollWidth <= value.clientWidth))).toBeTruthy();
    }
    await expect(page.locator('.focus-empty').first()).toContainText('no CoreCLR comparison');
});

test('real canvas bands fill at 0.2 with open boundaries and disappear independently of summaries', async ({ page }) => {
    await page.addInitScript(() => {
        const paths = new WeakMap();
        const prototype = CanvasRenderingContext2D.prototype;
        const original = Object.fromEntries(['beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke'].map(name => [name, prototype[name]]));
        globalThis.focusPaintEvidence = { fills: [], boundaries: [] };
        prototype.beginPath = function (...args) { paths.set(this, []); return original.beginPath.apply(this, args); };
        for (const name of ['moveTo', 'lineTo', 'closePath']) {
            prototype[name] = function (...args) { paths.get(this)?.push([name, ...args]); return original[name].apply(this, args); };
        }
        prototype.fill = function (...args) {
            if (this.canvas.id.startsWith('focus-') && Math.abs(this.globalAlpha - 0.2) < 1e-6) {
                globalThis.focusPaintEvidence.fills.push({ opacity: this.globalAlpha, color: this.fillStyle, path: paths.get(this) });
            }
            return original.fill.apply(this, args);
        };
        prototype.stroke = function (...args) {
            if (this.canvas.id.startsWith('focus-') && Math.abs(this.lineWidth - 0.8) < 1e-6) {
                globalThis.focusPaintEvidence.boundaries.push(paths.get(this));
            }
            return original.stroke.apply(this, args);
        };
    });
    await open(page);
    await page.getByLabel('Actual measurements', { exact: true }).check();
    await page.getByLabel('Percentage curve', { exact: true }).check();
    await page.getByRole('button', { name: '5-point average', exact: true }).click();
    const evidence = await page.evaluate(() => focusPaintEvidence);
    expect(evidence.fills.length).toBeGreaterThanOrEqual(12);
    expect(evidence.boundaries.length).toBeGreaterThanOrEqual(24);
    for (const fill of evidence.fills) {
        expect(fill.opacity).toBeCloseTo(0.2, 6);
        expect(fill.path.at(-1)[0]).toBe('closePath');
    }
    for (const boundary of evidence.boundaries) {
        expect(boundary.some(command => command[0] === 'closePath')).toBeFalsy();
        const xs = boundary.map(command => command[1]);
        expect(xs.every((x, i) => i === 0 || x > xs[i - 1])).toBeTruthy();
    }
    await page.evaluate(() => { focusPaintEvidence.fills = []; });
    await page.getByLabel('Show min-max bands').uncheck();
    expect(await page.evaluate(() => focusPaintEvidence.fills.length)).toBe(0);
    await page.getByLabel('Show min-max bands').check();
    await expect.poll(() => page.evaluate(() => focusPaintEvidence.fills.length)).toBeGreaterThanOrEqual(12);
    await page.evaluate(() => { focusPaintEvidence.fills = []; });
    await page.getByRole('button', { name: 'No average', exact: true }).click();
    expect(await page.evaluate(() => focusPaintEvidence.fills.length)).toBe(0);
    await expect(page.locator('.focus-rolling-caption')).toHaveCount(4);
});

test('all calendar ranges retain overlap values and expose short history, not empty time slots', async ({ page }) => {
    await open(page);
    const original = await charts(page);
    for (const label of ['1 month', '3 months', '6 months', '12 months', '14 days']) {
        await page.getByRole('button', { name: label, exact: true }).click();
        await expect(page.locator('.focus-metrics')).toHaveAttribute('aria-busy', 'false');
        await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(async () => (await charts(page))[0]?.values).toEqual(original[0].values);
        await expect(page.locator('.focus-percentage').first()).toHaveText('91.3%');
    }
    await expect(page.locator('.focus-coverage')).toContainText('2026-09-09 to 2026-09-19');
});

test('short rolling counts and independent colors end at the latest valid SDK', async ({ page }) => {
    const fixture = focusFixture();
    const rows = fixture.buckets[1].appMetrics['havit-bootstrap']['time-to-reach-managed-cold'];
    for (let i = 10; i <= 14; i++) {
        rows['mono/no-workload/desktop/chrome'][i] = 100;
        rows['coreclr/no-workload/desktop/chrome'][i] = i === 14 ? 112 : 50;
    }
    await open(page, fixture);
    const startup = page.locator('[data-metric="startup"]');
    await expect(startup.locator('.focus-kpi')).toHaveClass(/worse/);
    await expect(startup.locator('.focus-rolling-caption .better')).toHaveText('37.6% faster');
    await expect(startup.locator('.focus-percentage')).toHaveText('12.0%');
});

test('gaps reset each window, older complete pairs are labeled and no caption is fabricated', async ({ page }) => {
    const fixture = focusFixture();
    const metrics = fixture.buckets[1].appMetrics['havit-bootstrap'];
    metrics['time-to-reach-managed-cold']['coreclr/no-workload/desktop/chrome'][12] = null;
    metrics['havit-walkthrough']['coreclr/no-workload/desktop/chrome'][14] = null;
    for (const bucket of fixture.buckets) bucket.appMetrics['havit-bootstrap']['compile-time']['mono/no-workload/desktop/chrome'].fill(0);
    await open(page, fixture);
    await page.getByLabel('Actual measurements', { exact: true }).check();
    await page.getByLabel('Percentage curve', { exact: true }).check();
    await expect(page.locator('[data-metric="startup"] .focus-rolling-caption')).toHaveAttribute('aria-label', /2 of 5/);
    await expect(page.locator('[data-metric="walkthrough"] .focus-older-pair')).toContainText('newer result incomplete');
    await expect(page.locator('[data-metric="build"] .focus-rolling-caption')).toHaveCount(0);
    await expect(page.locator('[data-metric="build"]')).toHaveAttribute('data-status', 'invalid-value');
    const chart = (await charts(page))[0];
    expect(chart.values[0].at(-3).y).toBeNull();
    expect(chart.values[2].at(-3).y).toBeNull();
    expect(chart.values[1].at(-3).y).not.toBeNull();
    const sharedBuild = page.locator('.focus-latest-build').filter({ hasText: 'Cold startup, Cold download size:' });
    const olderBuild = page.locator('.focus-latest-build').filter({ hasText: 'Walkthrough:' });
    await expect(page.locator('.focus-latest-build')).toHaveCount(2);
    await expect(sharedBuild).toHaveAttribute('data-sdk', fixture.buckets[1].header.columns[14].sdkVersion);
    await expect(olderBuild).toHaveAttribute('data-sdk', fixture.buckets[1].header.columns[13].sdkVersion);
    await expect(page.locator('.focus-latest-builds')).not.toContainText('Build time');
});

test('cards have no inspection controls while hover tooltips retain measurement details', async ({ page }) => {
    await open(page);
    await page.getByLabel('Actual measurements', { exact: true }).check();
    await page.getByLabel('Percentage curve', { exact: true }).check();
    await page.getByRole('button', { name: '5-point average', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Inspect \d+ pairs$/ })).toHaveCount(0);
    await expect(page.locator('#focus-inspection')).toHaveCount(0);
    const canvas = page.locator('[data-metric="startup"] canvas');
    const position = await canvas.evaluate(element => {
        const point = Chart.getChart(element).getDatasetMeta(2).data.at(-1);
        return { x: point.x, y: point.y };
    });
    await canvas.hover({ position });
    await expect.poll(() => canvas.evaluate(element => Chart.getChart(element).tooltip.opacity)).toBe(1);
    const tooltip = await canvas.evaluate(element => {
        const tooltip = Chart.getChart(element).tooltip;
        return [...tooltip.title, ...tooltip.body.flatMap(item => item.lines), ...tooltip.footer].join('\n');
    });
    expect(tooltip).toContain('12.0.100-alpha.1.26469.103');
    expect(tooltip).toContain('SDK day 2026-09-19');
    expect(tooltip).toContain('CoreCLR Release raw: 767 ms');
    expect(tooltip).toContain('Mono Release raw: 401 ms');
    expect(tooltip).toContain('5 of 5 observations');
    expect(tooltip).not.toContain('Inspect');
});

for (const status of [404, 500]) {
    test(`HTTP ${status} becomes an explicit retryable error, then recovers`, async ({ page }) => {
        await page.clock.setFixedTime(FOCUS_FIXTURE_TIME);
        await routeFocusFixture(page);
        let fail = true;
        await page.route('**/havit-bootstrap_compile-time.json', route => fail
            ? route.fulfill({ status, body: 'intentional test failure' }) : route.fallback());
        await page.goto(path);
        await expect(page.getByRole('alert')).toContainText(`HTTP ${status}`);
        await expect(page.locator('.focus-card[data-status="error"]')).toHaveCount(4);
        fail = false;
        await page.getByRole('button', { name: 'Retry', exact: true }).click();
        await expect(page.locator('.focus-percentage').first()).toHaveText('119.3%');
        await expect(page.getByRole('alert')).toHaveCount(0);
    });
}

test('rapid app changes do not leave stale charts or errors', async ({ page }) => {
    await open(page);
    await page.getByLabel('Application', { exact: true }).selectOption('blazing-pizza');
    await page.getByLabel('Application', { exact: true }).selectOption('empty-blazor');
    await page.getByLabel('Application', { exact: true }).selectOption('havit-bootstrap');
    await expect(page.locator('.focus-percentage')).toHaveText(['91.3%', '193.7%', '8.5%', '10.0%']);
    await expect.poll(async () => (await charts(page)).length).toBe(4);
    await expect(page.getByRole('alert')).toHaveCount(0);
});

test('navigation during a delayed selection aborts focus work without disturbing Home', async ({ page }) => {
    await open(page);
    let release;
    let blocked = 0;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/blazing-pizza_*.json', async route => {
        blocked++;
        await gate;
        await route.fallback();
    });
    await page.getByLabel('Application', { exact: true }).selectOption('blazing-pizza');
    await expect.poll(() => blocked).toBeGreaterThan(0);
    await page.getByRole('link', { name: 'All benchmarks', exact: true }).click();
    await expect(page.locator('.nav-tabs .nav-link.active')).toHaveText('Blazing Pizza');
    release();
    await expect.poll(() => page.evaluate(() => Object.keys(Chart.instances).length)).toBeGreaterThan(0);
    expect(await charts(page)).toHaveLength(0);
    await expect(page.locator('#blazor-error-ui')).toBeHidden();
});

test('mobile and enlarged text stack without horizontal overflow; controls remain keyboard accessible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByLabel('Application', { exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#focus-flavor')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#focus-startup-profile')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: '14 days', exact: true })).toBeFocused();
    await page.locator('.net12-focus').evaluate(element => { element.style.zoom = '1.5'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(page.getByRole('button', { name: '12 months', exact: true })).toBeEnabled();
});

test('focus navigation disposes its charts and Home/Delta keep their behavior', async ({ page }) => {
    await open(page);
    await page.getByRole('link', { name: 'All benchmarks', exact: true }).click();
    await expect(page.locator('.nav-tabs .nav-link.active')).toHaveText('Blazing Pizza');
    await expect.poll(() => page.evaluate(() => Object.keys(Chart.instances).length)).toBeGreaterThan(0);
    expect(await charts(page)).toHaveLength(0);
    await page.getByRole('link', { name: 'NET12 focus', exact: true }).click();
    await expect(page.locator('.focus-percentage').first()).toHaveText('119.3%');
    const all = await page.evaluate(() => Object.values(Chart.instances).map(chart => chart.canvas.id));
    expect(all).toHaveLength(4);
    expect(all.every(id => id.startsWith('focus-'))).toBeTruthy();
    await expect(page.getByRole('link', { name: 'Delta reports', exact: true })).toHaveCount(0);
    await page.goto('/macro-benchmarks/delta');
    await expect(page.getByText('Current Build', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Current Build', { exact: true })).toBeVisible();
    await expect(page.locator('#blazor-error-ui')).toBeHidden();
});

test('Home and Focus keep one shared brand/navigation at the top of the left pane across route switches', async ({ page }) => {
    const dataOrigins = new Set();
    page.on('request', request => {
        if (request.url().includes('/data/views/')) dataOrigins.add(new URL(request.url()).origin);
    });
    await page.clock.setFixedTime(FOCUS_FIXTURE_TIME);
    await routeFocusFixture(page);
    await page.goto('/macro-benchmarks/');
    for (let visit = 0; visit < 2; visit++) {
        await expect(page.locator('.nav-tabs .nav-link.active')).toHaveText('Blazing Pizza');
        const sidebar = page.getByRole('complementary', { name: 'Benchmark filters' });
        await expect(page.locator('.dashboard-sidebar-heading')).toHaveCount(1);
        await expect(sidebar.getByRole('link', { name: 'All benchmarks', exact: true })).toHaveAttribute('aria-current', 'page');
        await expect(sidebar.getByRole('link', { name: /WASM benchmarks/ })).toHaveAttribute('href', './');
        await expect(page.locator('.main-content .dashboard-mode-tabs')).toHaveCount(0);
        await expect(page.locator('.main-content .dashboard-brand')).toHaveCount(0);
        await expect(sidebar.locator('#filter-profiles-mobile')).toBeChecked();
        await expect(sidebar.locator('#filter-profiles-desktop')).not.toBeChecked();
        await expect(sidebar.locator('#filter-presets-no-workload')).toBeChecked();
        await expect(sidebar.locator('#filter-engines-chrome')).toBeChecked();
        await expect(sidebar.locator('.sidebar-updated a')).toContainText('Updated');
        await expect(sidebar.getByTitle('GitHub Repository')).toHaveAttribute('href', /github\.com/);
        expect(await sidebar.evaluate(element => {
            const side = element.getBoundingClientRect();
            const brand = element.querySelector('.dashboard-brand').getBoundingClientRect();
            const nav = element.querySelector('.dashboard-mode-tabs').getBoundingClientRect();
            const filters = element.querySelector('.sidebar-body').getBoundingClientRect();
            return nav.top >= brand.bottom && nav.bottom <= filters.top && nav.left >= side.left && nav.right <= side.right;
        })).toBeTruthy();
        await page.locator('.nav-tabs .nav-link', { hasText: 'Havit Bootstrap' }).click();
        await expect(page.locator('.nav-tabs .nav-link.active')).toHaveText('Havit Bootstrap');
        await expect(sidebar.locator('#filter-profiles-mobile')).toBeChecked();
        await sidebar.getByRole('link', { name: 'NET12 focus', exact: true }).click();
        await expect(page.locator('#focus-flavor')).toHaveValue('r2r-release');
        const focusSide = page.getByRole('complementary', { name: 'NET12 focus settings' });
        await expect(focusSide.getByRole('link', { name: 'NET12 focus', exact: true })).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('.focus-main .dashboard-mode-tabs')).toHaveCount(0);
        await expect(page.locator('.focus-header')).toHaveCount(0);
        await expect(page.getByRole('navigation', { name: 'Dashboard views' })).toHaveCount(1);
        await expect(page.getByRole('link', { name: 'Delta reports', exact: true })).toHaveCount(0);
        await focusSide.getByRole('link', { name: /WASM benchmarks/ }).click();
    }
    expect([...dataOrigins]).toEqual([new URL(page.url()).origin]);
});

test('Home retains usable left navigation during data loading and failure', async ({ page }) => {
    await page.clock.setFixedTime(FOCUS_FIXTURE_TIME);
    await routeFocusFixture(page);
    let release;
    let failHome = true;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/data/views/index.json', async route => {
        if (!failHome) return route.fallback();
        await gate;
        await route.fulfill({ status: 500, body: 'intentional Home loading failure' });
    });
    await page.goto('/macro-benchmarks/', { waitUntil: 'domcontentloaded' });
    const sidebar = page.getByRole('complementary', { name: 'Benchmark filters' });
    await expect(sidebar.getByRole('link', { name: 'NET12 focus', exact: true })).toBeVisible();
    await expect(page.locator('.main-content .dashboard-mode-tabs')).toHaveCount(0);
    release();
    await expect(page.locator('.main-content .alert-warning')).toContainText('Failed to load dashboard');
    failHome = false;
    await sidebar.getByRole('link', { name: 'NET12 focus', exact: true }).click();
    await expect(page.locator('.focus-kpi')).toHaveCount(4);
    await expect(page.locator('.focus-error')).toHaveCount(0);
});

test('a chart failure is reported once and graph controls wait for explicit retry', async ({ page }) => {
    await page.clock.setFixedTime(FOCUS_FIXTURE_TIME);
    await routeFocusFixture(page);
    await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        let failOnce = true;
        HTMLCanvasElement.prototype.getContext = function (...args) {
            if (failOnce && this.id.startsWith('focus-') && this.id.endsWith('-walkthrough') && args[0] === '2d') {
                failOnce = false;
                return null;
            }
            return getContext.apply(this, args);
        };
    });
    const errors = [];
    page.on('console', message => {
        if (message.type() === 'error' && message.text().includes('NET12 focus:')) errors.push(message.text());
    });
    let dataRequests = 0;
    page.on('request', request => { if (request.url().includes('/data/views/')) dataRequests++; });
    await page.goto(path);
    await expect(page.getByRole('alert')).toContainText('A canvas context is unavailable');
    expect(await page.evaluate(() => Object.values(Chart.instances).filter(chart => chart.canvas.id.startsWith('focus-')).length)).toBe(0);
    const requestsBefore = dataRequests;
    await page.getByRole('button', { name: '5-point average', exact: true }).click();
    await page.getByLabel('Show min-max bands').uncheck();
    await page.getByLabel('Percentage curve', { exact: true }).check();
    await page.getByLabel('Actual measurements', { exact: true }).uncheck();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.getByRole('alert')).toContainText('A canvas context is unavailable');
    expect(errors).toHaveLength(1);
    expect(dataRequests).toBe(requestsBefore);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect.poll(async () => (await charts(page)).length).toBe(4);
    await expect(page.getByLabel('Percentage curve', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Actual measurements', { exact: true })).not.toBeChecked();
});
