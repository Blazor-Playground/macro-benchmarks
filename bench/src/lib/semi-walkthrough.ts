/**
 * semi-walkthrough.ts — Playwright walkthrough for Semi Avalonia Demo app.
 *
 * All timed walkthrough steps run entirely inside the browser via a single
 * page.evaluate() call, eliminating Playwright round-trip overhead from
 * the benchmark measurement.
 *
 * Steps: load home → focus sidebar TabControl → navigate through all
 * component demo tabs via ArrowDown keyboard navigation.
 *
 * Semi Avalonia renders to a <canvas> element (Avalonia WASM), so DOM
 * selectors are not available for content detection. MainView logs
 * "[semi-rendered] <tab>" once the frame with the selected page has been
 * rendered (see src/semi-avalonia/Views/MainView.axaml.cs), and each step
 * waits for that message with the expected tab name.
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

const RENDERED_PREFIX = '[semi-rendered] ';

/** Dispatch an ArrowDown key event on the Avalonia container element. */
async function pressArrowDown(page: PlaywrightPage): Promise<void> {
    await page.evaluate(() => {
        const container = document.querySelector('.avalonia-container') as HTMLElement | null;
        if (!container) throw new Error('Avalonia container not found');
        container.focus();
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
 * Navigates from the current tab through every following component demo tab via ArrowDown,
 * waiting for "[semi-rendered] <tab>" after each step.
 * Returns wall-clock duration in ms.
 *
 * Arrow function to avoid bundler __name helper injection that breaks
 * Playwright's function serialization for page.evaluate().
 */
const browserSemiWalkthrough = (args: unknown): Promise<number> => {
    const { timeout: t, verbose, tabNames, startIndex, prefix } = args as {
        timeout: number;
        verbose: boolean;
        tabNames: string[];
        startIndex: number;
        prefix: string;
    };

    const log = verbose
        ? (msg: string) => console.log(`[semi-walkthrough] ${msg}`)
        : () => { /* noop */ };

    // main.mjs replaces console.log with a dispatcher that calls onConsole handlers,
    // so dotnet's console.log calls go through onConsole, not the native console.log.
    let waiter: { tab: string; resolve: () => void } | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onConsole = (globalThis as any).onConsole as ((...args: unknown[]) => void)[];
    const renderedHandler = (...logArgs: unknown[]): void => {
        const first = logArgs[0];
        if (waiter && typeof first === 'string' && first === prefix + waiter.tab) {
            waiter.resolve();
            waiter = null;
        }
    };
    onConsole.push(renderedHandler);

    /** Register the waiter before pressing the key, so a synchronous message is not missed. */
    const waitForRendered = (tab: string): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                waiter = null;
                reject(new Error(`Timed out waiting for ${prefix}${tab}`));
            }, t);
            waiter = { tab, resolve: () => { clearTimeout(timer); resolve(); } };
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

    const steps = async (): Promise<number> => {
        try {
            for (let i = startIndex + 1; i < tabNames.length; i++) {
                const tabName = tabNames[i];
                const rendered = waitForRendered(tabName);
                pressArrowDownBrowser();
                await rendered;
                log(`rendered: ${tabName}`);
            }

            return performance.now() - startTime;
        } finally {
            const idx = onConsole.indexOf(renderedHandler);
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

    // ── Capture [semi-rendered] console messages from MainView ───────────────
    const rendered = new Set<string>();
    let waiter: { tab: string; resolve: () => void } | null = null;

    const consoleHandler = (...args: unknown[]) => {
        const text = (args[0] as ConsoleMessage).text();
        if (!text.startsWith(RENDERED_PREFIX)) return;
        const tab = text.slice(RENDERED_PREFIX.length);
        rendered.add(tab);
        if (waiter?.tab === tab) {
            waiter.resolve();
            waiter = null;
        }
    };
    page.on('console', consoleHandler);

    /** Wait until "[semi-rendered] <tab>" arrives (or already arrived since the last reset). */
    const waitForRendered = (tab: string): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            if (rendered.has(tab)) { resolve(); return; }
            const timer = setTimeout(() => {
                waiter = null;
                reject(new Error(`Timed out waiting for ${RENDERED_PREFIX}${tab}`));
            }, timeout);
            waiter = { tab, resolve: () => { clearTimeout(timer); resolve(); } };
        });

    try {
        // ── Step 0: Load home (via Playwright — not part of the timed section) ──
        log('navigating to home...');
        await page.goto(url, { timeout, waitUntil: 'load' });
        await page.waitForFunction(
            () => (globalThis as Record<string, unknown>).bench_complete !== undefined,
            null, { timeout },
        );
        await waitForRendered(TAB_NAMES[0]);
        log(`${TAB_NAMES[0]} rendered`);

        // ── Step 1: Focus the sidebar TabControl (click the selected Overview item) ──
        await page.mouse.click(95, 82);

        // Skip past non-component tabs (Overview, About Us), waiting until the first
        // component page is rendered so its cost is not part of the timed section.
        for (let i = 1; i <= SKIP_TABS; i++) {
            rendered.clear();
            const done = waitForRendered(TAB_NAMES[i]);
            await pressArrowDown(page);
            await done;
            log(`skipped: ${TAB_NAMES[i]}`);
        }

        // ── Run timed walkthrough steps inside the browser ───────────────────
        log(`starting in-browser walkthrough from ${TAB_NAMES[SKIP_TABS]}...`);
        // esbuild's keepNames injects __name() calls into the serialized function body;
        // provide the helper in the browser so they resolve at runtime.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.evaluate(() => { (globalThis as any).__name = (fn: any) => fn; });
        const duration: number = await page.evaluate(
            browserSemiWalkthrough,
            { timeout, verbose, tabNames: TAB_NAMES, startIndex: SKIP_TABS, prefix: RENDERED_PREFIX },
        );

        log(`in-browser walkthrough completed: ${Math.round(duration)}ms`);
        return duration;
    } finally {
        page.off('console', consoleHandler);
    }
}
