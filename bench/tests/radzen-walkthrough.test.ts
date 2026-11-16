import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { startStaticServer } from '../src/lib/measure-utils.js';
import { runRadzenWalkthrough } from '../src/lib/radzen-walkthrough.js';

test('Radzen renders every included gallery page without external services or browser errors', {
    skip: !process.env.RADZEN_WWWROOT,
    timeout: 600_000,
}, async t => {
    const { chromium } = await import('playwright');
    const server = await startStaticServer(resolve(process.env.RADZEN_WWWROOT!));
    t.after(() => server.close());
    const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome', headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const url = `http://127.0.0.1:${server.port}/`;
    const external: string[] = [];
    const errors: string[] = [];
    const visited: string[] = [];
    t.after(() => {
        if (errors.length) t.diagnostic(errors.slice(0, 20).join('\n'));
        if (external.length) t.diagnostic(`External requests: ${external.join(', ')}`);
        if (visited.length) t.diagnostic(`Last route: ${visited.at(-1)}`);
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
        const route = message.text().match(/^\[radzen-walkthrough\] navigating to \/(.*)$/);
        if (route) visited.push(route[1]);
    });
    page.on('response', response => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.route('**/*', async route => {
        if (new URL(route.request().url()).origin !== new URL(url).origin) {
            external.push(route.request().url());
            await route.abort();
        } else {
            await route.continue();
        }
    });

    const duration = await runRadzenWalkthrough({ page, url, timeout: 60_000, verbose: true });
    const expected = await page.locator('[data-benchmark-route]').evaluateAll(links =>
        links.map(link => link.getAttribute('data-benchmark-route')));
    assert(expected.length >= 250, `Expected a broad gallery, got ${expected.length} pages`);
    assert.deepEqual(visited, expected);
    assert(duration > 0 && Number.isFinite(duration));
    assert.equal(await page.locator('#page-content').getAttribute('data-benchmark-rendered'), '/');

    await page.locator('[data-benchmark-route="datagrid"]').click();
    await page.waitForFunction(() =>
        document.querySelector<HTMLElement>('#page-content')?.dataset.benchmarkRendered === '/datagrid');
    const grid = page.locator('#page-content .rz-data-grid').first();
    await grid.getByText('Nancy', { exact: true }).waitFor();
    await grid.getByText('First Name', { exact: true }).click();
    await grid.locator('.rz-grid-table > tbody[role="rowgroup"] > tr').first()
        .getByText('Andrew', { exact: true }).waitFor();
    assert.deepEqual(external, [], 'Gallery requested external resources');
    assert.deepEqual(errors, [], 'Gallery emitted browser errors');
    t.diagnostic(`Rendered ${visited.length} pages in ${Math.round(duration)} ms`);
});
