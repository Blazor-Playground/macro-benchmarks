export async function routeLocalNavigation(page, { focus = false, debug = false } = {}) {
    for (const [path, available] of [
        ['local-runtime-comparison.json', focus],
        ['local-debug/index.json', debug],
    ]) {
        await page.route(`**/data/${path}`, route => route.request().method() === 'HEAD'
            ? route.fulfill({ status: available ? 200 : 404, body: '' }) : route.fallback());
    }
}
