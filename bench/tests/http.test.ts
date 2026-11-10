import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchGitHubCommitMetadata } from '../src/lib/http.js';

test('GitHub commit metadata uses the committer timestamp and collapses repeated requests', async t => {
    const sha = '1234567890abcdef1234567890abcdef12345678';
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async (input, init) => {
        requests++;
        assert.equal(input.toString(), `https://api.github.com/repos/dotnet/sdk/commits/${sha}`);
        assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer token');
        return new Response(JSON.stringify({
            commit: {
                message: 'First line\nMore detail',
                author: { name: 'SDK Author', date: '2026-09-20T05:00:00Z' },
                committer: { date: '2026-09-20T06:15:00Z' },
            },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const [first, second] = await Promise.all([
        fetchGitHubCommitMetadata('dotnet/sdk', sha, 'token'),
        fetchGitHubCommitMetadata('DOTNET/SDK', sha.toUpperCase(), 'token'),
    ]);

    assert.equal(requests, 1);
    assert.deepEqual(first, {
        commitDateTime: '2026-09-20T06:15:00Z',
        commitAuthor: 'SDK Author',
        commitMessage: 'First line',
    });
    assert.deepEqual(second, first);
});
