import assert from 'node:assert/strict';
import test from 'node:test';
import { fixBootstrap } from '../../src/uno-gallery/fix-bootstrap.mjs';

test('Uno bootstrap registers lifecycle callbacks before runtime creation', () => {
    const source = `m.dotnet.withModuleConfig({ preRun: preRun });
const runtime = await m.default(context => {
    bootstrapper.configure(context);
    return bootstrapper.asDotnetConfig();
});`;
    const patched = fixBootstrap(source);
    const moduleConfig = {
        onConfigLoaded() {},
        onDotnetReady() {},
        onDownloadResourceProgress() {},
    };
    const preRun = () => {};
    let registered;
    const m = {
        dotnet: { withModuleConfig(config) { registered = config; } },
        async default(configure) { configure({}); },
    };
    const calls = [];
    const bootstrapper = {
        configure() {}, asDotnetConfig: () => moduleConfig,
        onDotnetReady: (...args) => calls.push(args),
    };
    const globals = {};
    let tick = 0;
    const run = new Function('m', 'bootstrapper', 'preRun', 'globalThis', 'performance',
        `return (async () => { ${patched} })();`);
    return run(m, bootstrapper, preRun, globals, { now: () => ++tick }).then(() => {
        assert.equal(registered.onConfigLoaded, moduleConfig.onConfigLoaded);
        assert.equal(registered.onDownloadResourceProgress, moduleConfig.onDownloadResourceProgress);
        assert.equal(registered.preRun, preRun);
        registered.onRuntimeInitialized();
        registered.onRuntimeInitialized();
        registered.onDotnetReady('first');
        registered.onDotnetReady('second');
        assert.equal(globals.bench_runtime_initialized, 1);
        assert.deepEqual(globals.bench_runtime_ready, { at: 2, source: 'onDotnetReady' });
        assert.deepEqual(calls, [['first'], ['second']]);
        assert.equal(fixBootstrap(patched), patched);
    });
});

test('Uno bootstrap workaround rejects changed or ambiguous upstream code', () => {
    assert.throws(() => fixBootstrap('no module config'), /expected exactly one/);
    assert.throws(() => fixBootstrap('.withModuleConfig({}).withModuleConfig({})'), /expected exactly one/);
});
