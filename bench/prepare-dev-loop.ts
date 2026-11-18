import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import type { BenchContext } from './src/context.js';
import { installedDebugSdk, publishedDebugSdk, selectDebugMonoSdk } from './src/lib/debug-sdk.js';
import { resolveGitHubToken } from './src/lib/http.js';

const { values } = parseArgs({ options: {
    dotnet: { type: 'string' }, context: { type: 'string' },
    'install-script': { type: 'string' }, 'mono-sdk-dir': { type: 'string' },
} });
if (!values.dotnet || !values.context || !values['install-script'] || !values['mono-sdk-dir']) {
    throw new Error('Required: --dotnet <path> --context <json> --install-script <dotnet-install.sh> --mono-sdk-dir <owned-directory>');
}
const context: Partial<BenchContext> = JSON.parse(await readFile(values.context, 'utf8'));
const primary = await installedDebugSdk(values.dotnet, context.sdkInfo);
const token = await resolveGitHubToken();
const info = context.sdkInfo ?? await publishedDebugSdk(primary.sdk.version, primary.rid, fetch, token);
if (!info || info.runtimePackVersion !== primary.runtimeVersion) throw new Error('Installed SDK does not match the published SDK provenance');
const selection = await selectDebugMonoSdk(info, primary.rid, fetch, token);
context.sdkInfo = info;
context.debugDotnet = primary.dotnet;
delete context.debugMonoDotnet;
delete context.debugMonoSdkInfo;
delete context.debugMonoFallback;
if (selection.fallback) {
    console.log(selection.fallback.reason);
    await promisify(execFile)('bash', [
        values['install-script'], '--version', selection.sdk.sdkVersion, '--architecture', primary.rid.split('-').at(-1)!,
        '--install-dir', values['mono-sdk-dir'],
    ], { maxBuffer: 8 * 1024 * 1024, timeout: 15 * 60_000 }).then(result => console.log(result.stdout));
    const mono = await installedDebugSdk(join(values['mono-sdk-dir'], 'dotnet'), selection.sdk);
    if (!mono.sdk.version.startsWith('11.') || mono.runtimeVersion !== selection.sdk.runtimePackVersion
        || mono.rid !== primary.rid) throw new Error('Mono fallback SDK/version/architecture does not match the selected release/11.0 SDK');
    context.debugMonoDotnet = mono.dotnet;
    context.debugMonoSdkInfo = selection.sdk;
    context.debugMonoFallback = selection.fallback;
} else {
    console.log(`Mono pack ${primary.runtimeVersion} is available; both runtimes keep SDK ${primary.sdk.version}`);
}
await writeFile(values.context, JSON.stringify(context, null, 2) + '\n');
