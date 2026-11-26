import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const original = '.withModuleConfig({';
const replacement = `.withModuleConfig({ ...bootstrapper.asDotnetConfig(),
                            onRuntimeInitialized: () => { globalThis.bench_runtime_initialized ??= performance.now(); },
                            onDotnetReady: (...args) => {
                                globalThis.bench_runtime_ready ??= { at: performance.now(), source: 'onDotnetReady' };
                                return bootstrapper.onDotnetReady(...args);
                            },`;

export function fixBootstrap(source) {
    if (source.split(original).length !== 2) {
        throw new Error('Unexpected Uno bootstrap: expected exactly one withModuleConfig call. Review the .NET 12 lifecycle workaround.');
    }
    if (source.includes(replacement)) return source;
    return source.replace(original, replacement);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const path = process.argv[2];
    if (!path) throw new Error('Usage: node fix-bootstrap.mjs <uno-bootstrap.js>');
    const source = await readFile(path, 'utf8');
    const patched = fixBootstrap(source);
    if (patched !== source) {
        await writeFile(path, patched);
        console.log('Registered Uno bootstrap lifecycle callbacks through withModuleConfig for .NET 12.');
    }
}
