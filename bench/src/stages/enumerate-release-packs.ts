import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { type BenchContext, type SdkInfo } from '../context.js';
import { info, banner, err } from '../log.js';
import {
    fetchJson, headOk, githubHeaders, resolveGitHubToken, mapConcurrent,
    GITHUB_API, GITHUB_RAW, NUGET_FLAT, PRODUCT_COMMIT_BASE, RELEASES_INDEX_URL,
} from '../lib/http.js';
import { getFeatureBand, getVersionMajor, populateVersionFields } from '../lib/version-utils.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface ReleasePacksList {
    channels: string[];
    totalPacks: number;
    packs: SdkInfo[];
}

// ── Release metadata types ───────────────────────────────────────────────────

interface ReleasesIndex {
    'releases-index': Array<{
        'channel-version': string;
        'releases.json': string;
    }>;
}

interface ChannelRelease {
    'release-date': string;
    runtime: { version: string };
    sdks: Array<{ version: string }>;
}

interface ChannelReleases {
    releases: ChannelRelease[];
}

interface ProductCommit {
    runtime: { commit: string; version: string };
    aspnetcore: { commit: string; version: string };
    sdk: { commit: string; version: string };
    windowsdesktop?: { commit: string; version: string };
    installer?: { commit: string; version: string };
}

