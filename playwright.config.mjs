import { defineConfig } from 'playwright/test';
import { resolve } from 'node:path';

const preview = process.env.NET12_PREVIEW_URL || undefined;
export default defineConfig({
    testDir: 'tests/e2e',
    testMatch: '**/*.spec.mjs',
    workers: 1,
    timeout: 45_000,
    globalTimeout: 240_000,
    expect: { timeout: 15_000 },
    use: {
        baseURL: preview ?? 'http://127.0.0.1:5147',
        channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
        viewport: { width: 1280, height: 800 },
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    webServer: preview ? undefined : {
        command: 'npm run build:viewer && node tests/helpers/check-viewer-publish.mjs && node --experimental-strip-types tests/helpers/serve-viewer.mjs',
        env: { PORT: '5147', VIEWER_WWWROOT: resolve('artifacts/bench-viewer/wwwroot'), VIEWER_DATA_URL: '' },
        url: 'http://127.0.0.1:5147/macro-benchmarks/',
        timeout: 120_000,
        reuseExistingServer: false,
    },
});
