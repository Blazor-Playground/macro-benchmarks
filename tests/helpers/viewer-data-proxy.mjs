import { createServer, request as httpRequest } from 'node:http';

const dataPrefix = '/macro-benchmarks/data/views/';

export async function startViewerDataProxy(staticPort, dataRoot, port = 0, logError = console.error) {
    const root = new URL(dataRoot);
    if (!['http:', 'https:'].includes(root.protocol) || root.username || root.password || root.search || root.hash) {
        throw new Error('VIEWER_DATA_URL must be an HTTP(S) data directory without credentials, query or fragment.');
    }
    if (!root.pathname.endsWith('/')) root.pathname += '/';

    const server = createServer((request, response) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.writeHead(405, { Allow: 'GET, HEAD' });
            response.end('Only GET and HEAD are supported.');
            return;
        }
        const path = new URL(request.url, 'http://127.0.0.1').pathname;
        if (!path.startsWith(dataPrefix)) {
            const upstream = httpRequest({
                hostname: '127.0.0.1', port: staticPort, method: request.method, path: request.url,
                headers: {
                    ...(request.headers['accept-encoding'] ? { 'accept-encoding': request.headers['accept-encoding'] } : {}),
                },
            }, incoming => {
                // Preview assets can change on republish without changing their URL.
                const headers = { ...incoming.headers, 'cache-control': 'no-store' };
                delete headers.etag;
                response.writeHead(incoming.statusCode, headers);
                incoming.pipe(response);
                incoming.on('error', error => {
                    logError(`Viewer static response failed: ${error.message}`);
                    response.destroy(error);
                });
            });
            upstream.on('error', error => {
                if (response.destroyed) return;
                logError(`Viewer static request failed: ${error.message}`);
                response.writeHead(502, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
                response.end('The local viewer asset server is unavailable.');
            });
            response.on('close', () => upstream.destroy());
            upstream.end();
            return;
        }

        const relative = path.slice(dataPrefix.length);
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*\.json$/.test(relative)
            || relative.split('/').some(segment => segment === '.' || segment === '..' || segment === '')) {
            response.writeHead(400, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
            response.end('Invalid dashboard data path.');
            return;
        }
        const controller = new AbortController();
        response.on('close', () => controller.abort());
        const target = new URL(relative, root);
        // A failing configured source must not fall back to a different local publication.
        fetch(target, {
            method: request.method,
            headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
            cache: 'no-store',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        }).then(async upstream => {
            const content = Buffer.from(await upstream.arrayBuffer());
            if (response.destroyed) return;
            response.writeHead(upstream.status, {
                'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
                'Cache-Control': 'no-store',
                'X-Viewer-Data-Source': root.href,
            });
            response.end(content);
        }).catch(error => {
            if (controller.signal.aborted || response.destroyed) return;
            logError(`Viewer data request failed for ${target}: ${error.message}`);
            response.writeHead(502, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
            response.end('The configured dashboard data source is unavailable. No local snapshot was substituted.');
        });
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
    });
    return {
        port: server.address().port,
        close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
    };
}
