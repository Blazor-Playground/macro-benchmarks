import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildContext } from '../src/args.js';
import type { SdkInfo } from '../src/context.js';
import { populateVersionFields } from '../src/lib/version-utils.js';
import { run as enumerateReleases } from '../src/stages/enumerate-release-packs.js';
import { run as transformViews } from '../src/stages/transform-views.js';

function pack(sdkVersion: string, runtimePackVersion: string, releaseDate = '2026-11-10'): SdkInfo {
    return populateVersionFields({
        sdkVersion, runtimePackVersion, releaseDate,
        runtimeGitHash: `runtime-${runtimePackVersion}`,
        aspnetCoreGitHash: `aspnetcore-${runtimePackVersion}`,
        sdkGitHash: `sdk-${sdkVersion}`,
        vmrGitHash: `vmr-${sdkVersion}`,
        runtimeCommitDateTime: `${releaseDate}T00:00:00Z`,
        runtimeCommitAuthor: 'Test', runtimeCommitMessage: 'Release fixture',
        aspnetCoreCommitDateTime: `${releaseDate}T00:00:00Z`,
        aspnetCoreCommitAuthor: 'Test', aspnetCoreCommitMessage: 'Release fixture',
        aspnetCoreVersion: runtimePackVersion, workloadVersion: runtimePackVersion,
        bootstrapSdkVersion: sdkVersion, vmrBranch: 'release/11.0.1xx',
    });
}

for (const phase of ['active', 'go-live', 'unavailable']) {
    test(`release enumeration handles ${phase} metadata while retaining older servicing releases`, async t => {
        const root = await mkdtemp(join(tmpdir(), 'benchmark-releases-'));
        const token = process.env.GH_TOKEN;
        process.env.GH_TOKEN = 'test-token';
        try {
            const stable = [
                pack('8.0.422', '8.0.28'), pack('9.0.314', '9.0.16'), pack('10.0.108', '10.0.8'),
            ];
            const rc1 = pack('11.0.100-rc.1.fixture', '11.0.0-rc.1.fixture', '2026-09-08');
            const rc2 = pack('11.0.100-rc.2.fixture', '11.0.0-rc.2.fixture', '2026-10-13');
            const ga = pack('11.0.100', '11.0.0');
            const patch = pack('11.0.101', '11.0.1', '2026-12-08');
            const current = phase === 'active' ? [patch, ga] : [rc2];
            const cached = [...stable, rc1, rc2, ...(phase === 'active' ? [ga, patch] : [])];
            await writeFile(join(root, 'release-packs-list.json'), JSON.stringify({ packs: cached }));
            t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
                const url = String(input);
                if (url.endsWith('releases-index.json')) {
                    return Response.json({ 'releases-index': [8, 9, 10, 11].map(major => ({
                        'channel-version': `${major}.0`,
                        'support-phase': major === 11 ? phase : 'active',
                        'releases.json': `https://releases.invalid/${major}`,
                    })) });
                }
                const major = Number(url.split('/').pop());
                assert.ok([8, 9, 10, 11].includes(major), `Unexpected request: ${url}`);
                if (major === 11 && phase === 'unavailable') return new Response(null, { status: 404 });
                const packs = major === 11 ? [...current, rc2, rc1] : stable.filter(p => p.major === major);
                return Response.json({ releases: packs.map(p => ({
                    'release-date': p.releaseDate, runtime: { version: p.runtimePackVersion },
                    sdks: [{ version: p.sdkVersion }],
                })) });
            });
            const ctx = { ...await buildContext([]), artifactsDir: root };
            await enumerateReleases(ctx);
            const result = JSON.parse(await readFile(join(root, 'release-packs-list.json'), 'utf8'));
            const expected = phase === 'unavailable' ? [rc2, rc1] : current;
            assert.deepEqual(result.packs.map((p: SdkInfo) => p.sdkVersion),
                [...expected, ...stable.reverse()].map(p => p.sdkVersion));
            assert.equal(result.totalPacks, expected.length + stable.length);
        } finally {
            if (token === undefined) delete process.env.GH_TOKEN;
            else process.env.GH_TOKEN = token;
            await rm(root, { recursive: true, force: true });
        }
    });
}

test('GA measurements produce net8 through net11 release buckets while net12 remains daily', async () => {
    const root = await mkdtemp(join(tmpdir(), 'benchmark-ga-views-'));
    const gitConfig = process.env.GIT_CONFIG_GLOBAL;
    process.env.GIT_CONFIG_GLOBAL = join(root, 'gitconfig');
    try {
        const pages = join(root, 'gh-pages');
        const remote = join(root, 'remote.git');
        await mkdir(pages);
        const git = (...args: string[]) => execFileSync('git', args, { cwd: pages, stdio: 'pipe' });
        git('init', '--bare', remote);
        git('init', '-b', 'gh-pages');
        git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-m', 'Seed');
        git('remote', 'add', 'origin', remote);
        git('push', '--set-upstream', 'origin', 'gh-pages');
        const resultsDir = join(root, 'results');
        await mkdir(resultsDir);
        const packs = [8, 9, 10, 11].map(major => pack(`${major}.0.100`, `${major}.0.0`));
        packs.push(pack('12.0.100-alpha.1.fixture', '12.0.0-alpha.1.fixture'));
        for (const meta of packs) {
            await writeFile(join(resultsDir, `${meta.sdkVersion}.json`), JSON.stringify({
                meta: { ...meta, runtime: 'mono', preset: 'no-workload', profile: 'desktop',
                    engine: 'chrome', app: 'empty-blazor' },
                metrics: { 'time-to-reach-managed-cold': 123 },
            }));
        }
        await transformViews({ ...await buildContext([]), repoRoot: root, resultsDir, artifactsInputDir: undefined });
        const views = join(pages, 'data', 'views');
        const index = JSON.parse(await readFile(join(views, 'index.json'), 'utf8'));
        assert.deepEqual(index.releases, ['net8', 'net9', 'net10', 'net11']);
        assert.equal(index.activeRelease, 'net12');
        const header = JSON.parse(await readFile(join(views, 'releases', 'net11', 'header.json'), 'utf8'));
        assert.deepEqual(header.columns.map((p: SdkInfo) => [p.sdkVersion, p.isPrerelease]), [['11.0.100', false]]);
        const metric = JSON.parse(await readFile(join(views, 'releases', 'net11', 'empty-blazor_time-to-reach-managed-cold.json'), 'utf8'));
        assert.deepEqual(metric, { 'mono/no-workload/desktop/chrome': [123] });
    } finally {
        if (gitConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL;
        else process.env.GIT_CONFIG_GLOBAL = gitConfig;
        await rm(root, { recursive: true, force: true });
    }
});
