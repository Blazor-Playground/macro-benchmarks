/**
 * havit-walkthrough.ts — Playwright walkthrough for Havit Bootstrap documentation app.
 *
 * All walkthrough steps run entirely inside the browser via a single
 * page.evaluate() call, eliminating Playwright round-trip overhead from
 * the benchmark measurement.
 *
 * Steps: load home → visit every sidebar page across all categories
 *      → navigate to showcase → navigate home.
 */

import { debug } from '../log.js';
import { type WalkthroughOpts } from './walkthrough-types.js';

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
 * All sidebar routes grouped by category.
 * Each entry: [category button text, href as it appears in the sidebar link].
 *
 * The sidebar uses Bootstrap collapse: child links are hidden until their parent
 * category button is clicked.  Each link also appears in a dropdown-menu duplicate
 * and in "All Components", so we target only the collapse-section copy
 * with :not(.dropdown-item).
 */
const SIDEBAR_ROUTES: Array<[string, string]> = [
    // ── Forms ─────────────────────────────────────────────────────────
    ['Forms', '/components/Inputs'],
    ['Forms', '/components/HxAutosuggest'],
    ['Forms', '/components/HxCalendar'],
    ['Forms', '/components/HxInputDate'],
    ['Forms', '/components/HxInputDateRange'],
    ['Forms', '/components/HxInputFile'],
    ['Forms', '/components/HxInputFileDropZone'],
    ['Forms', '/components/HxInputNumber'],
    ['Forms', '/components/HxInputPercent'],
    ['Forms', '/components/HxInputRange'],
    ['Forms', '/components/HxInputTags'],
    ['Forms', '/components/HxInputText'],
    ['Forms', '/components/HxInputTextArea'],
    ['Forms', '/components/HxCheckbox'],
    ['Forms', '/components/HxCheckboxList'],
    ['Forms', '/components/HxSwitch'],
    ['Forms', '/components/HxFormState'],
    ['Forms', '/components/HxFormValue'],
    ['Forms', '/components/HxRadioButtonList'],
    ['Forms', '/components/HxSelect'],
    ['Forms', '/components/HxMultiSelect'],
    ['Forms', '/components/HxSearchBox'],
    ['Forms', '/components/HxFilterForm'],
    ['Forms', '/components/HxValidationMessage'],
    // ── Buttons & Indicators ─────────────────────────────────────────
    ['Buttons & Indicators', '/components/HxButton'],
    ['Buttons & Indicators', '/components/HxButtonGroup'],
    ['Buttons & Indicators', '/components/HxButtonToolbar#HxButtonToolbar'],
    ['Buttons & Indicators', '/components/HxCloseButton'],
    ['Buttons & Indicators', '/components/HxSubmit#HxSubmit'],
    ['Buttons & Indicators', '/components/HxDropdownButtonGroup'],
    ['Buttons & Indicators', '/components/HxBadge'],
    ['Buttons & Indicators', '/components/HxChipList'],
    ['Buttons & Indicators', '/components/HxSpinner'],
    ['Buttons & Indicators', '/components/HxProgress'],
    ['Buttons & Indicators', '/components/HxProgressIndicator'],
    // ── Data & Grid ──────────────────────────────────────────────────
    ['Data & Grid', '/components/HxGrid'],
    ['Data & Grid', '/components/HxEChart'],
    ['Data & Grid', '/components/HxContextMenu'],
    ['Data & Grid', '/components/HxPager'],
    ['Data & Grid', '/components/HxRepeater'],
    ['Data & Grid', '/components/HxTreeView'],
    // ── Layout & Typography ──────────────────────────────────────────
    ['Layout & Typography', '/components/HxAccordion'],
    ['Layout & Typography', '/components/HxAlert'],
    ['Layout & Typography', '/components/HxCard'],
    ['Layout & Typography', '/components/HxCarousel'],
    ['Layout & Typography', '/components/HxCollapse'],
    ['Layout & Typography', '/components/HxDropdown'],
    ['Layout & Typography', '/components/HxIcon'],
    ['Layout & Typography', '/components/HxPlaceholder'],
    ['Layout & Typography', '/components/HxTooltip'],
    ['Layout & Typography', '/components/HxPopover'],
    ['Layout & Typography', '/components/HxTabPanel'],
    ['Layout & Typography', '/components/HxListGroup'],
    ['Layout & Typography', '/components/HxListLayout'],
    // ── Navigation ───────────────────────────────────────────────────
    ['Navigation', '/components/HxNavbar'],
    ['Navigation', '/components/HxSidebar'],
    ['Navigation', '/components/HxNav'],
    ['Navigation', '/components/HxNavLink#HxNavLink'],
    ['Navigation', '/components/HxScrollspy'],
    ['Navigation', '/components/HxBreadcrumb'],
    ['Navigation', '/components/HxAnchorFragmentNavigation'],
    ['Navigation', '/components/HxRedirectTo'],
    // ── Modals & Interactions ────────────────────────────────────────
    ['Modals & Interactions', '/components/HxMessageBox'],
    ['Modals & Interactions', '/components/HxModal'],
    ['Modals & Interactions', '/components/HxDialogBase'],
    ['Modals & Interactions', '/components/HxOffcanvas'],
    ['Modals & Interactions', '/components/HxMessenger'],
    ['Modals & Interactions', '/components/HxToast'],
    // ── Smart (AI) ───────────────────────────────────────────────────
    ['Smart (AI)', '/components/HxSmartPasteButton'],
    ['Smart (AI)', '/components/HxSmartTextArea'],
    ['Smart (AI)', '/components/HxSmartComboBox'],
    // ── Special ──────────────────────────────────────────────────────
    ['Special', '/components/HxDynamicElement'],
    ['Special', '/components/HxGoogleTagManager'],
    // ── Concepts ─────────────────────────────────────────────────────
    ['Concepts', '/concepts/defaults-and-settings'],
    ['Concepts', '/concepts/Debouncer'],
    ['Concepts', '/concepts/dark-color-mode-theme'],
];

