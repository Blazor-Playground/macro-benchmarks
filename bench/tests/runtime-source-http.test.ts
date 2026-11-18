import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchGitHubCommitInfo } from '../src/lib/http.js';

test('GitHub commit resolution URL-encodes branch refs and returns the full SHA', async t => {
    const sha = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd';
    t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => {
        assert.equal(
            input.toString(),
            'https://api.github.com/repos/dotnet/runtime/commits/release%2F11.0',
        );
        return new Response(JSON.stringify({
            sha,
            commit: {
                message: 'Mono branch tip',
                author: { name: 'Runtime Author', date: '2026-11-14T09:00:00Z' },
                committer: { date: '2026-11-14T10:00:00Z' },
            },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    assert.deepEqual(
        await fetchGitHubCommitInfo('dotnet/runtime', 'release/11.0'),
        {
            sha,
            commitDateTime: '2026-11-14T10:00:00Z',
            commitAuthor: 'Runtime Author',
            commitMessage: 'Mono branch tip',
        },
    );
});
