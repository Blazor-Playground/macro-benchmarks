import { expect, test } from 'playwright/test';
import { focusFixture, FOCUS_FIXTURE_TIME, routeFocusFixture } from '../helpers/focus-fixture.mjs';

const base = '/macro-benchmarks/';

async function emulatePages(page, request) {
    await page.clock.setFixedTime(FOCUS_FIXTURE_TIME);
    await routeFocusFixture(page);
    const fallback = await request.get(`${base}404.html`);
    expect(fallback.status()).toBe(200);
    const html = await fallback.text();
    const documents = [];
    await page.route('**/*', route => {
        const request = route.request();
        if (!request.isNavigationRequest() || request.resourceType() !== 'document') return route.fallback();
        const url = new URL(request.url());
        documents.push({ path: url.pathname, search: url.search });
        if (!url.pathname.startsWith(base)) {
            return route.fulfill({ status: 404, body: 'Navigation escaped the dashboard base path.' });
        }
        if (url.pathname !== base && url.pathname !== `${base}index.html`) {
            return route.fulfill({ status: 404, contentType: 'text/html', body: html });
        }
        return route.fallback();
    });
    return documents;
}

test('direct Focus links recover from the published 404 and remain usable on reload', async ({ page, request }) => {
    const documents = await emulatePages(page, request);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const path = `${base}net12-focus?value=a%2Bb%26c&value=%252F#focus-methodology`;
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${base}net12-focus\\?value=a%2Bb%26c&value=%252F#focus-methodology$`));
    await expect(page.locator('.focus-kpi')).toHaveCount(4);
    await expect(page.locator('.focus-error')).toHaveCount(0);
    expect(documents[0].path).toBe(`${base}net12-focus`);
    const recovery = documents.find(document => document.path === base);
    expect(new URLSearchParams(recovery.search).get('redirect')).toBe(path);
    await page.reload();
    await expect(page.locator('.focus-kpi')).toHaveCount(4);
    await expect(page).toHaveURL(new RegExp(`${base}net12-focus\\?value=a%2Bb%26c&value=%252F#focus-methodology$`));
    expect(documents.filter(document => document.path === base)).toHaveLength(2);
    expect(documents.every(document => document.path.startsWith(base))).toBeTruthy();
    expect(errors).toEqual([]);
    await expect(page.locator('#blazor-error-ui')).toBeHidden();
});

test('direct Delta links preserve the SDK query parameter', async ({ page, request }) => {
    const documents = await emulatePages(page, request);
    const sdk = focusFixture().delta.index.deltas[0].sdkVersion;
    const path = `${base}delta?sdk=${encodeURIComponent(sdk)}`;
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${base}delta\\?sdk=`));
    expect(new URL(page.url()).searchParams.get('sdk')).toBe(sdk);
    await expect(page.getByText('Current Build', { exact: true })).toBeVisible();
    expect(documents.map(document => document.path)).toEqual([`${base}delta`, base]);
    await expect(page.locator('#blazor-error-ui')).toBeHidden();
});

test('Pages recovery does not add a root-redirect entry to browser history', async ({ page, request }) => {
    await emulatePages(page, request);
    await page.goto(`${base}#before-focus`);
    await expect(page.locator('.nav-tabs .nav-link.active')).toHaveText('Blazing Pizza');
    await page.goto(`${base}net12-focus`);
    await expect(page.locator('.focus-kpi')).toHaveCount(4);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${base}#before-focus$`));
    await expect(page.locator('.nav-tabs .nav-link.active')).toHaveText('Blazing Pizza');
});

test('unknown app routes return to the project dashboard, not the origin root', async ({ page, request }) => {
    const documents = await emulatePages(page, request);
    await page.goto(`${base}unknown-route`);
    await expect(page).toHaveURL(new RegExp(`${base}$`));
    await expect(page.locator('.nav-tabs .nav-link.active')).toHaveText('Blazing Pizza');
    expect(documents.every(document => document.path.startsWith(base))).toBeTruthy();
    await expect(page.locator('#blazor-error-ui')).toBeHidden();
});

test('an outside-project redirect parameter cannot navigate away or prevent startup', async ({ page, request }) => {
    const documents = await emulatePages(page, request);
    const warnings = [];
    page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
    await page.goto(`${base}?redirect=${encodeURIComponent('https://example.org/')}`);
    await expect(page.locator('.nav-tabs .nav-link.active')).toHaveText('Blazing Pizza');
    expect(new URL(page.url()).pathname).toBe(base);
    expect(documents.map(document => document.path)).toEqual([base]);
    expect(warnings.some(message => message.includes('Ignoring a GitHub Pages redirect'))).toBeTruthy();
    await expect(page.locator('#blazor-error-ui')).toBeHidden();
});
