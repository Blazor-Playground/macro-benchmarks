import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { type BenchContext, type SdkInfo } from '../context.js';
import { info, banner, err } from '../log.js';
import {
    fetchJson, headOk, githubHeaders, resolveGitHubToken, mapConcurrent,
    GITHUB_API, GITHUB_RAW,
} from '../lib/http.js';
import {
    parseArcadeDate, deriveSdkVersion, populateVersionFields,
} from '../lib/version-utils.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface DailyPacksList {
    feed: string;
    major: number;
    months: number;
    totalPacks: number;
    packs: SdkInfo[];
}

// ── Remote types ─────────────────────────────────────────────────────────────

interface NuGetServiceIndex {
    resources: Array<{ '@type': string; '@id': string }>;
}

interface NuGetFlatIndex {
    versions: string[];
}

interface ProductCommit {
    runtime: { commit: string; version: string };
    aspnetcore: { commit: string; version: string };
    sdk: { commit: string; version: string };
}

interface SourceManifest {
    repositories: Array<{ path: string; commitSha: string; remoteUri: string }>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const NUGET_FEED_BASE = 'https://pkgs.dev.azure.com/dnceng/public/_packaging';
const RUNTIME_PACK_ID = 'microsoft.netcore.app.runtime.mono.browser-wasm';
const WORKLOAD_PACK_ID = 'microsoft.net.sdk.webassembly.pack';
const SDK_CDN = 'https://ci.dot.net/public/Sdk';
const CONCURRENCY = 10;

// ── NuGet feed discovery ─────────────────────────────────────────────────────

async function discoverFlatBaseUrl(feedUrl: string): Promise<string> {
    const svc = await fetchJson<NuGetServiceIndex>(feedUrl);
    if (!svc) throw new Error(`Failed to fetch NuGet service index: ${feedUrl}`);

    const flat = svc.resources.find(r =>
        r['@type'].startsWith('PackageBaseAddress'),
    );
    if (!flat) throw new Error(`No PackageBaseAddress in NuGet service index`);

    return flat['@id'].replace(/\/$/, '');
}

// ── Per-version resolution ───────────────────────────────────────────────────

async function resolveVersion(
    runtimePackVersion: string,
    workloadVersions: Set<string>,
    token: string | undefined,
    verbose: boolean,
): Promise<SdkInfo | null> {
    const sdkVersion = deriveSdkVersion(runtimePackVersion);
    const label = runtimePackVersion;

    // 1. Validate SDK exists on CDN
    const sdkZipUrl = `${SDK_CDN}/${sdkVersion}/dotnet-sdk-${sdkVersion}-win-x64.zip`;
    if (!await headOk(sdkZipUrl)) {
        err(`${label}: SDK zip 404 — skipping`);
        return null;
    }

    // 2. Fetch productCommit
    const pcUrl = `${SDK_CDN}/${sdkVersion}/productCommit-win-x64.json`;
    const pc = await fetchJson<ProductCommit>(pcUrl);
    if (!pc) {
        err(`${label}: productCommit 404 — skipping`);
        return null;
    }

    const vmrCommit = pc.sdk.commit;

    // 3. Fetch source-manifest.json
    const smUrl = `${GITHUB_RAW}/dotnet/dotnet/${vmrCommit}/src/source-manifest.json`;
    const sm = await fetchJson<SourceManifest>(smUrl);
    if (!sm) {
        err(`${label}: source-manifest.json failed — skipping`);
        return null;
    }

    const findRepo = (path: string) => sm.repositories.find(r => r.path === path);
    const rtRepo = findRepo('runtime');
    const aspRepo = findRepo('aspnetcore');
    const sdkRepo = findRepo('sdk');
    if (!rtRepo || !aspRepo || !sdkRepo) {
        err(`${label}: source-manifest.json missing repos — skipping`);
        return null;
    }

    // 4. Bootstrap SDK from VMR global.json
    const gjUrl = `${GITHUB_RAW}/dotnet/dotnet/${vmrCommit}/global.json`;
    const gj = await fetchJson<{ tools?: { dotnet?: string } }>(gjUrl);
    if (!gj?.tools?.dotnet) {
        err(`${label}: VMR global.json failed — skipping`);
        return null;
    }

    // 5. GitHub commit datetimes
    const ghHeaders = githubHeaders(token);
    const [rtCommit, aspCommit] = await Promise.all([
        fetchJson<{ commit: { message: string; author: { name: string }; committer: { date: string } } }>(
            `${GITHUB_API}/repos/dotnet/runtime/commits/${rtRepo.commitSha}`, ghHeaders,
        ),
        fetchJson<{ commit: { committer: { date: string } } }>(
            `${GITHUB_API}/repos/dotnet/aspnetcore/commits/${aspRepo.commitSha}`, ghHeaders,
        ),
    ]);

    if (!rtCommit) {
        err(`${label}: runtime commit not found on GitHub — skipping`);
        return null;
    }
    if (!aspCommit) {
        err(`${label}: aspnetcore commit not found on GitHub — skipping`);
        return null;
    }

    // 6. Workload validation (checked against pre-fetched index)
    if (!workloadVersions.has(runtimePackVersion)) {
        err(`${label}: workload pack not found — skipping`);
        return null;
    }

    if (verbose) {
        info(`Resolved ${label}`);
    }

    return populateVersionFields({
        sdkVersion,
        runtimeGitHash: rtRepo.commitSha,
        aspnetCoreGitHash: aspRepo.commitSha,
        sdkGitHash: sdkRepo.commitSha,
        vmrGitHash: vmrCommit,
        runtimeCommitDateTime: rtCommit.commit.committer.date,
        runtimeCommitAuthor: rtCommit.commit.author.name,
        runtimeCommitMessage: rtCommit.commit.message.split('\n')[0],
        aspnetCoreCommitDateTime: aspCommit.commit.committer.date,
        aspnetCoreVersion: pc.aspnetcore.version,
        runtimePackVersion,
        workloadVersion: runtimePackVersion,
        bootstrapSdkVersion: gj.tools.dotnet,
        releaseDate: parseArcadeDate(runtimePackVersion)?.toISOString().slice(0, 10) ?? '',
    });
}

// ── Existing file helpers ────────────────────────────────────────────────────

async function loadExisting(path: string): Promise<DailyPacksList | null> {
    if (!existsSync(path)) return null;
    try {
        const raw = await readFile(path, 'utf-8');
        const data = JSON.parse(raw) as DailyPacksList;
        if (data.packs?.length > 0) return data;
    } catch {
        // Corrupt file — treat as absent
    }
    return null;
}

// ── Stage ────────────────────────────────────────────────────────────────────

export async function run(ctx: BenchContext): Promise<BenchContext> {
    banner('Enumerate daily packs');

    const outputPath = join(ctx.artifactsDir, 'daily-packs-list.json');

    // Skip refresh if an explicit SDK version is given and already in either pack list
    if (ctx.sdkVersion && !ctx.forceEnumerate) {
        const cached = await loadExisting(outputPath);
        if (cached?.packs.some(p => p.sdkVersion === ctx.sdkVersion)) {
            info(`SDK version '${ctx.sdkVersion}' already in cached daily packs — skipping refresh`);
            return ctx;
        }
        const releasePath = join(ctx.artifactsDir, 'release-packs-list.json');
        if (existsSync(releasePath)) {
            try {
                const releaseData = JSON.parse(await readFile(releasePath, 'utf-8')) as { packs: Array<{ sdkVersion: string }> };
                if (releaseData.packs?.some(p => p.sdkVersion === ctx.sdkVersion)) {
                    info(`SDK version '${ctx.sdkVersion}' found in cached release packs — skipping daily refresh`);
                    return ctx;
                }
            } catch { /* ignore corrupt file */ }
        }
    }

    const major = ctx.major;
    const months = ctx.months;
    const feedUrl = `${NUGET_FEED_BASE}/dotnet${major}/nuget/v3/index.json`;

    info(`Feed: dotnet${major}  Major: ${major}  Window: ${months} months`);

    const token = await resolveGitHubToken();
    if (!token && ctx.verbose) {
        info('No GitHub token found (env vars or gh CLI) — unauthenticated requests (60 req/hr limit)');
    }

    // ── Step 1: Discover NuGet flat base URL ─────────────────────────────────

    const flatBaseUrl = await discoverFlatBaseUrl(feedUrl);
    if (ctx.verbose) info(`Flat base: ${flatBaseUrl}`);

    // ── Step 2: Fetch version indices ──────────────────────────────────────────

    const runtimeIndexUrl = `${flatBaseUrl}/${RUNTIME_PACK_ID}/index.json`;
    const workloadIndexUrl = `${flatBaseUrl}/${WORKLOAD_PACK_ID}/index.json`;

    const [idx, wlIdx] = await Promise.all([
        fetchJson<NuGetFlatIndex>(runtimeIndexUrl),
        fetchJson<NuGetFlatIndex>(workloadIndexUrl),
    ]);
    if (!idx) throw new Error(`Failed to fetch package index: ${runtimeIndexUrl}`);

    const workloadVersions = new Set(wlIdx?.versions ?? []);

    // ── Step 3: Filter by major + date window ────────────────────────────────

    const now = new Date();
    const cutoff = new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000);
    const majorPrefix = `${major}.`;

