/**
 * uno-walkthrough.ts — Playwright walkthrough for Uno Gallery app.
 *
 * Measures total wall-clock time from fresh navigation to completion.
 *
 * Steps: load home → focus sidebar → expand each category via Space →
 * navigate through all child samples via ArrowDown + Enter.
 *
 * Uno Gallery renders to a <canvas id="uno-canvas"> element (Uno Skia WASM),
 * so DOM selectors are not available for content.  We use keyboard navigation
 * (Space to expand categories, ArrowDown to move, Enter to select) on the
 * NavigationView sidebar, similar to the Semi Avalonia walkthrough approach.
 */

import { debug } from '../log.js';

// Minimal Playwright Page type surface used by the walkthrough
type PlaywrightPage = {
    goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<unknown>;
    waitForFunction(fn: (() => boolean) | string, arg: unknown, options?: { timeout?: number }): Promise<unknown>;
    evaluate<T>(fn: (() => T) | ((arg: string) => T), arg?: string): Promise<T>;
    mouse: { click(x: number, y: number): Promise<void> };
    keyboard: { press(key: string): Promise<void> };
};

/**
 * Sidebar navigation structure.  Each entry is either a category header
 * (expand via Space) or a child sample (select via Enter).  Items are
 * ordered exactly as they appear in the NavigationView sidebar — categories
 * ordered by SampleCategory enum, children alphabetically within each category.
 */
interface NavItem {
    /** Display name (for logging) */
    name: string;
    /** 'category' = expand/collapse with Space; 'sample' = select with Enter */
    type: 'category' | 'sample';
}

const NAV_ITEMS: NavItem[] = [
    // ── Theming (2 children) ─────────────────────────────────────────
    { name: 'Theming', type: 'category' },
    { name: 'Lightweight Styling', type: 'sample' },
    { name: 'Typography', type: 'sample' },
    // ── UI components (51 children) ──────────────────────────────────
    { name: 'UI components', type: 'category' },
    { name: 'AutoSuggestBox', type: 'sample' },
    { name: 'BreadcrumbBar', type: 'sample' },
    { name: 'Button', type: 'sample' },
    { name: 'CalendarDatePicker', type: 'sample' },
    { name: 'CalendarView', type: 'sample' },
    { name: 'Card', type: 'sample' },
    { name: 'CheckBox', type: 'sample' },
    { name: 'ColorPicker', type: 'sample' },
    { name: 'ComboBox', type: 'sample' },
    { name: 'CommandBar', type: 'sample' },
    { name: 'ContentDialog', type: 'sample' },
    { name: 'DatePicker', type: 'sample' },
    { name: 'ElevatedView', type: 'sample' },
    { name: 'FlipView', type: 'sample' },
    { name: 'Floating Action Button', type: 'sample' },
    { name: 'Flyout', type: 'sample' },
    { name: 'Grid', type: 'sample' },
    { name: 'GridView', type: 'sample' },
    { name: 'HyperlinkButton', type: 'sample' },
    { name: 'Icon', type: 'sample' },
    { name: 'Image', type: 'sample' },
    { name: 'InfoBadge', type: 'sample' },
    { name: 'ListView', type: 'sample' },
    { name: 'MediaPlayerElement', type: 'sample' },
    { name: 'MenuBar', type: 'sample' },
    { name: 'NavigationView', type: 'sample' },
    { name: 'NumberBox', type: 'sample' },
    { name: 'Panel', type: 'sample' },
    { name: 'PasswordBox', type: 'sample' },
    { name: 'Path', type: 'sample' },
    { name: 'PersonPicture', type: 'sample' },
    { name: 'PipsPager', type: 'sample' },
    { name: 'Progress Ring/Bar', type: 'sample' },
    { name: 'RadioButton', type: 'sample' },
    { name: 'RatingControl', type: 'sample' },
    { name: 'RefreshContainer', type: 'sample' },
    { name: 'RelativePanel', type: 'sample' },
    { name: 'Shape', type: 'sample' },
    { name: 'Slider', type: 'sample' },
    { name: 'StackPanel', type: 'sample' },
    { name: 'SwipeControl', type: 'sample' },
    { name: 'TeachingTip', type: 'sample' },
    { name: 'TextBlock', type: 'sample' },
    { name: 'TextBox', type: 'sample' },
    { name: 'TimePicker', type: 'sample' },
    { name: 'ToggleSwitch', type: 'sample' },
    { name: 'TreeView', type: 'sample' },
    { name: 'TwoPaneView', type: 'sample' },
    { name: 'VariableSizedWrapGrid', type: 'sample' },
    { name: 'ViewBox', type: 'sample' },
    { name: 'WebView', type: 'sample' },
    // ── UI features (6 children) ─────────────────────────────────────
    { name: 'UI features', type: 'category' },
    { name: 'Acrylic', type: 'sample' },
    { name: 'Animation', type: 'sample' },
    { name: 'Binding', type: 'sample' },
    { name: 'Brush', type: 'sample' },
    { name: 'Lottie', type: 'sample' },
    { name: 'Transforms', type: 'sample' },
    // ── Non-UI features (19 children) ────────────────────────────────
    { name: 'Non-UI features', type: 'category' },
    { name: 'Accelerometer', type: 'sample' },
    { name: 'Barometer', type: 'sample' },
    { name: 'Clipboard', type: 'sample' },
    { name: 'Display Request', type: 'sample' },
    { name: 'Email Manager', type: 'sample' },
    { name: 'File and Folder Pickers', type: 'sample' },
    { name: 'Gamepad', type: 'sample' },
    { name: 'Geolocator', type: 'sample' },
    { name: 'Gyrometer', type: 'sample' },
    { name: 'Lamp', type: 'sample' },
    { name: 'Launcher', type: 'sample' },
    { name: 'Light Sensor', type: 'sample' },
    { name: 'Local Settings', type: 'sample' },
    { name: 'Magnetometer', type: 'sample' },
    { name: 'Network Information', type: 'sample' },
    { name: 'Pedometer', type: 'sample' },
    { name: 'PhoneCallManager', type: 'sample' },
    { name: 'Sharing', type: 'sample' },
    { name: 'Simple Orientation', type: 'sample' },
    // ── Toolkit (7 children) ─────────────────────────────────────────
    { name: 'Toolkit', type: 'category' },
    { name: 'Chip', type: 'sample' },
    { name: 'ChipGroup', type: 'sample' },
    { name: 'Divider', type: 'sample' },
    { name: 'NavigationBar', type: 'sample' },
    { name: 'SegmentedControl', type: 'sample' },
    { name: 'ShadowContainer', type: 'sample' },
    { name: 'TabBar', type: 'sample' },
    // ── Community Toolkit (1 child) ──────────────────────────────────
    { name: 'Community Toolkit', type: 'category' },
    { name: 'DataGrid', type: 'sample' },
];

