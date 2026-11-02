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
    const bootstrapper = { configure() {}, asDotnetConfig: () => moduleConfig };
    const run = new Function('m', 'bootstrapper', 'preRun', `return (async () => { ${patched} })();`);
    return run(m, bootstrapper, preRun).then(() => {
        assert.deepEqual(registered, { ...moduleConfig, preRun });
        assert.equal(fixBootstrap(patched), patched);
    });
});

test('Uno bootstrap workaround rejects changed or ambiguous upstream code', () => {
    assert.throws(() => fixBootstrap('no module config'), /expected exactly one/);
    assert.throws(() => fixBootstrap('.withModuleConfig({}).withModuleConfig({})'), /expected exactly one/);
});
