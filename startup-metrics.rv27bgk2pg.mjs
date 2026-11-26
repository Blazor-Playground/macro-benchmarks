export function afterPaintOpportunity(callback) {
    requestAnimationFrame(() => requestAnimationFrame(callback));
}

export function whenContentIsPresent(selector, callback) {
    const check = () => {
        const element = document.querySelector(selector);
        if (!element) return;
        observer.disconnect();
        callback(element);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    check();
    return () => observer.disconnect();
}

export function registerDomFirstInteraction(triggerSelector, responseSelector) {
    globalThis.benchStartFirstInteraction = timeout => {
        const trigger = document.querySelector(triggerSelector);
        if (!(trigger instanceof HTMLElement)) throw new Error(`Missing first-interaction trigger: ${triggerSelector}`);
        if (document.querySelector(responseSelector)) throw new Error(`First-interaction response already exists: ${responseSelector}`);

        return new Promise((resolve, reject) => {
            const stopObserving = whenContentIsPresent(responseSelector, element => afterPaintOpportunity(() => {
                clearTimeout(timer);
                if (!element.isConnected) {
                    reject(new Error(`First-interaction response disappeared before its paint opportunity: ${responseSelector}`));
                    return;
                }
                resolve(performance.now() - start);
            }));
            const timer = setTimeout(() => {
                stopObserving();
                reject(new Error(`Timed out waiting for first-interaction response: ${responseSelector}`));
            }, timeout);
            const start = performance.now();
            trigger.click();
        });
    };
}

export function observeInitialContent(selector) {
    if (location.pathname !== new URL(document.baseURI).pathname) return;
    const observe = () => whenContentIsPresent(selector, element => {
        globalThis.bench_content_ready ??= performance.now();
        afterPaintOpportunity(() => {
            if (element.isConnected) globalThis.bench_first_render ??= performance.now();
            else observe();
        });
    });
    observe();
}