    const candidates = idx.versions.filter(v => {
        if (!v.startsWith(majorPrefix)) return false;
        const buildDate = parseArcadeDate(v);
        if (!buildDate) return false;
        return buildDate >= cutoff;
    });

    info(`${idx.versions.length} total versions, ${candidates.length} match .NET ${major} within ${months} months`);

    // ── Step 4: Incremental — filter out already-resolved ────────────────────

    const existing = ctx.forceEnumerate ? null : await loadExisting(outputPath);
    let toResolve: string[];
    const existingPacks: SdkInfo[] = existing?.packs ?? [];

    if (existing) {
        const knownVersions = new Set(existing.packs.map(p => p.runtimePackVersion));
        toResolve = candidates.filter(v => !knownVersions.has(v));
        info(`Incremental: ${toResolve.length} new versions to resolve (${knownVersions.size} cached)`);
    } else {
        toResolve = candidates;
        info(`Full resolve: ${toResolve.length} versions`);
    }

    // ── Step 5: Resolve concurrently ─────────────────────────────────────────

    const resolved = await mapConcurrent(toResolve, CONCURRENCY, async (version) => {
        return resolveVersion(version, workloadVersions, token, ctx.verbose);
    });

    const newPacks = resolved.filter((p): p is SdkInfo => p !== null);
    info(`Resolved ${newPacks.length}/${toResolve.length} versions`);

    // ── Step 6: Merge, prune, and sort ───────────────────────────────────────

    const mergedMap = new Map<string, SdkInfo>();
    for (const p of existingPacks) mergedMap.set(p.runtimePackVersion, p);
    for (const p of newPacks) mergedMap.set(p.runtimePackVersion, p);

    // Prune versions that have aged out of the window
    const allPacks = [...mergedMap.values()]
        .filter(p => {
            const buildDate = parseArcadeDate(p.runtimePackVersion);
            return buildDate && buildDate >= cutoff;
        })
        .sort((a, b) => b.runtimePackVersion.localeCompare(a.runtimePackVersion));

    // ── Step 7: Write output ─────────────────────────────────────────────────

    const result: DailyPacksList = {
        feed: feedUrl,
        major,
        months,
        totalPacks: allPacks.length,
        packs: allPacks,
    };

    await mkdir(ctx.artifactsDir, { recursive: true });
    await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    info(`Wrote ${allPacks.length} daily packs to ${outputPath}`);

    return ctx;
}
