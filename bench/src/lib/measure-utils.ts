import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, readdir, stat, access } from 'node:fs/promises';
import { join, extname, resolve, normalize } from 'node:path';
import type { SdkInfo } from '../context.js';
import type { MetricKey } from '../enums.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface StaticServer {
    port: number;
    /** Number of HTTP requests served since last reset. */
    readonly requestCount: number;
    /** Returns the current request count and resets the counter to 0. */
    resetRequestCount: () => number;
    close: () => Promise<void>;
}

export interface FileSizes {
    diskSizeNative: number;
    diskSizeAssemblies: number;
}

// ── MIME Types ───────────────────────────────────────────────────────────────

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
    '.dat': 'application/octet-stream',
    '.dll': 'application/octet-stream',
    '.pdb': 'application/octet-stream',
    '.blat': 'application/octet-stream',
    '.bin': 'application/octet-stream',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
};

// ── Static HTTP Server ───────────────────────────────────────────────────────

/**
 * Start a static HTTP server with COOP/COEP headers required for
 * SharedArrayBuffer support (needed by .NET threading).
 *
 * Includes path traversal protection.
 */
export function startStaticServer(webRoot: string, port = 0): Promise<StaticServer> {
    const root = resolve(webRoot);
    const etag = '"' + Date.now().toString(36) + '"';
    let requestCount = 0;

    return new Promise((resolveP, reject) => {
        const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
            requestCount++;
            let filePath: string | undefined;
            try {
                let urlPath = new URL(req.url || '/', `http://localhost`).pathname;
                if (urlPath === '/') urlPath = '/index.html';

                // Path traversal protection
                filePath = normalize(join(root, urlPath));
                if (!filePath.startsWith(root)) {
                    res.writeHead(403);
                    res.end('Forbidden');
                    return;
                }

                const ext = extname(filePath).toLowerCase();
                const mime = MIME_TYPES[ext] ?? 'application/octet-stream';

                // Negotiate pre-compressed variants (.br / .gz on disk)
                const accept = req.headers['accept-encoding'] || '';
                let servePath = filePath;
                let encoding: string | undefined;
                if (accept.includes('br')) {
                    try { await access(filePath + '.br'); servePath = filePath + '.br'; encoding = 'br'; }
                    catch { /* no .br variant */ }
                }
                if (!encoding && accept.includes('gzip')) {
                    try { await access(filePath + '.gz'); servePath = filePath + '.gz'; encoding = 'gzip'; }
                    catch { /* no .gz variant */ }
                }

                const content = await readFile(servePath);

                // ETag-based caching: return 304 if content unchanged
                const ifNoneMatch = req.headers['if-none-match'];
                if (ifNoneMatch === etag) {
                    res.writeHead(304, {
                        'ETag': etag,
                        'Cache-Control': 'max-age=600',
                        'Cross-Origin-Opener-Policy': 'same-origin',
                        'Cross-Origin-Embedder-Policy': 'require-corp',
                    });
                    res.end();
                    return;
                }

                const headers: Record<string, string | number> = {
                    'Content-Type': mime,
                    'Content-Length': content.length,
                    'ETag': etag,
                    'Cache-Control': 'max-age=600',
                    'Cross-Origin-Opener-Policy': 'same-origin',
                    'Cross-Origin-Embedder-Policy': 'require-corp',
                    'Timing-Allow-Origin': '*',
                };
                if (encoding) headers['Content-Encoding'] = encoding;

                res.writeHead(200, headers);
                res.end(content);
            } catch (e: unknown) {
                const code = (e as NodeJS.ErrnoException).code;
                if (code === 'ENOENT' || code === 'EISDIR') {
                    // SPA fallback: serve index.html for extensionless paths
                    // (standard Blazor WASM / SPA hosting behaviour)
                    if (filePath != null && !extname(filePath)) {
                        try {
                            const fallback = join(root, 'index.html');
                            const content = await readFile(fallback);
                            res.writeHead(200, {
                                'Content-Type': 'text/html',
                                'Content-Length': content.length,
                                'Cross-Origin-Opener-Policy': 'same-origin',
                                'Cross-Origin-Embedder-Policy': 'require-corp',
                                'Timing-Allow-Origin': '*',
                            });
                            res.end(content);
                            return;
                        } catch { /* index.html not found, fall through to 404 */ }
                    }
                    res.writeHead(404);
                    res.end('Not Found');
                } else {
                    res.writeHead(500);
                    res.end('Internal Server Error');
                }
            }
        });

        server.listen(port, '127.0.0.1', () => {
            const addr = server.address();
            const assignedPort = typeof addr === 'object' && addr ? addr.port : port;
            resolveP({
                port: assignedPort,
                get requestCount() { return requestCount; },
                resetRequestCount: () => { const v = requestCount; requestCount = 0; return v; },
                close: () => new Promise<void>((r) => server.close(() => r())),
            });
        });

        server.on('error', reject);
    });
}