/**
 * Runs entirely inside the browser (passed to page.evaluate).
 * Visits every Havit sidebar page via client-side DOM clicks.
 * Returns wall-clock duration in ms.
 *
 * Arrow function to avoid bundler __name helper injection that breaks
 * Playwright's function serialization for page.evaluate().
 */
const browserHavitWalkthrough = (args: unknown): Promise<number> => {
    const { timeout: t, verbose, routes } = args as {
        timeout: number;
        verbose: boolean;
        routes: Array<[string, string]>;
    };

    const POLL_MS = 16;
    const RENDER_PREFIX = 'App rendered after navigation.';
    const log = verbose
        ? (msg: string) => console.log(`[havit-walkthrough] ${msg}`)
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

    const escapeRegex = (s: string): string =>
        s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const expandCategory = (cat: string): void => {
        const buttons = document.querySelectorAll<HTMLAnchorElement>(
            '.hx-sidebar-item a[role="button"]',
        );
        for (const btn of buttons) {
            const inner = btn.querySelector('.hx-sidebar-item-navlink-content-inner');
            if (inner && inner.textContent?.trim() === cat) {
                if (btn.getAttribute('aria-expanded') !== 'true') {
                    btn.click();
                }
                return;
            }
        }
    };

    const clickLink = (selector: string): void => {
        const el = document.querySelector<HTMLElement>(selector);
        if (!el) throw new Error(`clickLink: "${selector}" not found`);
        el.click();
    };

    const startTime = performance.now();

    const steps = async (): Promise<number> => {
        try {
            // ── Visit every sidebar page ──────────────────────────────────────
            for (const [category, href] of routes) {
                expandCategory(category);

                const linkSelector =
                    `a.nav-link.hx-sidebar-item:not(.dropdown-item)[href$="${href}"]`;
                await waitForSelector(linkSelector);
                log(`clicking sidebar link: ${href}`);
                const renderPromise = waitForRenderComplete(t);
                clickLink(linkSelector);

                const basePath = href.split('#')[0];
                await waitForUrl(new RegExp(escapeRegex(basePath) + '\\b'));
                await waitForSelector('.doc-content h1');
                await renderPromise;
                log(`loaded: ${href}`);
            }

            // ── Navigate to Showcase via navbar ──────────────────────────────
            log('navigating to showcase...');
            let renderPromise = waitForRenderComplete(t);
            clickLink('.nav-container a[href="showcase"]');
            await waitForUrl(/\/showcase/);
            await waitForSelector('.showcase-list');
            await renderPromise;
            log('showcase loaded');

            // ── Navigate back home via navbar ────────────────────────────────
            log('navigating home...');
            renderPromise = waitForRenderComplete(t);
            clickLink('.nav-container a[href=""]');
            await waitForSelector('h1#getting-started');
            await renderPromise;
            log('home loaded again');

            return performance.now() - startTime;
        } finally {
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
export async function runHavitWalkthrough(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    const { page, url, timeout: t, verbose = false } = opts;
    const log = verbose ? (msg: string) => debug(`Havit: ${msg}`) : () => { };

    try {
        // ── Step 0: Load home (via Playwright — not part of the timed section) ──
        log('navigating to home...');
        await page.goto(url, { timeout: t, waitUntil: 'load' });
        await page.waitForFunction(
            () => (globalThis as Record<string, unknown>).bench_complete !== undefined,
            null, { timeout: t },
        );
        await page.waitForSelector('#done', { timeout: t });
        log('home loaded');

        // ── Run ALL walkthrough steps inside the browser ─────────────────────
        log('starting in-browser walkthrough...');
        // esbuild's keepNames injects __name() calls into the serialized function body;
        // provide the helper in the browser so they resolve at runtime.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.evaluate(() => { (globalThis as any).__name = (fn: any) => fn; });
        const duration: number = await page.evaluate(
            browserHavitWalkthrough,
            { timeout: t, verbose, routes: SIDEBAR_ROUTES },
        );

        log(`in-browser walkthrough completed: ${Math.round(duration)}ms`);
        return duration;
    } finally {
        // no cleanup needed — havit doesn't register beforeunload
    }
}
