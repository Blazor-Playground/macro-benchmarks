import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
    checkPrerequisites, probeBrowsers, probeCommand, probeTar, reportPrerequisites,
} from '../../bench/local-prerequisites.mjs';

const options = { engines: ['chrome'], systemChrome: false, headless: true };

function dependencies(overrides = {}) {
    return {
        platform: 'darwin', nodeVersion: '24.1.0',
        exists: () => true,
        probe: command => ({
            ok: true, detail: `${command} available`,
            output: command === 'python3' || command === 'python' ? 'Python 3.13.0' : `${command} available`,
        }),
        checkTar: async () => ({ ok: true, detail: 'can read ZIP/.nupkg archives' }),
        browsers: async ({ engines }) => engines.map(engine => ({ engine, ok: true, detail: '154.fixture' })),
        ...overrides,
    };
}

test('successful preflight reports availability and returns browser identities without requiring a bootstrap SDK', async () => {
    const report = await checkPrerequisites(options, dependencies());
    assert.equal(report.ok, true);
    assert.deepEqual(report.browsers, { chrome: '154.fixture' });
    assert.ok(report.checks.some(check => check.name === 'xcrun'));
    assert.ok(!report.checks.some(check => check.name === 'Explicit app SDK'));
    const lines = [];
    assert.equal(reportPrerequisites(report, line => lines.push(line)), true);
    assert.ok(lines.some(line => line.endsWith('[OK]')));
    assert.match(lines[0], /no installations/);
});

test('all missing prerequisites are reported together with actionable macOS fixes', async () => {
    let browserCalls = 0;
    const report = await checkPrerequisites(options, dependencies({
        nodeVersion: '23.3.0', exists: () => false,
        probe: () => ({ ok: false, detail: 'ENOENT', output: '' }),
        checkTar: async () => ({ ok: false, detail: 'tar cannot read ZIP' }),
        browsers: async () => { browserCalls++; return []; },
    }));
    assert.equal(report.ok, false);
    assert.equal(browserCalls, 0);
    assert.ok(report.checks.find(check => check.name === 'Node.js >= 24').install.includes('brew install node@24'));
    assert.ok(report.checks.find(check => check.name === 'cmake').install.includes('brew install cmake'));
    assert.ok(report.checks.find(check => check.name === 'xcrun').install.includes('xcode-select --install'));
    assert.equal(report.checks.find(check => check.name.includes('Playwright')).install, 'npm ci');
    assert.equal(report.checks.find(check => check.name.includes('tsx')).install, 'npm ci --prefix bench');
    assert.ok(report.checks.find(check => check.name === 'chromium launch').install.includes('npx playwright install chromium'));
    assert.ok(report.checks.filter(check => !check.ok).length > 8);
    const lines = [];
    assert.equal(reportPrerequisites(report, line => lines.push(line)), false);
    assert.ok(lines.some(line => line.endsWith('[FAILED]')));
    assert.ok(lines.some(line => line.includes('How to fix')));
});

test('Linux GNU tar rejection explains installing bsdtar and required browser libraries', async () => {
    const report = await checkPrerequisites(options, dependencies({
        platform: 'linux',
        checkTar: async () => ({ ok: false, detail: 'This does not look like a tar archive' }),
        browsers: async () => [{ engine: 'chrome', ok: false, detail: 'Missing libX11.so' }],
    }));
    assert.equal(report.ok, false);
    const archive = report.checks.find(check => check.name.includes('ZIP'));
    assert.match(archive.install, /apt-get install libarchive-tools/);
    assert.match(archive.install, /export BENCH_TAR=bsdtar/);
    assert.match(report.checks.find(check => check.name === 'chromium launch').install, /playwright install-deps chromium/);
    assert.ok(report.checks.some(check => check.name === 'pkg-config'));
});

test('Windows checks developer tools and Python 3, giving Developer Command Prompt instructions', async () => {
    const report = await checkPrerequisites(options, dependencies({
        platform: 'win32',
        probe: command => command === 'cl'
            ? { ok: false, detail: 'cl is not on PATH', output: '' }
            : command === 'python'
                ? { ok: true, detail: 'Python 2.7', output: 'Python 2.7' }
                : { ok: true, detail: `${command} available`, output: `${command} available` },
    }));
    assert.equal(report.ok, false);
    assert.match(report.checks.find(check => check.name === 'cl').install, /Developer Command Prompt/);
    assert.match(report.checks.find(check => check.name === 'python').detail, /Python 3 required/);
    assert.ok(report.checks.some(check => check.name === 'powershell'));
    assert.ok(!report.checks.some(check => check.name === 'bash'));
});