// ── File Size Measurement ────────────────────────────────────────────────────

/**
 * Walk the web root directory and compute disk sizes:
 * - total: all files
 * - wasm: *.wasm files in _framework/
 * - dlls: *.dll files in _framework/
 */
export async function measureFileSizes(webRoot: string, compressed: boolean): Promise<FileSizes> {
    let diskSizeNative = 0;
    let diskSizeAssemblies = 0;

    const entries = await readdir(webRoot, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const parentPath = entry.parentPath || entry.path;
        const fullPath = join(parentPath, entry.name);
        const s = await stat(fullPath);

        // Check if file is inside _framework/ subdirectory
        const relativePath = fullPath.slice(webRoot.length);
        const inFramework = relativePath.includes('_framework');

        if (inFramework) {
            if (compressed) {
                if (entry.name.startsWith('dotnet.native') && entry.name.endsWith('.wasm.br')) {
                    diskSizeNative += s.size;
                } else if (entry.name.endsWith('.dll.br') || entry.name.endsWith('.wasm.br')) {
                    diskSizeAssemblies += s.size;
                }
            } else {
                if (entry.name.startsWith('dotnet.native') && entry.name.endsWith('.wasm')) {
                    diskSizeNative += s.size;
                } else if (entry.name.endsWith('.dll') || entry.name.endsWith('.wasm')) {
                    diskSizeAssemblies += s.size;
                }
            }
        }
    }

    return { diskSizeNative: diskSizeNative, diskSizeAssemblies: diskSizeAssemblies };
}

// ── Integrity Verification ───────────────────────────────────────────────────

/**
 * Verify that the publish directory matches the expected integrity from the
 * build manifest. Returns true if valid, false if mismatch.
 */
export async function verifyIntegrity(
    publishDir: string,
    expected: { fileCount: number; totalBytes: number },
): Promise<{ valid: boolean; actual: { fileCount: number; totalBytes: number } }> {
    let fileCount = 0;
    let totalBytes = 0;
    const entries = await readdir(publishDir, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const parentPath = entry.parentPath || entry.path;
        const fullPath = join(parentPath, entry.name);
        const s = await stat(fullPath);
        fileCount++;
        totalBytes += s.size;
    }
    return {
        valid: fileCount === expected.fileCount && totalBytes === expected.totalBytes,
        actual: { fileCount, totalBytes },
    };
}

// ── Result JSON Builder ──────────────────────────────────────────────────────

/**
 * Build the result JSON object.
 * - Strips null/undefined metrics
 * - Rounds all numeric values to integers
 */
export function buildResultJson(
    meta: Record<string, unknown>,
    metrics: Partial<Record<MetricKey, number | null>>,
): { meta: Record<string, unknown>; metrics: Record<string, number> } {
    const cleanMetrics: Record<string, number> = {};
    for (const [key, value] of Object.entries(metrics)) {
        if (value != null && Number.isFinite(value)) {
            cleanMetrics[key] = Math.round(value);
        }
    }
    return { meta, metrics: cleanMetrics };
}

// ── Compile Time Reader ──────────────────────────────────────────────────────

/**
 * Read compile-time.json from a publish directory.
 */
export async function readCompileTime(publishDir: string): Promise<number | null> {
    try {
        const raw = await readFile(join(publishDir, 'compile-time.json'), 'utf-8');
        const data = JSON.parse(raw);
        return typeof data.compileTimeMs === 'number' ? data.compileTimeMs : null;
    } catch {
        return null;
    }
}

// ── Result Filename Builder ──────────────────────────────────────────────────

/**
 * Build the result filename following the convention:
 * {runtimeCommitDateTime}_{hash7}_{runtime}_{preset}_{profile}_{engine}_{app}.json
 */
export function buildResultFilename(
    sdkInfo: SdkInfo,
    runtime: string,
    preset: string,
    profile: string,
    engine: string,
    app: string,
): string {
    const dateTime = sdkInfo.runtimeCommitDateTime.replace(/:/g, '-');
    const hash7 = sdkInfo.runtimeGitHash.slice(0, 7);
    return `${dateTime}_${hash7}_${runtime}_${preset}_${profile}_${engine}_${app}.json`;
}

// ── CLI Entry File Finder ────────────────────────────────────────────────────

/**
 * Find the main entry script (may be fingerprinted) in a publish wwwroot directory.
 * Looks for main*.mjs or main*.js.
 */
export async function findEntryFile(webRoot: string): Promise<string> {
    const files = await readdir(webRoot);
    const entry = files.find(f =>
        (f.startsWith('main') && (f.endsWith('.mjs') || f.endsWith('.js'))),
    );
    if (!entry) {
        throw new Error(`Entry file (main*.mjs or main*.js) not found in ${webRoot}. Files: ${files.join(', ')}`);
    }
    return entry;
}
