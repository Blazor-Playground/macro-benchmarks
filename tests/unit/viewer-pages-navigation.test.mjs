import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restorePagesRoute } from '../../src/bench-viewer/wwwroot/pages-navigation.mjs';

const base = 'https://blazor-playground.github.io/macro-benchmarks/';

function restore(path, baseUri = base) {
    const location = new URL(baseUri);
    if (path !== null) location.searchParams.set('redirect', path);
    const calls = [];
    const history = { state: { existing: true }, replaceState(...args) { calls.push(args); } };
    restorePagesRoute(baseUri, location, history);
    return { calls, history };
}

test('normal navigation does not alter browser history', () => {
    assert.deepEqual(restore(null).calls, []);
});

test('Pages recovery restores the exact project route, query and fragment once', () => {
    const path = '/macro-benchmarks/net12-focus?value=a%2Bb%26c&value=%252F&space=two+words#focus-methodology';
    const { calls, history } = restore(path);
    assert.deepEqual(calls, [[history.state, '', new URL(path, base).href]]);
});

test('recovery uses the declared base URI rather than a hard-coded project path', () => {
    for (const baseUri of ['http://localhost:5000/', 'https://example.org/tools/dashboard/']) {
        const { calls, history } = restore('net12-focus?x=1#details', baseUri);
        assert.deepEqual(calls, [[history.state, '', `${baseUri}net12-focus?x=1#details`]]);
    }
});

test('malformed, cross-origin, outside-project and credential-bearing redirects are logged and ignored', t => {
    const warning = t.mock.method(console, 'warn', () => {});
    const paths = [
        'https://example.org/macro-benchmarks/net12-focus',
        '//example.org/macro-benchmarks/net12-focus',
        '/another-project/net12-focus',
        '/macro-benchmarks-other/net12-focus',
        '/macro-benchmarks/../another-project/',
        'javascript:alert(1)',
        'https://user:password@blazor-playground.github.io/macro-benchmarks/net12-focus',
        'http://[invalid',
    ];
    for (const path of paths) assert.deepEqual(restore(path).calls, [], path);
    assert.equal(warning.mock.callCount(), paths.length);
    assert(warning.mock.calls.every(call => call.arguments[0].startsWith('Ignoring')));
});

test('browser history failures are not silently swallowed', () => {
    const location = new URL(base);
    location.searchParams.set('redirect', '/macro-benchmarks/net12-focus');
    const failure = new Error('History unavailable');
    assert.throws(() => restorePagesRoute(base, location, {
        state: null,
        replaceState() { throw failure; },
    }), error => error === failure);
});
