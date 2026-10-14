import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));
const legacyCallback = /\bon(?:ConfigLoaded|DotnetReady|DownloadResourceProgress)\s*:/;

async function collectMainModules(directory) {
    const modules = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            modules.push(...await collectMainModules(path));
        } else if (entry.name === 'main.mjs') {
            modules.push(path);
        }
    }
    return modules;
}

test('Blazor apps use dedicated runtime builder callback APIs', async () => {
    const modules = await collectMainModules(srcRoot);
    let blazorAppCount = 0;

    for (const path of modules) {
        const source = await readFile(path, 'utf8');
        if (!source.includes('Blazor.start(')) {
            continue;
        }

        blazorAppCount++;
        const appPath = relative(srcRoot, path);
        if (['bench-viewer', 'havit-bootstrap'].some(app => appPath === join(app, 'wwwroot', 'main.mjs'))) {
            assert.match(source, /typeof dotnet\.withDotnetReady === 'function'/, `${appPath} compatibility must be feature-gated`);
            assert.doesNotMatch(source, /\bon(?:ConfigLoaded|DownloadResourceProgress)\s*:/, `${appPath} uses another legacy callback`);
        } else {
            assert.doesNotMatch(source, legacyCallback, `${appPath} uses a legacy module callback`);
        }
        if (source.includes('setModuleImports(')) {
            assert.match(source, /\.withDotnetReady\s*\(/, `${appPath} must register imports from withDotnetReady`);
        }
    }

    assert.ok(blazorAppCount > 0, 'No Blazor app entry modules were found');
});

test('viewer ready registration works with modern and retained older SDK builders', async () => {
    const source = await readFile(join(srcRoot, 'bench-viewer', 'wwwroot', 'main.mjs'), 'utf8');
    const executable = source.replace(/^import .+;$/gm, '');
    for (const modern of [true, false]) {
        const registrations = [];
        const warnings = [];
        let tick = 0;
        const context = {
            chartInterop: {}, focusInterop: {}, restorePagesRoute: () => {},
            document: { baseURI: 'http://local/', getElementById: () => null },
            window: { location: {}, history: {} },
            console: { log: () => {}, warn: message => warnings.push(message) },
            performance: { now: () => ++tick },
            getDotnetRuntime: () => ({
                Module: { HEAPU8: { byteLength: 4096 } },
                setModuleImports: (name, imports) => registrations.push({ name, imports }),
            }),
            Blazor: { start: async options => {
                const config = {};
                let ready;
                options.configureRuntime({
                    withModuleConfig: values => Object.assign(config, values),
                    ...(modern ? { withDotnetReady: callback => { ready = callback; } } : {}),
                });
                config.onRuntimeInitialized();
                (modern ? ready : config.onDotnetReady)();
                registrations.find(entry => entry.name === 'main.mjs').imports.bench.setManagedReady();
            } },
        };
        await runInNewContext(`(async () => { ${executable} })()`, context);
        assert.deepEqual(registrations.map(entry => entry.name), ['chart-interop.js', 'focus-interop.js', 'main.mjs']);
        assert.equal(context.bench_complete, true);
        assert.equal(warnings.length, modern ? 0 : 1);
    }
});

test('Havit registers imports and preserves ready timing with modern, legacy and omitted ready callbacks', async () => {
    const source = await readFile(join(srcRoot, 'havit-bootstrap', 'wwwroot', 'main.mjs'), 'utf8');
    for (const [modern, firesReady] of [[true, true], [false, true], [false, false]]) {
        const registrations = [];
        const warnings = [];
        let tick = 0;
        const context = {
            window: {}, document: { getElementById: () => null },
            console: { log: () => {}, warn: message => warnings.push(message) },
            performance: { now: () => ++tick },
            getDotnetRuntime: () => ({
                Module: { HEAPU8: { byteLength: 4096 } },
                setModuleImports: (name, imports) => registrations.push({ name, imports }),
            }),
            Blazor: { start: async options => {
                const config = {};
                let ready;
                options.configureRuntime({
                    withModuleConfig: values => Object.assign(config, values),
                    ...(modern ? { withDotnetReady: callback => { ready = callback; } } : {}),
                });
                config.onRuntimeInitialized();
                assert.equal(context.dotnet_created, 2);
                if (firesReady) (modern ? ready : config.onDotnetReady)();
                registrations.at(-1).imports.bench.setManagedReady();
            } },
        };
        await runInNewContext(`(async () => { ${source} })()`, context);
        assert.deepEqual(registrations.map(entry => entry.name), firesReady ? ['main.mjs', 'main.mjs'] : ['main.mjs']);
        assert.equal(context.dotnet_created, firesReady ? 3 : 2);
        assert.equal(context.bench_complete, true);
        assert.equal(warnings.length, modern ? 0 : 1);
    }
});
