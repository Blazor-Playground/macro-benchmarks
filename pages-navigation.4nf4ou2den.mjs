export function restorePagesRoute(baseUri, location, history) {
    const redirect = new URLSearchParams(location.search).get('redirect');
    if (redirect === null) return;

    const base = new URL(baseUri);
    let target;
    try {
        target = new URL(redirect, base);
    } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        console.warn('Ignoring a malformed GitHub Pages redirect.', error);
        return;
    }
    if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname) || target.username || target.password) {
        console.warn('Ignoring a GitHub Pages redirect outside the dashboard or with embedded credentials.');
        return;
    }

    history.replaceState(history.state, '', target.href);
}
