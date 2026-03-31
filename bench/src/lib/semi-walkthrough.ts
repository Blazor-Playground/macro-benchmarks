/**
 * semi-walkthrough.ts — Playwright walkthrough for Semi Avalonia Demo app.
 *
 * All walkthrough steps run entirely inside the browser via a single
 * page.evaluate() call, eliminating Playwright round-trip overhead from
 * the benchmark measurement.
 *
 * Steps: load home → focus sidebar TabControl → navigate through all
 * component demo tabs via ArrowDown keyboard navigation.
 *
 * Semi Avalonia renders to a <canvas> element (Avalonia WASM), so DOM
 * selectors are not available for content detection.  We use keyboard
 * navigation (ArrowDown through the sidebar TabControl) and
 * requestAnimationFrame to wait for canvas repaints between tabs.
 */

import { debug } from '../log.js';
import { type WalkthroughOpts } from './walkthrough-types.js';

// Minimal Playwright Page type surface used by the walkthrough
type ConsoleMessage = { text(): string };
type PlaywrightPage = {
    goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<unknown>;
    waitForFunction(fn: (() => boolean) | string, arg: unknown, options?: { timeout?: number }): Promise<unknown>;
    evaluate<T>(fn: (() => T) | ((arg: unknown) => T), arg?: unknown): Promise<T>;
    mouse: { click(x: number, y: number): Promise<void> };
    keyboard: { press(key: string): Promise<void> };
    on(event: string, handler: (...args: unknown[]) => void): void;
    off(event: string, handler: (...args: unknown[]) => void): void;
};

/**
 * All selectable tab names in sidebar order (excludes disabled category headers).
 * Ordered matching MainView.axaml TabControl declaration.
 */
const TAB_NAMES: string[] = [
    // ── Meta (skipped) ───────────────────────────────────────────────
    'Overview',
    'About Us',
    // ── Resource Browser ─────────────────────────────────────────────
    'Palette',
    'HighContrastTheme',
    'Variables',
    'Icon',
    // ── Separate Pack ────────────────────────────────────────────────
    'ColorPicker',
    'DataGrid',
    // ── Basic ────────────────────────────────────────────────────────
    'TextBlock',
    'SelectableTextBlock',
    'Border',
    'PathIcon',
    // ── Button ───────────────────────────────────────────────────────
    'Button',
    'HyperlinkButton',
    'CheckBox',
    'RadioButton',
    'ToggleSwitch',
    // ── Input ────────────────────────────────────────────────────────
    'TextBox',
    'AutoCompleteBox',
    'ComboBox',
    'ButtonSpinner',
    'NumericUpDown',
    'Slider',
    'ManagedFileChooser',
    // ── Date/Time ────────────────────────────────────────────────────
    'Calendar',
    'CalendarDatePicker',
    'DatePicker',
    'TimePicker',
    // ── Navigation ───────────────────────────────────────────────────
    'TabControl',
    'TabStrip',
    'TreeView',
    // ── Show ─────────────────────────────────────────────────────────
    'Carousel',
    'Expander',
    'Flyout',
    'HeaderedContentControl',
    'Label',
    'ListBox',
    'SplitView',
    'ToolTip',
    // ── Feedback ─────────────────────────────────────────────────────
    'DataValidationErrors',
    'Notification',
    'ProgressBar',
    'RefreshContainer',
    // ── Other ────────────────────────────────────────────────────────
    'GridSplitter',
    'Menu',
    'ScrollViewer',
    'ThemeVariantScope',
];

/** Number of non-component tabs at the start to skip (Overview, About Us). */
const SKIP_TABS = 2;

/** rAF counter for debugging. */
let rafCount = 0;

/** Wait for Avalonia canvas to repaint (two rAF cycles), logging the count. */
async function waitForRepaint(page: PlaywrightPage): Promise<void> {
    const n = ++rafCount;
    await page.evaluate((idx: unknown) => new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }), String(n));
}

/** Dispatch an ArrowDown key event on the Avalonia container element. */
async function pressArrowDown(page: PlaywrightPage): Promise<void> {
    await page.evaluate(() => {
        const container = document.querySelector('.avalonia-container') as HTMLElement | null;
        if (!container) throw new Error('Avalonia container not found');
        container.focus();
        console.log(`[semi-walkthrough] ArrowDown on container (focused=${document.activeElement === container})`);
        container.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true,
        }));
        container.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true,
        }));
    });
}

/**
 * Runs entirely inside the browser (passed to page.evaluate).
 * Navigates through every component demo tab via ArrowDown keyboard events,
 * intercepting [semi-nav] console messages to confirm navigation.
 * Returns wall-clock duration in ms.
 *
 * Arrow function to avoid bundler __name helper injection that breaks
 * Playwright's function serialization for page.evaluate().
 */
