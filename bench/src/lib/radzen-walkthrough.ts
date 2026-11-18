import type { Page } from 'playwright';
import { debug } from '../log.js';
import type { WalkthroughOpts } from './walkthrough-types.js';

const browserRadzenWalkthrough = async ({ timeout, verbose }: { timeout: number; verbose: boolean }): Promise<number> => {
    const routes = [...document.querySelectorAll<HTMLAnchorElement>('[data-benchmark-route]')]
        .map(link => link.getAttribute('data-benchmark-route')!);
    if (routes.length === 0 || new Set(routes).size !== routes.length) {
        throw new Error('Radzen gallery must expose a nonempty, unique walkthrough route list');
    }

    const navigate = async (route: string): Promise<void> => {
        const expectedUrl = new URL(route || '.', document.baseURI);
        const expectedRoute = `/${route}`;
        const content = document.querySelector<HTMLElement>('#page-content');
        if (!content) throw new Error('Radzen gallery content is missing');
        delete content.dataset.benchmarkRendered;

        const link = document.createElement('a');
        link.href = expectedUrl.href;
        document.body.appendChild(link);
        link.click();
        link.remove();

        const deadline = performance.now() + timeout;
        await new Promise<void>((resolve, reject) => {
            const check = (): void => {
                const error = document.querySelector<HTMLElement>('#blazor-error-ui');
                if (error && getComputedStyle(error).display !== 'none') {
                    reject(new Error(`Radzen failed rendering ${expectedRoute}: ${error.textContent}`));
                } else if (location.pathname === expectedUrl.pathname &&
                    document.querySelector<HTMLElement>('#page-content')?.dataset.benchmarkRendered === expectedRoute) {
                    resolve();
                } else if (performance.now() >= deadline) {
                    reject(new Error(`Radzen render timed out at ${expectedRoute}`));
                } else {
                    setTimeout(check, 16);
                }
            };
            check();
        });
    };

    const start = performance.now();
    for (const route of routes) {
        if (verbose) console.log(`[radzen-walkthrough] navigating to /${route}`);
        await navigate(route);
    }
    const duration = performance.now() - start;
    await navigate('');
    return duration;
};

/** Initial load and the final return home are excluded from the navigation timing. */
export async function runRadzenWalkthrough(opts: WalkthroughOpts<Page>): Promise<number> {
    const { page, url, timeout, verbose = false } = opts;
    if (!page) throw new Error('Radzen walkthrough requires a browser page');

    await page.goto(url, { timeout, waitUntil: 'load' });
    await page.waitForFunction(
        () => (globalThis as Record<string, unknown>).bench_complete === true &&
            document.querySelector<HTMLElement>('#page-content')?.dataset.benchmarkRendered === '/',
        null, { timeout },
    );
    // esbuild keepNames helpers must exist when Playwright serializes the function.
    await page.evaluate('globalThis.__name = (fn) => fn');
    const duration = await page.evaluate(browserRadzenWalkthrough, { timeout, verbose });
    if (verbose) debug(`Radzen walkthrough completed: ${Math.round(duration)}ms`);
    return duration;
}
