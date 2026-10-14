import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { mock } from 'node:test';
import { withRuntimeReady } from '../../src/runtime-ready.mjs';

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
        assert.doesNotMatch(source, legacyCallback, `${appPath} uses a legacy module callback`);
        if (source.includes('setModuleImports(')) {
            assert.match(source, /withRuntimeReady\s*\(dotnet,/, `${appPath} must use the shared runtime ready API bridge`);
        }
    }

    assert.ok(blazorAppCount > 0, 'No Blazor app entry modules were found');
});

test('ready registration prefers the dedicated builder API and falls back only when it is absent', () => {
    const callback = () => {};
    let registered;
    withRuntimeReady({
        withDotnetReady: value => { registered = value; },
        withModuleConfig: () => { throw new Error('Legacy callback must not be selected for a modern runtime'); },
    }, callback);
    assert.equal(registered, callback);
    const warning = mock.method(console, 'warn', () => {});
    try {
        let moduleConfig;
        withRuntimeReady({ withModuleConfig: value => { moduleConfig = value; } }, callback);
        assert.equal(moduleConfig.onDotnetReady, callback);
        assert.equal(warning.mock.callCount(), 1);
        assert.throws(() => withRuntimeReady({}, callback), /no supported managed-ready/);
    } finally { warning.mock.restore(); }
});
