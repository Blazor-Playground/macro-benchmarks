import { test, expect } from 'playwright/test';
import { DebugProbe } from '../../bench/src/lib/debug-probe.ts';
import { hotReloadFailure } from '../../bench/src/lib/debug-results.ts';

test('real browser observer joins handler ordering and detects document reloads', async ({ page }) => {
    const probe = new DebugProbe();
    await probe.install(page, 'empty-blazor');
    await page.route('**/debug-probe-fixture', route => route.fulfill({ contentType: 'text/html',
        body: '<div id="app"><h1>Fixture</h1></div><aside id="debug-benchmark-probe" data-version="before-0001"></aside>' }));
    await page.goto('/debug-probe-fixture');
    await page.evaluate(() => globalThis.debugBenchmark.rendered('before-0001', 'runtime', 0, 1, false, true, 'mono'));
    const before = probe.events.at(-1).evidence;
    const navigations = probe.navigations, resets = probe.contextResets;
    await page.evaluate(async () => {
        document.getElementById('debug-benchmark-probe').dataset.version = 'after--0001';
        const rendered = globalThis.debugBenchmark.rendered('after--0001', 'runtime', 0, 1, false, true, 'mono');
        globalThis.debugBenchmark.applied(1);
        await rendered;
    });
    const after = probe.events.at(-1).evidence;
    expect(after.generation).toBe(1);
    expect(probe.deltas).toHaveLength(1);
    expect(hotReloadFailure(before, after, probe.navigations - navigations, probe.contextResets - resets, [1], [1])).toBeNull();
    await page.reload();
    await page.evaluate(() => globalThis.debugBenchmark.rendered('before-0001', 'runtime', 0, 1, false, true, 'mono'));
    expect(hotReloadFailure(before, probe.events.at(-1).evidence, probe.navigations - navigations, probe.contextResets - resets, [1], [1]))
        .toBe('unexpected-reload');
});
