import { execFile } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { SdkInfo } from '../context.js';
import type { DebugSdk } from './debug-results.js';
import { githubHeaders, GITHUB_API, GITHUB_RAW, NUGET_FLAT, PRODUCT_COMMIT_BASE } from './http.js';
import { compareVersions, parseArcadeDate, populateVersionFields } from './version-utils.js';

const execute = promisify(execFile);
const MONO_ID = 'microsoft.netcore.app.runtime.mono.browser-wasm';
const SDK_FEED = 'https://ci.dot.net/public/Sdk';

async function json<T>(url: string, request: typeof fetch, token?: string): Promise<T | null> {
    const response = await request(url, {
        signal: AbortSignal.timeout(60_000),
        ...(url.startsWith(GITHUB_API) ? { headers: githubHeaders(token) } : {}),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Dev-loop SDK resolution: HTTP ${response.status} for ${url}`);
    return response.json() as Promise<T>;
}

async function flatBase(major: number, request: typeof fetch): Promise<string> {
    const url = `https://pkgs.dev.azure.com/dnceng/public/_packaging/dotnet${major}/nuget/v3/index.json`;
    const index = await json<{ resources: { '@type': string; '@id': string }[] }>(url, request);
    const base = index?.resources.find(r => r['@type'].startsWith('PackageBaseAddress'))?.['@id'];
    if (!base) throw new Error(`No package base address in ${url}`);
    return base.replace(/\/$/, '');
}

export async function monoPackAvailable(version: string, request: typeof fetch = fetch): Promise<boolean> {
    const base = version.includes('-') ? await flatBase(Number(version.split('.')[0]), request) : NUGET_FLAT;
    const index = await json<{ versions: string[] }>(`${base}/${MONO_ID}/index.json`, request);
    return index?.versions.includes(version) ?? false;
}

export async function publishedDebugSdk(version: string, rid: string, request: typeof fetch = fetch,
    token?: string): Promise<SdkInfo | null> {
    const product = await json<{
        sdk: { commit: string }; runtime: { version: string }; aspnetcore: { version: string };
    }>(`${version.includes('-') ? SDK_FEED : PRODUCT_COMMIT_BASE}/${version}/productCommit-${rid}.json`, request);
    if (!product) return null;
    const vmr = product.sdk.commit;
    const manifest = await json<{ repositories: { path: string; commitSha: string }[] }>(
        `${GITHUB_RAW}/dotnet/dotnet/${vmr}/src/source-manifest.json`, request);
    const source = (path: string) => {
        const sha = manifest?.repositories.find(r => r.path === path)?.commitSha;
        if (!sha || !/^[a-f0-9]{40}$/i.test(sha)) throw new Error(`Missing ${path} source in SDK ${version}`);
        return sha;
    };
    const runtime = source('runtime'), aspnet = source('aspnetcore'), sdk = source('sdk');
    const metadata = async (repo: string, sha: string) => {
        const commit = await json<{ commit: { committer: { date: string }; author: { name: string }; message: string } }>(
            `${GITHUB_API}/repos/dotnet/${repo}/commits/${sha}`, request, token);
        if (!commit) throw new Error(`Missing ${repo} commit ${sha} for SDK ${version}`);
        return { date: commit.commit.committer.date, author: commit.commit.author.name, message: commit.commit.message.split('\n')[0] };
    };
    const [rt, asp, sd, vm] = await Promise.all([
        metadata('runtime', runtime), metadata('aspnetcore', aspnet), metadata('sdk', sdk), metadata('dotnet', vmr),
    ]);
    return populateVersionFields({
        sdkVersion: version, runtimeGitHash: runtime, aspnetCoreGitHash: aspnet, sdkGitHash: sdk, vmrGitHash: vmr,
        sdkCommitDateTime: sd.date, vmrCommitDateTime: vm.date,
        runtimeCommitDateTime: rt.date, runtimeCommitAuthor: rt.author, runtimeCommitMessage: rt.message,
        aspnetCoreCommitDateTime: asp.date, aspnetCoreCommitAuthor: asp.author, aspnetCoreCommitMessage: asp.message,
        aspnetCoreVersion: product.aspnetcore.version, runtimePackVersion: product.runtime.version,
        workloadVersion: product.runtime.version, bootstrapSdkVersion: '',
        releaseDate: parseArcadeDate(version)?.toISOString().slice(0, 10) ?? '',
    });
}

export interface DebugMonoFallback {
    branch: 'release/11.0';
    reason: string;
}

export async function selectDebugMonoSdk(primary: SdkInfo, rid: string, request: typeof fetch = fetch,
    token?: string): Promise<{ sdk: SdkInfo; fallback?: DebugMonoFallback }> {
    if (primary.monoRuntimePackAvailable ?? await monoPackAvailable(primary.runtimePackVersion, request)) return { sdk: primary };
    const reason = `Mono browser-wasm pack ${primary.runtimePackVersion} is unavailable; using the latest .NET11 GA Mono/net11 baseline`;
    const releases = await json<{ releases: {
        'release-date': string; runtime: { version: string }; sdks: { version: string }[];
    }[] }>('https://builds.dotnet.microsoft.com/dotnet/release-metadata/11.0/releases.json', request);
    const release = releases?.releases.filter(r => /^11\.0\.\d+$/.test(r.runtime.version))
        .sort((a, b) => compareVersions(b.runtime.version, a.runtime.version))[0];
    const version = release?.sdks.map(s => s.version).filter(v => /^11\.0\.1\d\d$/.test(v))
        .sort((a, b) => compareVersions(b, a))[0];
    if (!release || !version || !await monoPackAvailable(release.runtime.version, request)) {
        throw new Error('Latest .NET11 GA release is missing its SDK or Mono browser-wasm pack');
    }
    const sdk = await publishedDebugSdk(version, rid, request, token);
    if (!sdk || sdk.runtimePackVersion !== release.runtime.version) {
        throw new Error(`Latest .NET11 GA SDK ${version} is unavailable or has mismatched runtime provenance`);
    }
    const [runtimeBranch, vmrBranch] = await Promise.all([
        json<{ status: string }>(`${GITHUB_API}/repos/dotnet/runtime/compare/release/11.0...${sdk.runtimeGitHash}`, request, token),
        json<{ status: string }>(`${GITHUB_API}/repos/dotnet/dotnet/compare/release/11.0.1xx...${sdk.vmrGitHash}`, request, token),
    ]);
    if ([runtimeBranch, vmrBranch].some(compare => !compare || !['identical', 'behind'].includes(compare.status))) {
        throw new Error(`Latest .NET11 GA SDK ${version} could not be verified against the release/11.0 source line`);
    }
    sdk.releaseDate = release['release-date'];
    sdk.vmrBranch = 'release/11.0.1xx';
    return { sdk, fallback: { branch: 'release/11.0', reason } };
}

export async function installedDebugSdk(requestedDotnet: string, info?: SdkInfo): Promise<{
    dotnet: string; sdk: DebugSdk; runtimeVersion: string; rid: string;
}> {
    const dotnet = await realpath(requestedDotnet.includes('/') ? requestedDotnet
        : (await execute('which', [requestedDotnet])).stdout.trim());
    const sdkList = (await execute(dotnet, ['--list-sdks'])).stdout.trim().split('\n');
    const version = info?.sdkVersion ?? (await execute(dotnet, ['--version'])).stdout.trim();
    const base = sdkList.find(line => line.startsWith(`${version} [`))?.match(/\[(.*)\]/)?.[1];
    if (!base) throw new Error(`SDK ${version} is not installed for ${dotnet}`);
    const dir = join(base, version);
    const props = await readFile(join(dir, 'Microsoft.NETCoreSdk.BundledVersions.props'), 'utf8');
    const runtimeVersion = props.match(/<BundledNETCoreAppPackageVersion>([^<]+)</)?.[1];
    const rid = props.match(/<NETCoreSdkRuntimeIdentifier>([^<]+)</)?.[1];
    if (!runtimeVersion || !rid) throw new Error(`SDK ${version} does not expose its bundled runtime and host RID`);
    let versionFile = '';
    try { versionFile = await readFile(join(dir, '.version'), 'utf8'); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        console.log(`SDK ${version} has no .version source hash; retaining unknown provenance`);
    }
    return {
        dotnet, runtimeVersion, rid,
        sdk: {
            version, day: info?.releaseDate || parseArcadeDate(version)?.toISOString().slice(0, 10) || null,
            sdkHash: info?.sdkGitHash || versionFile.match(/^[a-f0-9]{40}$/m)?.[0] || null,
            sdkCommitDateTime: info?.sdkCommitDateTime || null, runtimeHash: info?.runtimeGitHash || null,
            runtimePackVersion: runtimeVersion, runtimeCommitDateTime: info?.runtimeCommitDateTime || null,
            aspnetHash: info?.aspnetCoreGitHash || null, vmrHash: info?.vmrGitHash || null,
            vmrCommitDateTime: info?.vmrCommitDateTime || null,
        },
    };
}
