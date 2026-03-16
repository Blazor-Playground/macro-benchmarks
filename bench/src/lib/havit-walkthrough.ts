/**
 * havit-walkthrough.ts — Playwright walkthrough for Havit Bootstrap documentation app.
 *
 * Measures total wall-clock time from fresh navigation to completion.
 *
 * Steps: load home → click Documentation → visit every sidebar page across all categories
 *      → navigate to showcase → navigate home.
 */

import { debug } from '../log.js';

// Minimal Playwright Page type surface used by the walkthrough
type PlaywrightPage = {
    goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<unknown>;
    waitForSelector(selector: string, options?: { timeout?: number; state?: string }): Promise<unknown>;
    waitForFunction(fn: (() => boolean) | string, arg: unknown, options?: { timeout?: number }): Promise<unknown>;
    waitForURL(url: string | RegExp, options?: { timeout?: number }): Promise<unknown>;
    click(selector: string, options?: { timeout?: number }): Promise<void>;
    fill(selector: string, value: string, options?: { timeout?: number }): Promise<void>;
    selectOption(selector: string, values: { index: number }, options?: { timeout?: number }): Promise<unknown>;
    dispatchEvent(selector: string, type: string): Promise<void>;
    evaluate<T>(fn: (() => T) | ((arg: string) => T), arg?: string): Promise<T>;
    on(event: string, handler: (...args: unknown[]) => void): void;
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
 * Full walkthrough: navigates to home, then visits every sidebar page across
 * all categories. Returns wall-clock duration in ms.
 */
export async function runHavitWalkthrough(
    page: PlaywrightPage,
    url: string,
    timeout: number,
    verbose = false,
): Promise<number> {
    const t = timeout;
    const log = verbose ? (msg: string) => debug(`Havit: ${msg}`) : () => { };

    // ── Step 0: Load home ────────────────────────────────────────────────
    log('navigating to home...');
    await page.goto(url, { timeout: t, waitUntil: 'load' });
    await page.waitForFunction(
        () => (globalThis as Record<string, unknown>).bench_complete !== undefined,
        null, { timeout: t },
    );
    await page.waitForSelector('#done', { timeout: t });
    log('home loaded');

    // Capture start time AFTER navigation (page.goto resets performance.now())
    const startTime: number = await page.evaluate(() => performance.now());

    // ── Step 2: Visit every sidebar page ──────────────────────────────
    for (const [category, href] of SIDEBAR_ROUTES) {
        // Ensure the category is expanded (only click if currently collapsed)
        await page.evaluate((cat: string) => {
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
        }, category);
        // Wait for the collapse section link to become visible
        // Use $= (ends-with) because Blazor may render hrefs as full URLs
        await page.waitForSelector(
            `a.nav-link.hx-sidebar-item:not(.dropdown-item)[href$="${href}"]`,
            { timeout: t, state: 'visible' },
        );
        log(`clicking sidebar link: ${href}`);
        await page.click(
            `a.nav-link.hx-sidebar-item:not(.dropdown-item)[href$="${href}"]`,
            { timeout: t },
        );
        // Wait for navigation: match path portion of href (\b prevents partial matches)
        const basePath = href.split('#')[0];
        await page.waitForURL(new RegExp(basePath + '\\b'), { timeout: t });
        await page.waitForSelector('.doc-content h1', { timeout: t });
        log(`loaded: ${href}`);
    }

    // ── Step 3: Navigate to Showcase via navbar ──────────────────────────
    log('navigating to showcase via navbar...');
    await page.click('.nav-container a[href="showcase"]', { timeout: t });
    await page.waitForURL(/\/showcase/, { timeout: t });
    await page.waitForSelector('.showcase-list', { timeout: t });
    log('showcase loaded');

    // ── Step 4: Navigate back home via navbar ────────────────────────────
    log('navigating home via navbar...');
    await page.click('.nav-container a[href=""]', { timeout: t });
    await page.waitForSelector('h1#getting-started', { timeout: t });
    log('home loaded again');

    const endTime: number = await page.evaluate(() => performance.now());
    return endTime - startTime;
}
