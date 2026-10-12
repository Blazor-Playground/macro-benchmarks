import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = dirname(fileURLToPath(import.meta.url));
const artifacts = join(root, 'artifacts');
const sdk = JSON.parse(await readFile(join(root, 'global.json'), 'utf8')).sdk.version;
const windows = process.platform === 'win32';
const dotnet = join(root, '.dotnet', windows ? 'dotnet.exe' : 'dotnet');
const publish = join(artifacts, 'publish');
const webRoot = join(publish, 'wwwroot');

function run(command, args) {
    const { error, status, signal } = spawnSync(command, args, {
        cwd: root, stdio: 'inherit',
        env: { ...process.env, DOTNET_ROOT: join(root, '.dotnet'), DOTNET_NOLOGO: '1' },
    });
    if (error) throw error;
    if (status !== 0) throw new Error(`${command} failed with ${signal ?? status}`);
}

async function setup() {
    await mkdir(artifacts, { recursive: true });
    if (!existsSync(join(root, '.dotnet', 'sdk', sdk))) {
        const script = windows ? 'dotnet-install.ps1' : 'dotnet-install.sh';
        const response = await fetch(`https://dot.net/v1/${script}`);
        if (!response.ok) throw new Error(`SDK installer download failed: HTTP ${response.status}`);
        const path = join(artifacts, script);
        await writeFile(path, await response.text());
        run(windows ? 'powershell.exe' : 'bash', windows
            ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path, '-Version', sdk,
                '-InstallDir', join(root, '.dotnet'), '-AzureFeed', 'https://ci.dot.net/public', '-NoPath']
            : [path, '--version', sdk, '--install-dir', join(root, '.dotnet'),
                '--azure-feed', 'https://ci.dot.net/public', '--no-path']);
    }
    run(dotnet, ['--version']);
    run(process.execPath, [join(root, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium']);
}

async function build(args, configuration) {
    await rm(publish, { recursive: true, force: true });
    // This preview SDK can omit CoreLib on incremental R2R publish, even after dotnet clean.
    await rm(join(root, 'src', 'havit-bootstrap', 'obj'), { recursive: true, force: true });
    await rm(join(root, 'src', 'havit-bootstrap', 'bin'), { recursive: true, force: true });
    const publishArgs = [
        'publish', 'src/havit-bootstrap/HavitBootstrap.csproj', '-c', configuration,
        '-o', publish, `-bl:${join(artifacts, 'publish.binlog')}`, '-m:1', ...args,
    ];
    run(dotnet, publishArgs);
    return { sdk, arguments: publishArgs };
}

export async function fileSizes(directory) {
    const files = (await readdir(directory, { recursive: true, withFileTypes: true }))
        .filter(entry => entry.isFile() && !/\.(br|gz)$/.test(entry.name))
        .map(entry => join(entry.parentPath, entry.name));
    const total = { rawBytes: 0, brotliBytes: 0 };
    const framework = { rawBytes: 0, brotliBytes: 0 };
    for (const path of files) {
        const name = relative(directory, path).split(sep).join('/');
        const rawBytes = (await stat(path)).size;
        const brotliBytes = existsSync(`${path}.br`) ? (await stat(`${path}.br`)).size : rawBytes;
        const sizes = { rawBytes, brotliBytes };
        for (const key of Object.keys(sizes)) {
            total[key] += sizes[key];
            if (name.startsWith('_framework/')) framework[key] += sizes[key];
        }
    }
    return { total, framework };
}

const mimeTypes = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
    '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.woff': 'font/woff', '.woff2': 'font/woff2',
};

export async function startServer(directory, port = 0) {
    const base = resolve(directory);
    if (!existsSync(join(base, 'index.html'))) throw new Error(`Published app not found in ${base}.`);
    const server = createServer(async (request, response) => {
        response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        response.setHeader('Vary', 'Accept-Encoding');
        try {
            if (!['GET', 'HEAD'].includes(request.method)) {
                response.setHeader('Allow', 'GET, HEAD');
                throw Object.assign(new Error('Method not allowed'), { status: 405 });
            }
            const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
            if (pathname.includes('\\') || pathname.includes('\0') || pathname.includes(':')) {
                throw Object.assign(new Error('Invalid path'), { status: 400 });
            }
            if (pathname.split('/').includes('..')) {
                throw Object.assign(new Error('Forbidden'), { status: 403 });
            }
            let path = join(base, pathname);
            if (pathname === '/' || (!existsSync(path) && !extname(path))) path = join(base, 'index.html');
            const contentType = mimeTypes[extname(path)] ?? 'application/octet-stream';
            const encodings = (request.headers['accept-encoding'] ?? '').split(',')
                .map(value => {
                    const [name, parameter] = value.trim().split(';');
                    return { name, quality: parameter ? Number(parameter.trim().replace('q=', '')) : 1 };
                }).filter(value => ['br', 'gzip'].includes(value.name) && value.quality > 0)
                .sort((a, b) => b.quality - a.quality || (a.name === 'br' ? -1 : 1));
            for (const { name } of encodings) {
                const variant = `${path}.${name === 'br' ? 'br' : 'gz'}`;
                if (existsSync(variant)) {
                    path = variant;
                    response.setHeader('Content-Encoding', name);
                    break;
                }
            }
            const content = await readFile(path);
            response.writeHead(200, {
                'Content-Type': contentType, 'Content-Length': content.length,
                'Cache-Control': contentType === 'text/html' ? 'no-cache' : 'public, max-age=3600',
            });
            response.end(request.method === 'HEAD' ? undefined : content);
        } catch (error) {
            const status = error instanceof URIError ? 400
                : ['ENOENT', 'EISDIR', 'ENOTDIR'].includes(error.code) ? 404 : error.status ?? 500;
            if (status === 500) console.error(error);
            response.writeHead(status).end(status === 500 ? 'Server error' : 'Request failed');
        }
    });
    await new Promise((resolveListening, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolveListening);
    });
    return {
        url: `http://127.0.0.1:${server.address().port}/`,
        close: () => new Promise((resolveClosed, reject) =>
            server.close(error => error ? reject(error) : resolveClosed())),
    };
}