test('only selected browsers are checked; system Chrome gets installation advice rather than an automatic download', async () => {
    const report = await checkPrerequisites({ ...options, systemChrome: true }, dependencies({
        browsers: async settings => {
            assert.deepEqual(settings.engines, ['chrome']);
            assert.equal(settings.systemChrome, true);
            return [{ engine: 'chrome', ok: false, detail: 'Chrome executable missing' }];
        },
    }));
    assert.match(report.checks.find(check => check.name === 'Google Chrome launch').install, /google.com\/chrome/);
    assert.ok(!report.checks.some(check => check.name === 'firefox launch'));
});

test('unusable explicit SDK and missing merge-base history have concrete repair instructions', async () => {
    const report = await checkPrerequisites({ ...options, sdk: '/sdk', runtimeRepo: '/runtime' }, dependencies({
        probe: (command, args) => command === 'git' && args.includes('merge-base')
            ? { ok: false, detail: 'Not a valid object name origin/main', output: '' }
            : command.endsWith('dotnet')
                ? { ok: true, detail: '', output: '' }
                : dependencies().probe(command),
    }));
    assert.equal(report.ok, false);
    assert.match(report.checks.find(check => check.name === 'Explicit app SDK').detail, /No installed SDKs/);
    assert.match(report.checks.find(check => check.name.includes('merge base')).install, /fetch origin main/);
});

test('browser launch probes preserve error details and close successful browser instances', async () => {
    let closed = false;
    const results = await probeBrowsers({ ...options, engines: ['chrome', 'firefox'] }, async () => ({
        chromium: {
            launch: async launchOptions => {
                assert.equal(launchOptions.timeout, 15000);
                return { version: () => '154.fixture', close: async () => { closed = true; } };
            },
        },
        firefox: { launch: async () => { throw new Error('Executable missing\nLong launcher details'); } },
    }));
    assert.equal(closed, true);
    assert.deepEqual(results.map(result => result.ok), [true, false]);
    assert.equal(results[1].detail, 'Executable missing');
    const missing = await probeBrowsers(options, async () => { throw new Error('Module not installed'); });
    assert.equal(missing[0].ok, false);
    assert.match(missing[0].detail, /Module not installed/);
    const cleanup = await probeBrowsers(options, async () => ({
        chromium: { launch: async () => ({
            version: () => '154.fixture',
            close: async () => { throw new Error('cleanup failed'); },
        }) },
    }));
    assert.equal(cleanup[0].ok, false);
    assert.match(cleanup[0].detail, /Browser cleanup failed/);
});

test('tar capability probe uses a ZIP archive and cleans its temporary fixture', async () => {
    let archive;
    const result = await probeTar('fixture-tar', (command, args) => {
        assert.equal(command, 'fixture-tar');
        assert.equal(args[0], '-tf');
        archive = args[1];
        assert.equal(readFileSync(archive).subarray(0, 2).toString(), 'PK');
        return { ok: true, output: 'prerequisite-probe.txt\n', detail: '' };
    });
    assert.equal(result.ok, true);
    assert.equal(existsSync(archive), false);
    const unsupported = await probeTar('fixture-tar', () => ({
        ok: false, output: '', detail: 'unsupported ZIP',
    }));
    assert.equal(unsupported.ok, false);
    assert.equal(unsupported.detail, 'unsupported ZIP');
});

test('command probes return executable failures explicitly and never install tools', () => {
    const ok = probeCommand(process.execPath, ['--version']);
    assert.equal(ok.ok, true);
    const failure = probeCommand(process.execPath, ['-e', 'console.error("probe failed");process.exit(3)']);
    assert.equal(failure.ok, false);
    assert.match(failure.detail, /probe failed/);
    assert.equal(probeCommand(join(tmpdir(), 'nonexistent-bench-prerequisite-command'), []).ok, false);
});

test('CLI preflight failure does not create output directories or clone/build a checkout', async t => {
    const root = await mkdtemp(join(tmpdir(), 'bench-prerequisite-cli-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const output = join(root, 'no-output-expected');
    for (const flags of [[], ['--check-prerequisites']]) {
        const result = spawnSync(process.execPath, [resolve('bench/compare-local-runtime.mjs'),
            ...flags, '--output', output, '--runtime-repo', join(root, 'missing-runtime')],
        { encoding: 'utf8', timeout: 60000 });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 1);
        assert.match(result.stdout, /Runtime checkout.*\[FAILED\]/);
        assert.match(result.stdout, /How to fix/);
        assert.match(result.stderr, /nothing was installed/);
        assert.equal(existsSync(output), false);
    }
});
