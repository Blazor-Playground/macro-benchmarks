/**
 * mud-walkthrough.ts — Playwright walkthrough for MudBlazor documentation app.
 *
 * All walkthrough steps run entirely inside the browser via a single
 * page.evaluate() call, eliminating Playwright round-trip overhead from
 * the benchmark measurement.
 *
 * Steps: load home → visit every component page → navigate home.
 */

import { debug } from '../log.js';

// Minimal Playwright Page type surface used by the walkthrough
type PlaywrightPage = {
    goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<unknown>;
    waitForSelector(selector: string, options?: { timeout?: number; state?: string }): Promise<unknown>;
    waitForFunction(fn: (() => boolean) | string, arg: unknown, options?: { timeout?: number }): Promise<unknown>;
    evaluate<T>(fn: (() => T) | ((arg: unknown) => T), arg?: unknown): Promise<T>;
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
 * Runs entirely inside the browser (passed to page.evaluate).
 * Visits every MudBlazor component page via client-side navigation.
 * Returns wall-clock duration in ms.
 *
 * Arrow function to avoid bundler __name helper injection that breaks
 * Playwright's function serialization for page.evaluate().
 */
const browserMudWalkthrough = (args: unknown): Promise<number> => {
    const { timeout: t, verbose, routes } = args as {
        timeout: number;
        verbose: boolean;
        routes: string[];
    };

    const POLL_MS = 16;
    const RENDER_PREFIX = 'App rendered after navigation.';
    const log = verbose
        ? (msg: string) => console.log(`[mud-walkthrough] ${msg}`)
        : () => { /* noop */ };

    // ── Subscribe to globalThis.onConsole to capture render-complete messages ──
    let renderResolve: (() => void) | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onConsole = (globalThis as any).onConsole as ((...args: unknown[]) => void)[];
    const renderHandler = (...logArgs: unknown[]): void => {
        const first = logArgs[0];
        if (typeof first === 'string' && first.startsWith(RENDER_PREFIX)) {
            if (renderResolve) {
                renderResolve();
                renderResolve = null;
            }
        }
    };
    onConsole.push(renderHandler);

    const waitForRenderComplete = (ms: number): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                renderResolve = null;
                reject(new Error(`Timed out waiting for render-complete console message`));
            }, ms);
            renderResolve = () => {
                clearTimeout(timer);
                // Double-rAF: wait for browser to actually paint the DOM changes
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            };
        });

    const waitForSelector = (
        selector: string,
        opts?: { timeout?: number },
    ): Promise<Element> => {
        const deadline = performance.now() + (opts?.timeout ?? t);
        return new Promise((resolve, reject) => {
            const check = () => {
                if (performance.now() > deadline) {
                    reject(new Error(`waitForSelector("${selector}") timed out`));
                    return;
                }
                const el = document.querySelector(selector);
                if (el && (el as HTMLElement).offsetParent !== null) {
                    resolve(el);
                    return;
                }
                setTimeout(check, POLL_MS);
            };
            check();
        });
    };

    const waitForUrl = (
        pattern: RegExp,
        opts?: { timeout?: number },
    ): Promise<void> => {
        const deadline = performance.now() + (opts?.timeout ?? t);
        return new Promise((resolve, reject) => {
            const check = () => {
                if (performance.now() > deadline) {
                    reject(new Error(`waitForUrl(${pattern}) timed out`));
                    return;
                }
                if (pattern.test(window.location.href)) {
                    resolve();
                    return;
                }
                setTimeout(check, POLL_MS);
            };
            check();
        });
    };

    const navigateClient = (route: string): void => {
        // Blazor intercepts click events only from DOM-attached <a> elements.
        const link = document.createElement('a');
        link.href = route;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const escapeRegex = (s: string): string =>
        s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Auto-accept beforeunload dialogs (exitprompt page triggers one)
    const origConfirm = window.confirm;
    window.confirm = () => true;
    window.onbeforeunload = null;

    const startTime = performance.now();

    const steps = async (): Promise<number> => {
        try {
            for (const route of routes) {
                log(`navigating to ${route}`);
                const renderPromise = waitForRenderComplete(t);
                navigateClient(route);

                const basePath = route.split('#')[0];
                await waitForUrl(new RegExp(escapeRegex(basePath)));
                await waitForSelector(
                    '.docs-page-header, .mud-main-content .docs-section-header, .mud-main-content h1',
                );
                await renderPromise;
                log(`loaded: ${route}`);
            }

            const duration = performance.now() - startTime;

            // Navigate home (cleanup, not timed)
            navigateClient('/');

            return duration;
        } finally {
            window.confirm = origConfirm;
            const idx = onConsole.indexOf(renderHandler);
            if (idx >= 0) onConsole.splice(idx, 1);
        }
    };

    return steps();
};

/**
 * Loads the page via Playwright, then runs all walkthrough steps inside the
 * browser via a single page.evaluate() to avoid measuring Playwright
 * communication overhead. Returns wall-clock duration in ms.
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
        // ── Step 0: Load home (via Playwright — not part of the timed section) ──
        log('navigating to home...');
        await page.goto(url, { timeout: t, waitUntil: 'load' });
        await page.waitForFunction(
            () => (globalThis as Record<string, unknown>).bench_complete !== undefined,
            null, { timeout: t },
        );
        await page.waitForSelector('.docs-page-header, .mud-main-content', { timeout: t });
        log('home loaded');

        // ── Run ALL walkthrough steps inside the browser ─────────────────────
        log('starting in-browser walkthrough...');
        // esbuild's keepNames injects __name() calls into the serialized function body;
        // provide the helper in the browser so they resolve at runtime.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.evaluate(() => { (globalThis as any).__name = (fn: any) => fn; });
        const duration: number = await page.evaluate(
            browserMudWalkthrough,
            { timeout: t, verbose, routes: COMPONENT_ROUTES },
        );

        log(`in-browser walkthrough completed: ${Math.round(duration)}ms`);
        return duration;
    } finally {
        page.off('dialog', dialogHandler);
    }
}
