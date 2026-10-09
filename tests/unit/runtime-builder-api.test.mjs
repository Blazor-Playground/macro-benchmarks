import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

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
            assert.match(source, /\.withDotnetReady\s*\(/, `${appPath} must register imports from withDotnetReady`);
        }
    }

    assert.ok(blazorAppCount > 0, 'No Blazor app entry modules were found');
});
