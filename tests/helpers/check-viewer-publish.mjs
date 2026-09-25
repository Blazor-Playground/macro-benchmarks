import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.env.VIEWER_WWWROOT ?? 'artifacts/bench-viewer/wwwroot');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
assert(html.includes('<base href="/macro-benchmarks/"'));
const importMap = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
assert(importMap, 'Published import map missing');
const mapping = JSON.parse(importMap[1]);
for (const module of ['focus-types', 'focus-selection', 'focus-data', 'focus-loader', 'focus-chart', 'focus-interop']) {
    const original = `./chart/${module}.js`;
    const fingerprinted = mapping.imports[original];
    assert(fingerprinted && fingerprinted !== original, `${original} not fingerprinted`);
    const bytes = await readFile(resolve(root, fingerprinted));
    assert.equal(mapping.integrity[fingerprinted], `sha256-${createHash('sha256').update(bytes).digest('base64')}`);
}
const resources = [...html.matchAll(/(?:src|href)="([^"]+\.(?:css|js|mjs|png))"/g)].map(match => match[1]);
for (const resource of resources) assert((await stat(resolve(root, resource))).isFile(), resource);
assert((await stat(resolve(root, 'lib/bootstrap/LICENSE'))).isFile());
const bootstrap = resources.find(resource => resource.startsWith('main.') && resource.endsWith('.mjs'));
assert(bootstrap && (await readFile(resolve(root, bootstrap), 'utf8')).includes("setModuleImports('focus-interop.js'"));
console.log(`Published viewer verified: ${root}`);
console.log('Six fingerprinted focus modules, SHA-256 import-map integrity, runtime entry points, CSS, and explicit module registration.');