/** Wait for Uno canvas to repaint (two rAF cycles). */
async function waitForRepaint(page: PlaywrightPage): Promise<void> {
    await page.evaluate(() => new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
}

/**
 * Ensure the Uno canvas has both pointer and keyboard focus.
 * Uno Skia WASM renders to #uno-canvas, but by default the canvas does not
 * have a tabindex, so keyboard events won't reach it.  We add tabindex="0"
 * and call .focus() to ensure keyboard navigation works.
 */
async function focusCanvas(page: PlaywrightPage): Promise<void> {
    await page.evaluate(() => {
        const canvas = document.getElementById('uno-canvas');
        if (canvas) {
            canvas.setAttribute('tabindex', '0');
            canvas.focus();
        }
    });
}

/**
 * Full walkthrough: navigates to home, then visits every sample page via
 * keyboard navigation through the sidebar NavigationView.
 * Returns wall-clock duration in ms.
 */
export async function runUnoWalkthrough(
    page: PlaywrightPage,
    url: string,
    timeout: number,
    verbose = false,
): Promise<number> {
    const log = verbose ? (msg: string) => debug(`Uno: ${msg}`) : () => { };

    // ── Step 0: Load home ────────────────────────────────────────────────
    log('navigating to home...');
    await page.goto(url, { timeout, waitUntil: 'load' });
    await page.waitForFunction(
        () => (globalThis as Record<string, unknown>).bench_complete !== undefined,
        null, { timeout },
    );
    log('home loaded');

    // Wait for Uno canvas to be created
    await page.waitForFunction(
        () => document.getElementById('uno-canvas') !== null,
        null, { timeout },
    );
    log('canvas ready');

    // Give Uno a few frames to finish rendering the initial UI
    await waitForRepaint(page);
    await waitForRepaint(page);
    await waitForRepaint(page);

    // ── Step 1: Focus the sidebar NavigationView ─────────────────────────
    // First, ensure the canvas has keyboard focus (Uno WASM Skia canvas
    // does not have tabindex by default).
    await focusCanvas(page);
    await waitForRepaint(page);

    // Click chevron area of first category (Theming) to expand it and
    // give Uno's internal focus to the NavigationView.  The chevron is
    // at the right side of the 260px sidebar, around y=200 on initial load.
    await page.mouse.click(223, 200);
    await waitForRepaint(page);
    await waitForRepaint(page);

    // Re-focus canvas for keyboard events (mouse click may shift DOM focus)
    await focusCanvas(page);
    await waitForRepaint(page);
    log('focused NavigationView, first category expanded');

    // Capture start time AFTER load and focus setup
    const startTime: number = await page.evaluate(() => performance.now());

    // ── Step 2: Navigate through every sample page ───────────────────────
    // The first category (Theming) is already expanded from the chevron click.
    // For each item we either expand (category) or navigate (sample).
    let firstCategory = true;
    for (let i = 0; i < NAV_ITEMS.length; i++) {
        const item = NAV_ITEMS[i];

        if (item.type === 'category') {
            if (firstCategory) {
                // Already expanded — just move focus into first child
                firstCategory = false;
                log(`${item.name} (already expanded)`);
            } else {
                // Expand the category with Space
                log(`expanding: ${item.name}`);
                await page.keyboard.press('Space');
                await waitForRepaint(page);
                await waitForRepaint(page);
            }
            // Move focus into the first child
            await page.keyboard.press('ArrowDown');
            await waitForRepaint(page);
        } else {
            // Select the sample (navigate to its page)
            log(`visiting: ${item.name}`);
            await page.keyboard.press('Enter');
            await waitForRepaint(page);
            await waitForRepaint(page);
            await waitForRepaint(page);

            // Move to next item if there is one
            const next = i + 1 < NAV_ITEMS.length ? NAV_ITEMS[i + 1] : null;
            if (next) {
                await page.keyboard.press('ArrowDown');
                await waitForRepaint(page);
            }
        }
    }

    // ── Step 3: Measure elapsed time ─────────────────────────────────────
    const endTime: number = await page.evaluate(() => performance.now());
    const duration = Math.round(endTime - startTime);
    log(`walkthrough complete: ${duration}ms (${NAV_ITEMS.filter(i => i.type === 'sample').length} samples visited)`);

    return endTime - startTime;
}
