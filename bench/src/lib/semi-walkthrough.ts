/**
 * semi-walkthrough.ts — Playwright walkthrough for Semi Avalonia Demo app.
 *
 * Measures total wall-clock time from fresh navigation to completion.
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

// Minimal Playwright Page type surface used by the walkthrough
type ConsoleMessage = { text(): string };
type PlaywrightPage = {
    goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<unknown>;
    waitForFunction(fn: (() => boolean) | string, arg: unknown, options?: { timeout?: number }): Promise<unknown>;
    evaluate<T>(fn: (() => T) | ((arg: string) => T), arg?: string): Promise<T>;
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
    await page.evaluate((idx: string) => new Promise<void>(resolve => {
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
 * Full walkthrough: navigates to home, then visits every component demo tab.
 * Returns wall-clock duration in ms.
 */
export async function runSemiWalkthrough(
    page: PlaywrightPage,
    url: string,
    timeout: number,
    verbose = false,
): Promise<number> {
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
    function waitForNav(expected: string, ms: number): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // If the message already arrived (race), resolve immediately
            if (lastNavTab === expected) { resolve(); return; }
            const timer = setTimeout(() => {
                navResolve = null;
                reject(new Error(`Timed out waiting for [semi-nav] ${expected} (last seen: ${lastNavTab})`));
            }, ms);
            navResolve = () => { clearTimeout(timer); resolve(); };
        });
    }

    try {
        // ── Step 0: Load home ────────────────────────────────────────────────
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

        // Capture start time AFTER load and positioning on first component tab
        const startTime: number = await page.evaluate(() => performance.now());

        // ── Step 2: Navigate through every component demo tab ────────────────
        const componentTabs = TAB_NAMES.length - SKIP_TABS;
        for (let i = 1; i < componentTabs; i++) {
            const tabName = TAB_NAMES[SKIP_TABS + i];
            lastNavTab = null;
            await pressArrowDown(page);
            await waitForRepaint(page);
            await waitForNav(tabName, timeout);
            // One extra repaint to let the content render after selection
            await waitForRepaint(page);
            log(`loaded: ${tabName}`);
        }

        // Capture end time after visiting all component tabs
        const endTime: number = await page.evaluate(() => performance.now());

        log(`walkthrough complete: ${Math.round(endTime - startTime)}ms`);
        return endTime - startTime;
    } finally {
        page.off('console', consoleHandler);
    }
}
