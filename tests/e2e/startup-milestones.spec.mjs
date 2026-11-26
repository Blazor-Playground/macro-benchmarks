import { readFile } from 'node:fs/promises';
import { expect, test } from 'playwright/test';
import { collectStartup, measureFirstInteraction } from '../../bench/src/lib/startup.ts';

test('managed initialization and placeholder paint do not satisfy the first-render gate', async ({ page }) => {
    const origin = 'http://benchmark-startup.test';
    const helper = await readFile(new URL('../../src/startup-metrics.mjs', import.meta.url), 'utf8');
    await page.route(`${origin}/startup-metrics.mjs`, route => route.fulfill({
        contentType: 'text/javascript', body: helper,
    }));
    await page.route(`${origin}/`, route => route.fulfill({
        contentType: 'text/html',
        body: `<div id="app">Loading</div>
            <script type="module">
                import { observeInitialContent } from './startup-metrics.mjs';
                globalThis.js_loaded = performance.now();
                observeInitialContent('#app h1');
                globalThis.dotnet_managed_ready = performance.now();
                globalThis.bench_complete = true;
            </script>`,
    }));
    await page.goto(`${origin}/`);
    await page.waitForFunction(() => globalThis.bench_complete === true);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => globalThis.bench_first_render)).toBeUndefined();

    await page.evaluate(() => {
        document.querySelector('#app').innerHTML = '<h1>Initial app content</h1>';
    });
    const { jsStart, contentReady, firstRender } = await collectStartup(page, 5_000);
    const managed = await page.evaluate(() => globalThis.dotnet_managed_ready);
    expect(contentReady).toBeGreaterThan(managed);
    expect(firstRender).toBeGreaterThan(contentReady);
    expect(firstRender - jsStart).toBeLessThan(firstRender);
});

test('first interaction waits for the response, not for click dispatch', async ({ page }) => {
    const origin = 'http://benchmark-interaction.test';
    const helper = await readFile(new URL('../../src/startup-metrics.mjs', import.meta.url), 'utf8');
    await page.route(`${origin}/startup-metrics.mjs`, route => route.fulfill({
        contentType: 'text/javascript', body: helper,
    }));
    await page.route(`${origin}/`, route => route.fulfill({
        contentType: 'text/html',
        body: `<button id="open">Open</button>
            <script type="module">
                import { observeInitialContent, registerDomFirstInteraction } from './startup-metrics.mjs';
                globalThis.js_loaded = performance.now();
                observeInitialContent('#open');
                registerDomFirstInteraction('#open', '#detail');
                document.querySelector('#open').onclick = () => setTimeout(() => {
                    document.body.insertAdjacentHTML('beforeend', '<h1 id="detail">Detail</h1>');
                }, 75);
            </script>`,
    }));
    await page.goto(`${origin}/`);
    await collectStartup(page, 5_000);
    expect(await measureFirstInteraction(page, 5_000)).toBeGreaterThanOrEqual(75);
    await expect(page.locator('#detail')).toBeVisible();
    await expect(measureFirstInteraction(page, 5_000)).rejects.toThrow('response already exists');
});
