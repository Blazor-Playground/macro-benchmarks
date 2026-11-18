import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildContext } from '../src/args.js';
import { sdkInfoForRuntime, type SdkInfo } from '../src/context.js';
import { Runtime } from '../src/enums.js';
import {
    MONO_RUNTIME_REF,
    MONO_RUNTIME_REPO,
    run as resolveSdk,
} from '../src/stages/resolve-sdk.js';

const CORECLR_COMMIT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MONO_COMMIT = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function catalogEntry(): SdkInfo {
    return {
        sdkVersion: '12.0.100-alpha.1.26557.102',
        major: 12,
        minor: 0,
        patch: 100,
        channel: '12.0',
        isPrerelease: true,
        runtimeGitHash: 'cccccccccccccccccccccccccccccccccccccccc',
        aspnetCoreGitHash: 'dddddddddddddddddddddddddddddddddddddddd',
        sdkGitHash: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        vmrGitHash: 'ffffffffffffffffffffffffffffffffffffffff',
        runtimeCommitDateTime: '2026-11-15T10:00:00Z',
        runtimeCommitAuthor: 'Catalog Runtime',
        runtimeCommitMessage: 'Catalog runtime commit',
        aspnetCoreCommitDateTime: '2026-11-15T09:00:00Z',
        aspnetCoreCommitAuthor: 'Catalog ASP.NET',
        aspnetCoreCommitMessage: 'Catalog ASP.NET commit',
        aspnetCoreVersion: '12.0.0-test',
        runtimePackVersion: '12.0.0-test',
        workloadVersion: '12.0.100-test',
        bootstrapSdkVersion: '12.0.100-test',
        releaseDate: '2026-11-15',
    };
}

function commitResponse(sha: string, committedAt: string, subject: string) {
    return new Response(JSON.stringify({
        sha,
        commit: {
            message: subject,
            author: { name: `${subject} author`, date: committedAt },
            committer: { date: committedAt },
        },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

test('resolve-sdk keeps manual runtime input as CoreCLR and freezes Mono release/11.0 separately', async t => {
    const root = await mkdtemp(join(tmpdir(), 'resolve-runtime-sources-'));
    const previousToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = 'test-token';
    t.after(async () => {
        if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
        else process.env.GITHUB_TOKEN = previousToken;
        await rm(root, { recursive: true, force: true });
    });
    await writeFile(
        join(root, 'daily-packs-list.json'),
        JSON.stringify({ packs: [catalogEntry(), {
            ...catalogEntry(), sdkVersion: '11.0.100', major: 11,
            channel: '11.0', isPrerelease: false, runtimePackVersion: '11.0.0',
            aspnetCoreVersion: '11.0.0',
        }] }),
    );

    t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => {
        const url = input.toString();
        if (url.endsWith('/repos/fork/runtime/commits/abc123')) {
            return commitResponse(CORECLR_COMMIT, '2026-11-16T10:00:00Z', 'Custom CoreCLR');
        }
        if (url.endsWith('/repos/dotnet/runtime/commits/release%2F11.0')) {
            return commitResponse(MONO_COMMIT, '2026-11-14T10:00:00Z', 'Mono baseline');
        }
        throw new Error(`Unexpected request: ${url}`);
    });

    const base = await buildContext([
        '--runtime-commit', 'abc123',
        '--runtime-repo', 'fork/runtime',
    ]);
    const result = await resolveSdk({
        ...base,
        artifactsDir: root,
        repoRoot: root,
    });

    assert.equal(result.runtimeCommit, CORECLR_COMMIT);
    assert.equal(result.runtimeRef, 'abc123');
    assert.equal(result.runtimeRepo, 'fork/runtime');
    assert.equal(result.runtimeBuildRequired, true);
    assert.equal(result.sdkInfo.runtimeGitHash, CORECLR_COMMIT);
    assert.equal(result.sdkInfo.runtimeSources?.[Runtime.CoreCLR]?.commit, CORECLR_COMMIT);
    assert.equal(result.sdkInfo.runtimeSources?.[Runtime.CoreCLR]?.ref, 'abc123');
    assert.equal(result.sdkInfo.runtimeSources?.[Runtime.Mono]?.repo, MONO_RUNTIME_REPO);
    assert.equal(result.sdkInfo.runtimeSources?.[Runtime.Mono]?.ref, MONO_RUNTIME_REF);
    assert.equal(result.sdkInfo.runtimeSources?.[Runtime.Mono]?.commit, MONO_COMMIT);
    assert.equal(result.sdkInfo.runtimeSources?.[Runtime.Mono]?.sdkVersion, '11.0.100');
    assert.equal(sdkInfoForRuntime(result.sdkInfo, Runtime.Mono).sdkVersion, '11.0.100');
    assert.equal(
        sdkInfoForRuntime(result.sdkInfo, Runtime.Mono).runtimeGitHash,
        MONO_COMMIT,
    );
});
