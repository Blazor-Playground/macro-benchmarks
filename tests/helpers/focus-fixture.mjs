import { readFileSync } from 'node:fs';

export const FOCUS_FIXTURE_TIME = new Date('2026-09-20T12:00:00Z');

export function focusFixture() {
    return JSON.parse(readFileSync(new URL('../fixtures/net12-focus.json', import.meta.url), 'utf8'));
}

export function fixtureResources(fixture = focusFixture()) {
    const resources = new Map([['index.json', fixture.index]]);
    for (const bucket of fixture.buckets) {
        resources.set(`${bucket.path}/header.json`, bucket.header);
        for (const [app, metrics] of Object.entries(bucket.appMetrics)) {
            for (const [key, rows] of Object.entries(metrics)) {
                resources.set(`${bucket.path}/${app}_${key}.json`, rows);
            }
        }
    }
    if (fixture.delta) {
        resources.set('delta/index.json', fixture.delta.index);
        resources.set(`delta/${fixture.delta.file}`, fixture.delta.report);
    }
    return resources;
}

export function publicationFor(app, fixture = focusFixture()) {
    return {
        index: fixture.index,
        buckets: fixture.buckets.map(bucket => ({
            path: bucket.path,
            header: bucket.header,
            metrics: bucket.appMetrics[app],
        })),
    };
}

export function expectedComparison(app, flavor, startupProfile, fixture = focusFixture()) {
    const presets = {
        'release-release': ['no-workload', 'no-workload'],
        'r2r-release': ['aot', 'no-workload'],
        'r2r-aot': ['aot', 'aot'],
    }[flavor];
    if (!presets) throw new Error(`Unknown fixture flavor ${flavor}`);
    const walkthrough = {
        'havit-bootstrap': 'havit-walkthrough', 'blazing-pizza': 'pizza-walkthrough',
        'mud-blazor': 'mud-walkthrough', 'igniteui-light': 'igniteui-walkthrough',
        'semi-avalonia': 'semi-walkthrough', 'uno-gallery': 'uno-walkthrough',
    }[app];
    const observations = fixture.buckets.flatMap(bucket => bucket.header.columns.map((column, index) => ({ bucket, column, index })))
        .filter(({ column }) => column.major === 12 && column.channel === '12.0' && !column.isRuntimeCustomBuild && !column.isAspnetCoreCustomBuild)
        .sort((a, b) => a.column.releaseDate.localeCompare(b.column.releaseDate)
            || a.column.sdkVersion.localeCompare(b.column.sdkVersion, 'en', { numeric: true })
            || a.column.vmrGitHash.localeCompare(b.column.vmrGitHash));
    // Boundary tests use literal expectations instead of this frozen-fixture calculation.
    const identities = new Set();
    for (const { column } of observations) {
        const identity = `${column.releaseDate}/${column.sdkVersion}`;
        if (identities.has(identity) || column.releaseDate < '2026-09-07' || column.releaseDate > '2026-09-20') {
            throw new Error('This fixture oracle requires unique day/SDK pairs inside the frozen 14-day window.');
        }
        identities.add(identity);
    }
    return ['time-to-reach-managed-cold', walkthrough, 'download-size-cold', 'compile-time'].map((key, metricIndex) => {
        const profile = metricIndex === 0 ? startupProfile : 'desktop';
        const coreclrRow = `coreclr/${presets[0]}/${profile}/chrome`;
        const monoRow = `mono/${presets[1]}/${profile}/chrome`;
        const window = [];
        const points = observations.map(({ bucket, column, index }) => {
            const rows = bucket.appMetrics[app]?.[key] ?? {};
            const coreclr = rows[coreclrRow]?.[index] ?? null;
            const mono = rows[monoRow]?.[index] ?? null;
            const percent = Number.isFinite(coreclr) && coreclr > 0 && Number.isFinite(mono) && mono > 0
                ? 100 * (coreclr / mono - 1) : null;
            if (percent === null) window.length = 0;
            else {
                window.push(percent);
                if (window.length > 5) window.shift();
            }
            return {
                sdk: column.sdkVersion, vmr: column.vmrGitHash, bucket: bucket.path, columnIndex: index,
                mono, coreclr, percent, count: window.length,
                average: window.length ? window.reduce((a, b) => a + b, 0) / window.length : null,
            };
        });
        return { key, profile, coreclrRow, monoRow, points, latest: points.filter(point => point.percent !== null).at(-1) ?? null };
    });
}

export async function routeFocusFixture(page, fixture = focusFixture()) {
    const resources = fixtureResources(fixture);
    await page.route('**/data/views/**', route => {
        const key = new URL(route.request().url()).pathname.split('/data/views/')[1];
        if (!resources.has(key)) return route.fulfill({ status: 404, body: `Fixture has no ${key}` });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resources.get(key)) });
    });
}
