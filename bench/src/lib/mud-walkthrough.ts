/**
 * mud-walkthrough.ts — Playwright walkthrough for MudBlazor documentation app.
 *
 * Measures total wall-clock time from fresh navigation to completion.
 *
 * Steps: load home → visit every component page → navigate home.
 */

import { debug } from '../log.js';

// Minimal Playwright Page type surface used by the walkthrough
type PlaywrightPage = {
    goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<unknown>;
    waitForSelector(selector: string, options?: { timeout?: number; state?: string }): Promise<unknown>;
    waitForFunction(fn: (() => boolean) | string, arg: unknown, options?: { timeout?: number }): Promise<unknown>;
    waitForURL(url: string | RegExp, options?: { timeout?: number }): Promise<unknown>;
    click(selector: string, options?: { timeout?: number }): Promise<void>;
    evaluate<T>(fn: (() => T) | ((arg: string) => T), arg?: string): Promise<T>;
    on(event: string, handler: (...args: unknown[]) => void): void;
    off(event: string, handler: (...args: unknown[]) => void): void;
};

/**
 * All component routes to visit. One canonical route per component page.
 * Ordered roughly matching the MudBlazor sidebar grouping.
 */
const COMPONENT_ROUTES: string[] = [
    // ── Layout ───────────────────────────────────────────────────────
    '/components/container',
    '/components/grid',
    '/components/hidden',
    '/components/breakpointprovider',
    '/components/stack',
    '/components/spacer',
    '/components/splitpanel',
    // ── Navigation ───────────────────────────────────────────────────
    '/components/appbar',
    '/components/breadcrumbs',
    '/components/drawer',
    '/components/link',
    '/components/navmenu',
    '/components/pagination',
    '/components/tabs',
    '/components/stepper',
    '/components/scrolltotop',
    // ── Form & Inputs ────────────────────────────────────────────────
    '/components/form',
    '/components/textfield',
    '/components/numericfield',
    '/components/select',
    '/components/autocomplete',
    '/components/checkbox',
    '/components/radio',
    '/components/switch',
    '/components/slider',
    '/components/field',
    '/components/fileupload',
    '/components/focustrap',
    // ── Pickers ──────────────────────────────────────────────────────
    '/components/datepicker',
    '/components/daterangepicker',
    '/components/timepicker',
    '/components/colorpicker',
    // ── Buttons ──────────────────────────────────────────────────────
    '/components/button',
    '/components/iconbutton',
    '/components/buttonfab',
    '/components/buttonfabmenu',
    '/components/buttongroup',
    '/components/toggleiconbutton',
    '/components/togglegroup',
    // ── Data display ─────────────────────────────────────────────────
    '/components/table',
    '/components/simpletable',
    '/components/datagrid',
    '/components/list',
    '/components/treeview',
    // ── Charts ───────────────────────────────────────────────────────
    '/components/charts',
    '/components/barchart',
    '/components/linechart',
    '/components/piechart',
    '/components/donutchart',
    '/components/heatmapchart',
    '/components/radarchart',
    '/components/rosechart',
    '/components/sankeychart',
    '/components/stackedbarchart',
    '/components/timeserieschart',
    // ── Feedback ─────────────────────────────────────────────────────
    '/components/alert',
    '/components/snackbar',
    '/components/messagebox',
    '/components/progress',
    '/components/skeleton',
    // ── Surfaces & containment ───────────────────────────────────────
    '/components/card',
    '/components/paper',
    '/components/divider',
    '/components/expansionpanels',
    '/components/collapse',
    '/components/overlay',
    '/components/popover',
    '/components/swipearea',
    '/components/dropzone',
    // ── Media & icons ────────────────────────────────────────────────
    '/components/avatar',
    '/components/badge',
    '/components/chips',
    '/components/chipset',
    '/components/icons',
    '/components/carousel',
    '/components/rating',
    '/components/highlighter',
    '/components/timeline',
    '/components/tooltip',
    '/components/menu',
    '/components/chat',
    // ── Functional ───────────────────────────────────────────────────
    '/components/hotkey',
    '/components/element',
    '/components/typography',
    // exitprompt MUST be last — it registers a beforeunload handler
    // that blocks subsequent navigations until the dialog is dismissed
    '/components/exitprompt',
];

/**
 * Full walkthrough: navigates to home, then visits every component page.
 * Returns wall-clock duration in ms.
 */
export async function runMudWalkthrough(
    page: PlaywrightPage,
    url: string,
    timeout: number,
    verbose = false,
): Promise<number> {
    const t = timeout;
    const log = verbose ? (msg: string) => debug(`Mud: ${msg}`) : () => { };
    const dialogHandler = (dialog: unknown) => {
        void (dialog as { accept: () => Promise<void> }).accept().catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            if (!message.includes('already handled')) {
                throw err;
            }
        });
    };

    page.on('dialog', dialogHandler);

    try {
        // ── Step 0: Load home ────────────────────────────────────────────────
        log('navigating to home...');
        await page.goto(url, { timeout: t, waitUntil: 'load' });
        await page.waitForFunction(
            () => (globalThis as Record<string, unknown>).bench_complete !== undefined,
            null, { timeout: t },
        );
        // Wait for MudBlazor Docs landing page to render
        await page.waitForSelector('.docs-page-header, .mud-main-content', { timeout: t });
        log('home loaded');

        // Capture start time AFTER initial navigation
        const startTime: number = await page.evaluate(() => performance.now());

        // ── Step 1: Visit every component page via client-side navigation ────
        for (const route of COMPONENT_ROUTES) {
            log(`navigating to ${route}`);
            await page.evaluate((r: string) => {
                // Blazor intercepts click events only from DOM-attached <a> elements.
                // A detached element's click triggers a full HTTP navigation (404).
                const link = document.createElement('a');
                link.href = r;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, route);
            // Wait for URL to update
            const basePath = route.split('#')[0];
            await page.waitForURL(new RegExp(basePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: t });
            // Wait for MudBlazor page content to render
            await page.waitForSelector('.docs-page-header, .mud-main-content .docs-section-header, .mud-main-content h1', { timeout: t });
            log(`loaded: ${route}`);
        }

        // Capture end time immediately after visiting all component pages
        const endTime: number = await page.evaluate(() => performance.now());

        // ── Step 2: Navigate back home (cleanup, not timed) ──────────────────
        log('navigating home...');
        await page.evaluate(() => {
            const link = document.createElement('a');
            link.href = '/';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
        log('walkthrough complete');

        return endTime - startTime;
    }
    finally {
        page.off('dialog', dialogHandler);
    }
}
