/**
 * pizza-walkthrough.ts — Full Playwright walkthrough for Blazing Pizza.
 *
 * Measures total wall-clock time from fresh navigation to completion.
 *
 * Steps: load home → open dialog & cancel → configure pizza with toppings → add to cart
 *      → add second pizza → remove one pizza → checkout → trigger validation
 *      → fill address → place order → verify tracking → my orders list
 *      → track from list → navigate home via nav → add pizza & navigate via logo.
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
    off(event: string, handler: (...args: unknown[]) => void): void;
};

const sel = (id: string) => `[data-testid="${id}"]`;

/**
 * Full walkthrough: exercises every page, clicks all major buttons, fills forms.
 * Returns wall-clock duration in ms.
 */
export async function runPizzaWalkthrough(
    page: PlaywrightPage,
    url: string,
    timeout: number,
    verbose = false,
): Promise<number> {
    const t = timeout;
    const log = verbose ? (msg: string) => debug(`Pizza: ${msg}`) : () => { };

    // Handle confirm dialogs (remove-pizza triggers one)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dialogHandler = (dialog: any) => { void (dialog as { accept: () => Promise<void> }).accept(); };
    page.on('dialog', dialogHandler);

    try {
        // ── Step 0: Load home ────────────────────────────────────────────────
        log('navigating to home...');
        await page.goto(url, { timeout: t, waitUntil: 'load' });
        await page.waitForFunction(
            () => (globalThis as Record<string, unknown>).bench_complete !== undefined,
            null, { timeout: t },
        );
        await page.waitForSelector(sel('pizza-cards'), { timeout: t });
        await page.waitForSelector(sel('pizza-special-1'), { timeout: t });
        log('home loaded, specials rendered');

        // Capture start time AFTER navigation (page.goto resets performance.now())
        const startTime: number = await page.evaluate(() => performance.now());

        // ── Step 1: Open dialog & cancel ─────────────────────────────────────
        await page.click(sel('pizza-special-1'));
        await page.waitForSelector(sel('dialog-container'), { state: 'visible', timeout: t });
        log('dialog opened (pizza-special-1)');

        await page.click(sel('cancel-button'));
        await page.waitForSelector(sel('dialog-container'), { state: 'hidden', timeout: t });
        log('dialog cancelled');

        // ── Step 2: Configure pizza with toppings ────────────────────────────
        await page.click(sel('pizza-special-2'));
        await page.waitForSelector(sel('dialog-container'), { state: 'visible', timeout: t });
        log('dialog opened (pizza-special-2)');

        await page.fill(sel('size-slider'), '15');
        await page.dispatchEvent(sel('size-slider'), 'input');

        await page.waitForSelector(sel('topping-select'), { timeout: t });
        await page.selectOption(sel('topping-select'), { index: 1 });
        log('topping added');

        await page.click(sel('confirm-pizza-button'));
        await page.waitForSelector(sel('dialog-container'), { state: 'hidden', timeout: t });
        await page.waitForSelector(sel('cart-item'), { timeout: t });
        log('pizza confirmed, in cart');

        // ── Step 3: Add second pizza (defaults) ──────────────────────────────
        await page.click(sel('pizza-special-8'));
        await page.waitForSelector(sel('dialog-container'), { state: 'visible', timeout: t });
        await page.click(sel('confirm-pizza-button'));
        await page.waitForSelector(sel('dialog-container'), { state: 'hidden', timeout: t });
        log('second pizza added');

        // ── Step 4: Remove a pizza from cart ──────────────────────────────────
        await page.click(sel('remove-pizza'));
        // dialog handler auto-accepts the confirm
        log('pizza removed from cart');

        // ── Step 5: Checkout ─────────────────────────────────────────────────
        await page.click(sel('order-button'));
        await page.waitForSelector(sel('checkout-main'), { timeout: t });
        log('checkout page loaded');

        // ── Step 6: Fill address & place order ───────────────────────────────
        await page.fill(sel('address-name'), 'Test User');
        await page.fill(sel('address-line1'), '123 Pizza Street');
        await page.fill(sel('address-line2'), 'Suite 4');
        await page.fill(sel('address-city'), 'London');
        await page.fill(sel('address-region'), 'Greater London');
        await page.fill(sel('address-postalcode'), 'EC1A 1BB');
        log('address filled');

        await page.click(sel('place-order-button'));
        log('order submitted, waiting for navigation to tracking page...');

        // ── Step 8: Order tracking page ──────────────────────────────────────
        await page.waitForURL(/\/myorders\/\d+/, { timeout: t });
        log('navigated to order tracking URL');
        await page.waitForSelector(sel('track-order'), { timeout: t });
        await page.waitForSelector(sel('order-status'), { timeout: t });
        log('tracking page rendered');

        // ── Step 9: My Orders list ───────────────────────────────────────────
        await page.click(sel('nav-my-orders'));
        await page.waitForSelector(sel('myorders-main'), { timeout: t });
        log('my-orders page loaded');

        // ── Step 10: Track order from list ───────────────────────────────────
        await page.waitForSelector(sel('order-list-item'), { timeout: t });
        await page.click(sel('track-order-1'));
        await page.waitForSelector(sel('track-order'), { timeout: t });
        await page.waitForSelector(sel('order-status'), { timeout: t });
        log('tracked order from list');

        // ── Step 11: Navigate home via nav tab ───────────────────────────────
        await page.click(sel('nav-get-pizza'));
        await page.waitForSelector(sel('pizza-cards'), { timeout: t });
        log('navigated home via nav');

        // ── Step 12: Add pizza & navigate via logo ───────────────────────────
        await page.click(sel('pizza-special-3'));
        await page.waitForSelector(sel('dialog-container'), { state: 'visible', timeout: t });
        await page.click(sel('confirm-pizza-button'));
        await page.waitForSelector(sel('dialog-container'), { state: 'hidden', timeout: t });
        await page.click(sel('logo-link'));
        await page.waitForSelector(sel('pizza-cards'), { timeout: t });
        log('navigated home via logo');

        const endTime: number = await page.evaluate(() => performance.now());
        return endTime - startTime;
    }
    finally {
        page.off('dialog', dialogHandler);
    }
}