interface SourceManifest {
    repositories: Array<{
        path: string;
        commitSha: string;
        remoteUri: string;
    }>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const CONCURRENCY = 10;

// ── SDK band extraction ──────────────────────────────────────────────────────

function sdkFeatureBand(sdkVersion: string): number {
    return getFeatureBand(sdkVersion);
}

function pickLatestBandSdk(sdks: Array<{ version: string }>): string | null {
    if (sdks.length === 0) return null;
    let best = sdks[0];
    let bestBand = sdkFeatureBand(best.version);
    for (let i = 1; i < sdks.length; i++) {
        const band = sdkFeatureBand(sdks[i].version);
        if (band > bestBand) {
            best = sdks[i];
            bestBand = band;
        }
    }
    return best.version;
}

// ── Per-release resolution ───────────────────────────────────────────────────

interface ReleaseCandidate {
    runtimeVersion: string;
    sdkVersion: string;
    releaseDate: string;
}

async function resolveRelease(
    candidate: ReleaseCandidate,
    token: string | undefined,
    verbose: boolean,
): Promise<SdkInfo | null> {
    const { runtimeVersion, sdkVersion, releaseDate } = candidate;
    const label = `${runtimeVersion} (SDK ${sdkVersion})`;

    // 1. Fetch productCommit
    const pcUrl = `${PRODUCT_COMMIT_BASE}/${sdkVersion}/productCommit-win-x64.json`;
    const pc = await fetchJson<ProductCommit>(pcUrl);
    if (!pc) {
        err(`${label}: productCommit 404 — skipping`);
        return null;
    }

    // 2. Detect VMR vs pre-VMR
    const isVmr = pc.runtime.commit === pc.sdk.commit
        && pc.runtime.commit === pc.aspnetcore.commit;

    let runtimeGitHash: string;
    let aspnetCoreGitHash: string;
    let sdkGitHash: string;
    const vmrGitHash = pc.sdk.commit;
    let bootstrapSdkVersion: string;

    if (isVmr) {
        // .NET 10+ VMR path
        const smUrl = `${GITHUB_RAW}/dotnet/dotnet/${pc.sdk.commit}/src/source-manifest.json`;
        const sm = await fetchJson<SourceManifest>(smUrl);
        if (!sm) {
            err(`${label}: source-manifest.json failed — skipping`);
            return null;
        }

        const findRepo = (sm2: SourceManifest, path: string) =>
            sm2.repositories.find(r => r.path === path);

        let rtRepo = findRepo(sm, 'runtime');
        let aspRepo = findRepo(sm, 'aspnetcore');
        let sdkRepo = findRepo(sm, 'sdk');

        // 2xx/3xx bands: runtime/aspnetcore not source-built — follow upstream 1xx VMR
        if (!rtRepo || !aspRepo) {
            const vdxUrl = `${GITHUB_RAW}/dotnet/dotnet/${pc.sdk.commit}/eng/Version.Details.xml`;
            const vdxText = await fetch(vdxUrl).then(r => r.ok ? r.text() : null);
            const upstreamSha = vdxText?.match(
                /<Dependency\s+Name="Microsoft\.NETCore\.App\.Ref"[^>]*>[\s\S]*?<Sha>([0-9a-f]{40})<\/Sha>/i,
            )?.[1];

            if (!upstreamSha) {
                err(`${label}: 2xx/3xx band but cannot find upstream 1xx VMR SHA — skipping`);
                return null;
            }

            const upstreamSm = await fetchJson<SourceManifest>(
                `${GITHUB_RAW}/dotnet/dotnet/${upstreamSha}/src/source-manifest.json`,
            );
            if (!upstreamSm) {
                err(`${label}: upstream 1xx source-manifest.json failed — skipping`);
                return null;
            }

            rtRepo = rtRepo ?? findRepo(upstreamSm, 'runtime');
            aspRepo = aspRepo ?? findRepo(upstreamSm, 'aspnetcore');
            sdkRepo = sdkRepo ?? findRepo(upstreamSm, 'sdk');
        }

        if (!rtRepo || !aspRepo || !sdkRepo) {
            err(`${label}: source-manifest.json missing repos — skipping`);
            return null;
        }

        runtimeGitHash = rtRepo.commitSha;
        aspnetCoreGitHash = aspRepo.commitSha;
        sdkGitHash = sdkRepo.commitSha;

        // Bootstrap SDK from VMR global.json
        const gjUrl = `${GITHUB_RAW}/dotnet/dotnet/${pc.sdk.commit}/global.json`;
        const gj = await fetchJson<{ tools?: { dotnet?: string } }>(gjUrl);
        if (!gj?.tools?.dotnet) {
            err(`${label}: VMR global.json failed — skipping`);
            return null;
        }
        bootstrapSdkVersion = gj.tools.dotnet;
    } else {
        // .NET 8/9 pre-VMR path
        runtimeGitHash = pc.runtime.commit;
        aspnetCoreGitHash = pc.aspnetcore.commit;
        sdkGitHash = pc.sdk.commit;

        // Bootstrap SDK from runtime global.json
        const gjUrl = `${GITHUB_RAW}/dotnet/runtime/${pc.runtime.commit}/global.json`;
        const gj = await fetchJson<{ sdk?: { version?: string } }>(gjUrl);
        if (!gj?.sdk?.version) {
            err(`${label}: runtime global.json failed — skipping`);
            return null;
        }
        bootstrapSdkVersion = gj.sdk.version;
    }

    // 3. GitHub commit datetimes
    const ghHeaders = githubHeaders(token);

    const [rtCommit, aspCommit] = await Promise.all([
        fetchJson<{ commit: { message: string; author: { name: string }; committer: { date: string } } }>(
            `${GITHUB_API}/repos/dotnet/runtime/commits/${runtimeGitHash}`, ghHeaders,
        ),
        fetchJson<{ commit: { committer: { date: string } } }>(
            `${GITHUB_API}/repos/dotnet/aspnetcore/commits/${aspnetCoreGitHash}`, ghHeaders,
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

    // 4. Workload validation
    const wlUrl = `${NUGET_FLAT}/microsoft.net.sdk.webassembly.pack/${runtimeVersion}/microsoft.net.sdk.webassembly.pack.nuspec`;
    if (!await headOk(wlUrl)) {
        err(`${label}: workload pack not found on nuget.org — skipping`);
        return null;
    }

    if (verbose) {
        info(`Resolved ${label} (${isVmr ? 'VMR' : 'pre-VMR'})`);
    }

    return populateVersionFields({
        sdkVersion,
        runtimeGitHash,
        aspnetCoreGitHash,
        sdkGitHash,
        vmrGitHash,
        runtimeCommitDateTime: rtCommit.commit.committer.date,
        runtimeCommitAuthor: rtCommit.commit.author.name,
        runtimeCommitMessage: rtCommit.commit.message.split('\n')[0],
        aspnetCoreCommitDateTime: aspCommit.commit.committer.date,
        aspnetCoreVersion: pc.aspnetcore.version,
        runtimePackVersion: runtimeVersion,
        workloadVersion: runtimeVersion,
        bootstrapSdkVersion,
        releaseDate,
    });
}

// ── Existing file helpers ────────────────────────────────────────────────────

async function loadExisting(path: string): Promise<ReleasePacksList | null> {
    if (!existsSync(path)) return null;
    try {
        const raw = await readFile(path, 'utf-8');
        const data = JSON.parse(raw) as ReleasePacksList;
        if (data.packs?.length > 0) return data;
    } catch {
        // Corrupt file — treat as absent
    }
    return null;
}

// ── Stage ────────────────────────────────────────────────────────────────────

export async function run(ctx: BenchContext): Promise<BenchContext> {
    banner('Enumerate release packs');

    const outputPath = join(ctx.artifactsDir, 'release-packs-list.json');

    // Skip refresh if an explicit SDK version is given and already in either pack list
    if (ctx.sdkVersion && !ctx.forceEnumerate) {
        const cached = await loadExisting(outputPath);
        if (cached?.packs.some(p => p.sdkVersion === ctx.sdkVersion)) {
            info(`SDK version '${ctx.sdkVersion}' already in cached release packs — skipping refresh`);
            return ctx;
        }
        const dailyPath = join(ctx.artifactsDir, 'daily-packs-list.json');
        if (existsSync(dailyPath)) {
            try {
                const dailyData = JSON.parse(await readFile(dailyPath, 'utf-8')) as { packs: Array<{ sdkVersion: string }> };
                if (dailyData.packs?.some(p => p.sdkVersion === ctx.sdkVersion)) {
                    info(`SDK version '${ctx.sdkVersion}' found in cached daily packs — skipping release refresh`);
                    return ctx;
                }
            } catch { /* ignore corrupt file */ }
        }
    }

    const releaseMajors = ctx.releaseMajors;
    const channels = releaseMajors.map(m => `${m}.0`);

    info(`Channels: ${channels.join(', ')}`);

    const token = await resolveGitHubToken();
    if (!token && ctx.verbose) {
        info('No GitHub token found (env vars or gh CLI) — unauthenticated requests (60 req/hr limit)');
    }

    // ── Step 1: Fetch releases index ─────────────────────────────────────────

    const index = await fetchJson<ReleasesIndex>(RELEASES_INDEX_URL);
    if (!index) {
        throw new Error('Failed to fetch releases-index.json');
    }

    // ── Step 2: Fetch releases per channel ───────────────────────────────────

    const candidates: ReleaseCandidate[] = [];

    for (const channel of channels) {
        const entry = index['releases-index'].find(
            e => e['channel-version'] === channel,
        );
        if (!entry) {
            err(`Channel ${channel} not found in releases-index.json — skipping`);
            continue;
        }

        const channelData = await fetchJson<ChannelReleases>(entry['releases.json']);
        if (!channelData) {
            err(`Failed to fetch releases.json for ${channel} — skipping`);
            continue;
        }

        let channelCount = 0;
        for (const rel of channelData.releases) {
            const rtVersion = rel.runtime.version;

            // GA only: skip prerelease
            if (rtVersion.includes('-')) continue;

            const sdkVersion = pickLatestBandSdk(rel.sdks);
            if (!sdkVersion) continue;

            candidates.push({
                runtimeVersion: rtVersion,
                sdkVersion,
                releaseDate: rel['release-date'],
            });
            channelCount++;
        }

        info(`${channel}: ${channelCount} GA releases`);
    }

    info(`Total candidates: ${candidates.length}`);

    // ── Step 3: Incremental — filter out already-resolved ────────────────────

    const existing = ctx.forceEnumerate ? null : await loadExisting(outputPath);
    let toResolve: ReleaseCandidate[];
    const existingPacks: SdkInfo[] = existing?.packs ?? [];

    if (existing) {
        const knownVersions = new Set(existing.packs.map(p => p.runtimePackVersion));
        toResolve = candidates.filter(c => !knownVersions.has(c.runtimeVersion));
        info(`Incremental: ${toResolve.length} new releases to resolve (${knownVersions.size} cached)`);
    } else {
        toResolve = candidates;
        info(`Full resolve: ${toResolve.length} releases`);
    }

    // ── Step 4: Resolve SdkInfo concurrently ─────────────────────────────────

    const resolved = await mapConcurrent(toResolve, CONCURRENCY, async (candidate) => {
        return resolveRelease(candidate, token, ctx.verbose);
    });

    const newPacks = resolved.filter((p): p is SdkInfo => p !== null);
    info(`Resolved ${newPacks.length}/${toResolve.length} releases`);

    // ── Step 5: Merge and sort ───────────────────────────────────────────────

    const mergedMap = new Map<string, SdkInfo>();
    for (const p of existingPacks) mergedMap.set(p.runtimePackVersion, p);
    for (const p of newPacks) mergedMap.set(p.runtimePackVersion, p);

    // Filter to only versions still in the requested channels
    const requestedMajors = new Set(releaseMajors);
    const allPacks = [...mergedMap.values()]
        .filter(p => {
            const major = getVersionMajor(p.runtimePackVersion);
            return requestedMajors.has(major);
        })
        .sort((a, b) => {
            // Sort by major descending, then by release date descending
            const aMajor = getVersionMajor(a.runtimePackVersion);
            const bMajor = getVersionMajor(b.runtimePackVersion);
            if (aMajor !== bMajor) return bMajor - aMajor;
            return b.releaseDate.localeCompare(a.releaseDate);
        });

    // ── Step 6: Write output ─────────────────────────────────────────────────

    const result: ReleasePacksList = {
        channels,
        totalPacks: allPacks.length,
        packs: allPacks,
    };

    await mkdir(ctx.artifactsDir, { recursive: true });
    await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    info(`Wrote ${allPacks.length} release packs to ${outputPath}`);

    return ctx;
}
