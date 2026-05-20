import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();

// === Simulate the WARM-LOAD page that stays open (like the bench does) ===
console.log('=== Creating warm-load page (stays open) ===');
const warmPage = await context.newPage();
await warmPage.goto('http://127.0.0.1:19999/', { waitUntil: 'load' });
await warmPage.waitForFunction(() => !!(globalThis as any).bench_complete, null, { timeout: 30000 });
console.log('   Warm page loaded, WASM running, keeping it open...');

// === Now create a walkthrough page (like the bench does) ===
console.log('\n=== Creating walkthrough page ===');
const wtPage = await context.newPage();
const consoleMessages: string[] = [];
wtPage.on('console', m => consoleMessages.push(`[${m.type()}] ${m.text()}`));
wtPage.on('pageerror', e => console.log('PAGE_ERR:', e.message));

console.log('1. Navigating to / (home page)...');
await wtPage.goto('http://127.0.0.1:19999/', { waitUntil: 'load' });
await wtPage.waitForFunction(() => !!(globalThis as any).bench_complete, null, { timeout: 30000 });
console.log('   bench_complete found');

console.log('2. page.goto(/weather)...');
const startTime = Date.now();
await wtPage.goto('http://127.0.0.1:19999/weather', { timeout: 30000, waitUntil: 'load' });
console.log('   goto resolved in', Date.now() - startTime, 'ms');

const hasSelector = await wtPage.$('[data-testid="weather-scroll-container"]');
console.log('3. selector found:', !!hasSelector);

console.log('4. Waiting for globalThis.benchJsToCsNumber (up to 15s)...');
try {
    await wtPage.waitForFunction(
        `typeof globalThis['benchJsToCsNumber'] === 'function'`,
        null,
        { timeout: 15000 },
    );
    console.log('   FOUND!');
} catch (e: any) {
    console.log('   TIMEOUT after 15s!');
    const hasFn = await wtPage.evaluate(() => typeof (globalThis as any).benchJsToCsNumber);
    const hasDotNet = await wtPage.evaluate(() => typeof (globalThis as any).DotNet);
    const hasBlazor = await wtPage.evaluate(() => typeof (globalThis as any).Blazor);
    console.log('   benchJsToCsNumber:', hasFn);
    console.log('   DotNet:', hasDotNet);
    console.log('   Blazor:', hasBlazor);
}

console.log('\nConsole messages:');
for (const m of consoleMessages) {
    console.log(' ', m);
}

await warmPage.close();
await browser.close();
