import { execCapture } from '../exec.js';
import { info } from '../log.js';

// ── Constants ────────────────────────────────────────────────────────────────

export const GITHUB_API = 'https://api.github.com';
export const GITHUB_RAW = 'https://raw.githubusercontent.com';
export const NUGET_FLAT = 'https://api.nuget.org/v3-flatcontainer';
export const PRODUCT_COMMIT_BASE = 'https://builds.dotnet.microsoft.com/dotnet/Sdk';
export const RELEASES_INDEX_URL = 'https://builds.dotnet.microsoft.com/dotnet/release-metadata/releases-index.json';

// ── GitHub token resolution ──────────────────────────────────────────────────

let cachedToken: string | undefined;
let tokenResolved = false;

/**
 * Resolve a GitHub token. Checks GITHUB_TOKEN / GH_TOKEN env vars first,
 * then falls back to `gh auth token` (gh CLI).
 */
export async function resolveGitHubToken(): Promise<string | undefined> {
    if (tokenResolved) return cachedToken;
    tokenResolved = true;

    const envToken = process.env['GITHUB_TOKEN'] || process.env['GH_TOKEN'];
    if (envToken) {
        cachedToken = envToken;
        return cachedToken;
    }

    try {
        const token = await execCapture('gh', ['auth', 'token'], { throwOnError: false });
        if (token && token.length > 0 && !token.includes(' ')) {
            cachedToken = token;
        }
    } catch {
        // gh CLI not installed or not logged in — no token
    }

    return cachedToken;
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

export function githubHeaders(token?: string): Record<string, string> {
    const h: Record<string, string> = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'macro-benchmarks-cli',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}

/**
 * Fetch JSON from a URL. Returns null on 404.
 * Retries with exponential backoff on rate-limit (403/429).
 * Throws after max retries.
 */
export async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
    const maxRetries = 5;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const resp = await fetch(url, { headers });
        if (resp.ok) return await resp.json() as T;

        if (resp.status === 404) return null;

        if (resp.status === 403 || resp.status === 429) {
            const body = await resp.text().catch(() => '');
            if (attempt === maxRetries) {
                throw new Error(`Rate limited (${resp.status}) fetching ${url}: ${body.slice(0, 200)}`);
            }
            // Use Retry-After header, X-RateLimit-Reset, or exponential backoff
            let delaySec = Math.pow(2, attempt + 1); // 2, 4, 8, 16, 32
            const retryAfter = resp.headers.get('Retry-After');
            const rateLimitReset = resp.headers.get('X-RateLimit-Reset');
            if (retryAfter) {
                delaySec = Math.max(parseInt(retryAfter, 10) || delaySec, 1);
            } else if (rateLimitReset) {
                const resetTime = parseInt(rateLimitReset, 10) * 1000;
                const waitMs = resetTime - Date.now();
                if (waitMs > 0 && waitMs < 120_000) delaySec = Math.ceil(waitMs / 1000);
            }
            info(`Rate limited (${resp.status}), retrying in ${delaySec}s (attempt ${attempt + 1}/${maxRetries})...`);
            await new Promise(r => setTimeout(r, delaySec * 1000));
            continue;
        }

        // Other errors — return null (transient / unknown)
        return null;
    }
    return null;
}

/**
 * HEAD request — returns true if the URL exists (2xx).
 */
export async function headOk(url: string): Promise<boolean> {
    const resp = await fetch(url, { method: 'HEAD' });
    return resp.ok;
}

// ── Concurrency limiter ──────────────────────────────────────────────────────

/**
 * Map an array through an async function with bounded concurrency.
 */
export async function mapConcurrent<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>,
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let idx = 0;

    async function worker(): Promise<void> {
        while (idx < items.length) {
            const i = idx++;
            results[i] = await fn(items[i]);
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
}
