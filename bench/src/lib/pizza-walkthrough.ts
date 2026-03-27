/**
 * pizza-walkthrough.ts — Full Playwright walkthrough for Blazing Pizza.
 *
 * All walkthrough steps run entirely inside the browser via a single
 * page.evaluate() call, eliminating Playwright round-trip overhead from
 * the benchmark measurement.
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
    evaluate<T>(fn: (() => T) | ((arg: unknown) => T), arg?: unknown): Promise<T>;
    on(event: string, handler: (...args: unknown[]) => void): void;
    off(event: string, handler: (...args: unknown[]) => void): void;
};

/**
 * Runs entirely inside the browser (passed to page.evaluate).
 * Exercises every page, clicks all major buttons, fills forms.
 * Returns wall-clock duration in ms.
 *
 * Arrow function to avoid bundler __name helper injection that breaks
 * Playwright's function serialization for page.evaluate().
 */
const browserWalkthrough = (args: unknown): Promise<number> => {
    const { timeout: t, verbose } = args as { timeout: number; verbose: boolean };

    // ── In-browser helpers ───────────────────────────────────────────
    const sel = (id: string) => `[data-testid="${id}"]`;
    const POLL_MS = 16;
    const RENDER_PREFIX = 'App rendered after navigation.';
    const log = verbose
        ? (msg: string) => console.log(`[pizza-walkthrough] ${msg}`)
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
        opts?: { state?: string; timeout?: number },
    ): Promise<Element> => {
        const state = opts?.state ?? 'visible';
        const deadline = performance.now() + (opts?.timeout ?? t);
        return new Promise((resolve, reject) => {
            const check = () => {
                if (performance.now() > deadline) {
                    reject(new Error(`waitForSelector("${selector}", state=${state}) timed out`));
                    return;
                }
                const el = document.querySelector(selector);
                if (state === 'hidden' || state === 'detached') {
                    if (!el || (el as HTMLElement).offsetParent === null) {
                        resolve(el ?? document.body);
                        return;
                    }
                } else {
                    // 'visible' or 'attached'
                    if (el && (state === 'attached' || (el as HTMLElement).offsetParent !== null)) {
                        resolve(el);
                        return;
                    }
                }
                setTimeout(check, POLL_MS);
            };
            check();
        });
    }

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
    }

    const click = (selector: string): void => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) throw new Error(`click: element not found: ${selector}`);
        el.click();
    };

    const fill = (selector: string, value: string): void => {
        const el = document.querySelector(selector) as HTMLInputElement | null;
        if (!el) throw new Error(`fill: element not found: ${selector}`);
        // Use the native setter to trigger framework bindings
        const nativeSet = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype, 'value',
        )?.set;
        if (nativeSet) nativeSet.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const selectOption = (selector: string, index: number): void => {
        const el = document.querySelector(selector) as HTMLSelectElement | null;
        if (!el) throw new Error(`selectOption: element not found: ${selector}`);
        el.selectedIndex = index;
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    // ── Walkthrough steps (timed) ────────────────────────────────────
    // Auto-accept confirm dialogs during the walkthrough
    const origConfirm = window.confirm;
    window.confirm = () => true;

    const startTime = performance.now();

    const steps = async (): Promise<number> => {
        try {
            // Step 1: Open dialog & cancel
            click(sel('pizza-special-1'));
            await waitForSelector(sel('dialog-container'), { state: 'visible' });
            log('dialog opened (pizza-special-1)');

            click(sel('cancel-button'));
            await waitForSelector(sel('dialog-container'), { state: 'hidden' });
            log('dialog cancelled');

            // Step 2: Configure pizza with toppings
            click(sel('pizza-special-2'));
            await waitForSelector(sel('dialog-container'), { state: 'visible' });
            log('dialog opened (pizza-special-2)');

            fill(sel('size-slider'), '15');
            await waitForSelector(sel('topping-select'));
            selectOption(sel('topping-select'), 1);
            log('topping added');

            click(sel('confirm-pizza-button'));
            await waitForSelector(sel('dialog-container'), { state: 'hidden' });
            await waitForSelector(sel('cart-item'));
            log('pizza confirmed, in cart');

            // Step 3: Add second pizza (defaults)
            click(sel('pizza-special-8'));
            await waitForSelector(sel('dialog-container'), { state: 'visible' });
            click(sel('confirm-pizza-button'));
            await waitForSelector(sel('dialog-container'), { state: 'hidden' });
            log('second pizza added');

            // Step 4: Remove a pizza from cart
            click(sel('remove-pizza'));
            log('pizza removed from cart');

            // Step 5: Checkout
            let renderPromise = waitForRenderComplete(t);
            click(sel('order-button'));
            await waitForSelector(sel('checkout-main'));
            await renderPromise;
            log('checkout page loaded');

            // Step 6: Fill address & place order
            fill(sel('address-name'), 'Test User');
            fill(sel('address-line1'), '123 Pizza Street');
            fill(sel('address-line2'), 'Suite 4');
            fill(sel('address-city'), 'London');
            fill(sel('address-region'), 'Greater London');
            fill(sel('address-postalcode'), 'EC1A 1BB');
            log('address filled');

            renderPromise = waitForRenderComplete(t);
            click(sel('place-order-button'));
            log('order submitted, waiting for tracking page...');

            // Step 8: Order tracking page
            await waitForUrl(/\/myorders\/\d+/);
            log('navigated to order tracking URL');
            await waitForSelector(sel('track-order'));
            await waitForSelector(sel('order-status'));
            await renderPromise;
            log('tracking page rendered');

            // Step 9: My Orders list
            renderPromise = waitForRenderComplete(t);
            click(sel('nav-my-orders'));
            await waitForSelector(sel('myorders-main'));
            await renderPromise;
            log('my-orders page loaded');

            // Step 10: Track order from list
            renderPromise = waitForRenderComplete(t);
            await waitForSelector(sel('order-list-item'));
            click(sel('track-order-1'));
            await waitForSelector(sel('track-order'));
            await waitForSelector(sel('order-status'));
            await renderPromise;
            log('tracked order from list');

            // Step 11: Navigate home via nav tab
            renderPromise = waitForRenderComplete(t);
            click(sel('nav-get-pizza'));
            await waitForSelector(sel('pizza-cards'));
            await renderPromise;
            log('navigated home via nav');

            // Step 12: Add pizza & navigate via logo
            click(sel('pizza-special-3'));
            await waitForSelector(sel('dialog-container'), { state: 'visible' });
            click(sel('confirm-pizza-button'));
            await waitForSelector(sel('dialog-container'), { state: 'hidden' });
            renderPromise = waitForRenderComplete(t);
            click(sel('logo-link'));
            await waitForSelector(sel('pizza-cards'));
            await renderPromise;
            log('navigated home via logo');

            return performance.now() - startTime;
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
        // ── Step 0: Load home (via Playwright — not part of the timed section) ──
        log('navigating to home...');
        await page.goto(url, { timeout: t, waitUntil: 'load' });
        await page.waitForFunction(
            () => (globalThis as Record<string, unknown>).bench_complete !== undefined,
            null, { timeout: t },
        );
        await page.waitForSelector('[data-testid="pizza-cards"]', { timeout: t });
        await page.waitForSelector('[data-testid="pizza-special-1"]', { timeout: t });
        log('home loaded, specials rendered');

        // ── Run ALL walkthrough steps inside the browser ─────────────────────
        log('starting in-browser walkthrough...');
        // esbuild's keepNames injects __name() calls into the serialized function body;
        // provide the helper in the browser so they resolve at runtime.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.evaluate(() => { (globalThis as any).__name = (fn: any) => fn; });
        const duration: number = await page.evaluate(browserWalkthrough, { timeout: t, verbose });

        log(`in-browser walkthrough completed: ${Math.round(duration)}ms`);
        return duration;
    } finally {
        page.off('dialog', dialogHandler);
    }
}