export function summarize(values) {
    if (!values.length || values.some(value => !Number.isFinite(value) || value < 0)) {
        throw new Error('Measurements must be finite non-negative numbers.');
    }
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return {
        min: sorted[0],
        median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
        max: sorted.at(-1),
    };
}

async function measure(url, buildInfo) {
    const runs = 5;
    const sizes = await fileSizes(webRoot);
    const samples = [];
    let browserVersion;
    for (let i = 0; i < runs; i++) {
        // A new process isolates both the HTTP cache and V8's compiled-WASM cache.
        const browser = await chromium.launch();
        try {
            browserVersion = browser.version();
            const page = await browser.newPage({
                viewport: { width: 1280, height: 720 }, serviceWorkers: 'block',
            });
            page.setDefaultTimeout(60000);
            await page.addInitScript(() => {
                performance.setResourceTimingBufferSize(10000);
                performance.addEventListener('resourcetimingbufferfull', () => {
                    globalThis.havitTimingOverflow = true;
                });
            });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            page.on('console', message => {
                if (message.type() === 'error') errors.push(message.text());
            });
            page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
            page.on('response', response => {
                if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
            });
            const sample = {};
            for (const cache of ['cold', 'warm']) {
                try {
                    await page.goto(url, { waitUntil: 'load' });
                    await page.waitForFunction(() => globalThis.havitStartup);
                    await page.getByRole('heading', { name: 'Getting started', exact: true }).waitFor();
                    await page.waitForLoadState('networkidle');
                } catch (error) {
                    throw new Error(`${cache} startup failed.\n${errors.join('\n')}`, { cause: error });
                }
                if (errors.length) throw new Error(errors.join('\n'));
                sample[cache] = await page.evaluate(() => {
                    if (globalThis.havitTimingOverflow) throw new Error('Resource timing buffer overflowed.');
                    const resources = [
                        ...performance.getEntriesByType('navigation'),
                        ...performance.getEntriesByType('resource'),
                    ];
                    return {
                        ...globalThis.havitStartup,
                        transferBytes: resources.reduce((sum, entry) => sum + entry.transferSize, 0),
                        resourceCount: resources.length,
                    };
                });
                if (sample[cache].managedMs <= 0 || sample[cache].renderedMs < sample[cache].managedMs) {
                    throw new Error(`Invalid startup markers: ${JSON.stringify(sample[cache])}`);
                }
            }
            samples.push(sample);
            console.log(`${i + 1}/${runs}: rendered cold ${sample.cold.renderedMs.toFixed(1)} ms, warm ${sample.warm.renderedMs.toFixed(1)} ms`);
        } finally {
            await browser.close();
        }
    }
    const summary = Object.fromEntries(['cold', 'warm'].map(cache => [
        cache, Object.fromEntries(['managedMs', 'renderedMs', 'transferBytes'].map(metric => [
            metric, summarize(samples.map(sample => sample[cache][metric])),
        ])),
    ]));
    const result = {
        measuredAt: new Date().toISOString(), build: buildInfo,
        browser: browserVersion, runs, sizes, summary, samples,
    };
    const resultsDir = join(artifacts, 'results');
    await mkdir(resultsDir, { recursive: true });
    const path = join(resultsDir, `${result.measuredAt.replace(/[:.]/g, '-')}.json`);
    await writeFile(path, JSON.stringify(result, null, 2) + '\n');
    console.log(`Median rendered: cold ${summary.cold.renderedMs.median.toFixed(1)} ms, warm ${summary.warm.renderedMs.median.toFixed(1)} ms`);
    console.log(`Median startup transfer: cold ${(summary.cold.transferBytes.median / 1048576).toFixed(2)} MiB, warm ${(summary.warm.transferBytes.median / 1024).toFixed(2)} KiB`);
    console.log(`Published payload: ${(sizes.total.rawBytes / 1048576).toFixed(2)} MiB raw, ${(sizes.total.brotliBytes / 1048576).toFixed(2)} MiB Brotli`);
    console.log(`Framework payload: ${(sizes.framework.rawBytes / 1048576).toFixed(2)} MiB raw, ${(sizes.framework.brotliBytes / 1048576).toFixed(2)} MiB Brotli`);
    console.log(`Results: ${path}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const debug = args.includes('--debug');
    const once = args.includes('--once');
    await setup();
    const buildInfo = await build(args.filter(arg => arg !== '--debug' && arg !== '--once'), debug ? 'Debug' : 'Release');
    const server = await startServer(webRoot, 5000);
    try {
        await measure(server.url, buildInfo);
    } catch (error) {
        await server.close();
        throw error;
    }
    if (once) {
        await server.close();
    } else {
        console.log(`Havit: ${server.url} (Ctrl+C to stop)`);
        process.once('SIGINT', () => server.close());
        process.once('SIGTERM', () => server.close());
    }
}