const browserSemiWalkthrough = (args: unknown): Promise<number> => {
    const { timeout: t, verbose, tabNames, skipTabs } = args as {
        timeout: number;
        verbose: boolean;
        tabNames: string[];
        skipTabs: number;
    };

    const NAV_PREFIX = '[semi-nav] ';
    const log = verbose
        ? (msg: string) => console.log(`[semi-walkthrough] ${msg}`)
        : () => { /* noop */ };

    // ── Subscribe to globalThis.onConsole to capture [semi-nav] messages ─
    // main.mjs replaces console.log with a dispatcher that calls onConsole handlers,
    // so dotnet's console.log calls go through onConsole, not the native console.log.
    let lastNavTab: string | null = null;
    let navResolve: (() => void) | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onConsole = (globalThis as any).onConsole as ((...args: unknown[]) => void)[];
    const navHandler = (...logArgs: unknown[]): void => {
        const first = logArgs[0];
        if (typeof first === 'string' && first.startsWith(NAV_PREFIX)) {
            lastNavTab = first.slice(NAV_PREFIX.length);
            if (navResolve) {
                navResolve();
                navResolve = null;
            }
        }
    };
    onConsole.push(navHandler);

    const waitForNav = (expected: string, ms: number): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            if (lastNavTab === expected) { resolve(); return; }
            const timer = setTimeout(() => {
                navResolve = null;
                reject(new Error(`Timed out waiting for [semi-nav] ${expected} (last seen: ${lastNavTab})`));
            }, ms);
            navResolve = () => { clearTimeout(timer); resolve(); };
        });

    const waitForRepaintBrowser = (): Promise<void> =>
        new Promise<void>(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });

    const pressArrowDownBrowser = (): void => {
        const container = document.querySelector('.avalonia-container') as HTMLElement | null;
        if (!container) throw new Error('Avalonia container not found');
        container.focus();
        container.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true,
        }));
        container.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true,
        }));
    };

    const startTime = performance.now();
    const componentTabs = tabNames.length - skipTabs;

    const steps = async (): Promise<number> => {
        try {
            for (let i = 1; i < componentTabs; i++) {
                const tabName = tabNames[skipTabs + i];
                lastNavTab = null;
                pressArrowDownBrowser();
                await waitForRepaintBrowser();
                await waitForNav(tabName, t);
                await waitForRepaintBrowser();
                log(`loaded: ${tabName}`);
            }

            return performance.now() - startTime;
        } finally {
            const idx = onConsole.indexOf(navHandler);
            if (idx >= 0) onConsole.splice(idx, 1);
        }
    };

    return steps();
};

/**
 * Loads the page via Playwright, then runs all timed walkthrough steps inside
 * the browser via a single page.evaluate() to avoid measuring Playwright
 * communication overhead. Returns wall-clock duration in ms.
 */
export async function runSemiWalkthrough(opts: WalkthroughOpts<PlaywrightPage>): Promise<number> {
    const { page, url, timeout, verbose = false } = opts;
    const log = verbose ? (msg: string) => debug(`Semi: ${msg}`) : () => { };

    // ── Capture [semi-nav] console messages from C# SelectionChanged handler ─
    const NAV_PREFIX = '[semi-nav] ';
    let lastNavTab: string | null = null;
    let navResolve: (() => void) | null = null;

    const consoleHandler = (...args: unknown[]) => {
        const msg = args[0] as ConsoleMessage;
        const text = msg.text();
        if (text.startsWith(NAV_PREFIX)) {
            lastNavTab = text.slice(NAV_PREFIX.length);
            if (navResolve) {
                navResolve();
                navResolve = null;
            }
        }
    };
    page.on('console', consoleHandler);

    /** Wait until a [semi-nav] message arrives, with timeout. */
    const waitForNav = (expected: string, ms: number): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            if (lastNavTab === expected) { resolve(); return; }
            const timer = setTimeout(() => {
                navResolve = null;
                reject(new Error(`Timed out waiting for [semi-nav] ${expected} (last seen: ${lastNavTab})`));
            }, ms);
            navResolve = () => { clearTimeout(timer); resolve(); };
        });

    try {
        // ── Step 0: Load home (via Playwright — not part of the timed section) ──
        log('navigating to home...');
        await page.goto(url, { timeout, waitUntil: 'load' });
        await page.waitForFunction(
            () => (globalThis as Record<string, unknown>).bench_complete !== undefined,
            null, { timeout },
        );
        log('home loaded');

        // Wait for Avalonia canvas to be created and the splash screen to disappear
        await page.waitForFunction(
            () => {
                const canvas = document.querySelector('canvas.avalonia-canvas');
                const splash = document.querySelector('.avalonia-splash');
                const ready = canvas !== null && (splash === null || (splash as HTMLElement).style.display === 'none'
                    || getComputedStyle(splash).display === 'none' || getComputedStyle(splash).opacity === '0');
                console.log(`[semi-walkthrough] canvas=${!!canvas} splash-gone=${ready}`);
                return ready;
            },
            null, { timeout },
        );
        log('canvas ready');

        // Give Avalonia a few frames to finish rendering the initial UI
        await waitForRepaint(page);
        await waitForRepaint(page);
        await waitForRepaint(page);

        // ── Step 1: Focus the sidebar TabControl ─────────────────────────────
        await page.mouse.click(95, 82);
        await page.evaluate(() => {
            const container = document.querySelector('.avalonia-container') as HTMLElement | null;
            if (container) container.focus();
        });
        await waitForRepaint(page);
        log('focused TabControl on Overview');

        // Skip past non-component tabs (Overview, About Us)
        for (let i = 0; i < SKIP_TABS; i++) {
            const expected = TAB_NAMES[i + 1]; // next tab after current
            lastNavTab = null;
            await pressArrowDown(page);
            await waitForNav(expected, timeout);
            log(`skipped: ${expected}`);
        }
        log(`positioned on ${TAB_NAMES[SKIP_TABS]}`);

        // ── Run timed walkthrough steps inside the browser ───────────────────
        log('starting in-browser walkthrough...');
        // esbuild's keepNames injects __name() calls into the serialized function body;
        // provide the helper in the browser so they resolve at runtime.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.evaluate(() => { (globalThis as any).__name = (fn: any) => fn; });
        const duration: number = await page.evaluate(
            browserSemiWalkthrough,
            { timeout, verbose, tabNames: TAB_NAMES, skipTabs: SKIP_TABS },
        );

        log(`in-browser walkthrough completed: ${Math.round(duration)}ms`);
        return duration;
    } finally {
        page.off('console', consoleHandler);
    }
}
