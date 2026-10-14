import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const runtimeId = 'Microsoft.NETCore.App.Runtime.browser-wasm';
const wasmSdkId = 'Microsoft.NET.Sdk.WebAssembly.Pack';

function requireFile(path, instruction) {
    if (!existsSync(path)) throw new Error(`Missing ${path}\n${instruction}`);
    return path;
}

export async function findPackage(directory, id) {
    if (!existsSync(directory)) throw new Error(`Package directory not found: ${directory}`);
    const matches = (await readdir(directory)).filter(name =>
        name.startsWith(`${id}.`) && name.endsWith('.nupkg') && !name.endsWith('.symbols.nupkg') &&
        /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(name.slice(id.length + 1, -6)));
    if (matches.length !== 1) {
        throw new Error(`Expected one ${id} package in ${directory}, found ${matches.length}: ${matches.join(', ') || '(none)'}`);
    }
    return { id, version: matches[0].slice(id.length + 1, -6), path: join(directory, matches[0]) };
}

function escapeXml(value) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function localNugetConfig(shipping, repositoryConfig) {
    const sources = [...repositoryConfig.matchAll(/<add\s+key="([^"]+)"\s+value="([^"]+)"\s*\/>/g)]
        .map(([, key, value]) => ({ key, value }));
    if (!sources.length || sources.some(source => source.key === 'local-runtime')) {
        throw new Error('Expected public sources and no local-runtime source in NuGet.config.');
    }
    return `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="local-runtime" value="${escapeXml(shipping)}" />
${sources.map(source => `    <add key="${escapeXml(source.key)}" value="${escapeXml(source.value)}" />`).join('\n')}
  </packageSources>
  <packageSourceMapping>
    <clear />
    <packageSource key="local-runtime">
      <package pattern="${runtimeId}" />
      <package pattern="${wasmSdkId}" />
    </packageSource>
${sources.map(source => `    <packageSource key="${escapeXml(source.key)}"><package pattern="*" /></packageSource>`).join('\n')}
  </packageSourceMapping>
</configuration>
`;
}

export function localProperties({ runtimePack, wasmSdk, crossgen2Tasks, crossgen2Dir, targets, configPath }) {
    return [
        `/p:CustomAfterMicrosoftCommonTargets=${targets}`,
        `/p:LocalRuntimePackVersion=${runtimePack.version}`,
        `/p:LocalWebAssemblySdkPackVersion=${wasmSdk.version}`,
        `/p:Crossgen2SdkOverridePropsPath=${join(crossgen2Tasks, 'Microsoft.NET.CrossGen.props')}`,
        `/p:Crossgen2SdkOverrideTargetsPath=${join(crossgen2Tasks, 'Microsoft.NET.CrossGen.targets')}`,
        `/p:Crossgen2InBuildDir=${crossgen2Dir}`,
        `/p:RestoreConfigFile=${configPath}`,
        '/p:UseSharedCompilation=false',
    ];
}

export async function prepareLocalRuntime(checkout, configuration, root, artifacts) {
    const runtimeRepo = resolve(checkout);
    if ([runtimeRepo, root, artifacts].some(path => /[;\r\n]/.test(path))) {
        throw new Error('Paths containing semicolons or newlines cannot be passed to MSBuild.');
    }
    const shipping = join(runtimeRepo, 'artifacts', 'packages', configuration, 'Shipping');
    const build = `Build and package ${configuration} browser CoreCLR in ${runtimeRepo}: ` +
        `./build.sh clr+libs+host -os browser -arch wasm -c ${configuration} /p:RuntimeFlavor=CoreCLR; ` +
        `./build.sh packs.product -os browser -arch wasm -c ${configuration} /p:RuntimeFlavor=CoreCLR`;
    const [runtimePack, wasmSdk] = await Promise.all([
        findPackage(shipping, runtimeId), findPackage(shipping, wasmSdkId),
    ]).catch(error => { throw new Error(`${error.message}\n${build}`, { cause: error }); });
    const sdkDir = join(runtimeRepo, '.dotnet');
    const dotnet = requireFile(join(sdkDir, process.platform === 'win32' ? 'dotnet.exe' : 'dotnet'), build);
    const crossgen2Tasks = join(runtimeRepo, 'artifacts', 'bin', 'Crossgen2Tasks', configuration);
    for (const name of ['Crossgen2Tasks.dll', 'Microsoft.NET.CrossGen.props', 'Microsoft.NET.CrossGen.targets']) {
        requireFile(join(crossgen2Tasks, name), build);
    }
    const crossgen2Dir = join(runtimeRepo, 'artifacts', 'bin', 'coreclr',
        `browser.wasm.${configuration}`, process.arch, 'crossgen2');
    requireFile(join(crossgen2Dir, process.platform === 'win32' ? 'crossgen2.exe' : 'crossgen2'), build);
    requireFile(join(runtimeRepo, '.git'), 'Use a dotnet/runtime Git checkout to record the source revision.');
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: runtimeRepo, encoding: 'utf8' }).trim();
    const dirty = !!execFileSync('git', ['status', '--porcelain'], { cwd: runtimeRepo, encoding: 'utf8' }).trim();
    if (dirty) console.warn('Runtime checkout has local changes; its HEAD alone does not identify the built source.');
    const sdk = execFileSync(dotnet, ['--version'], {
        cwd: runtimeRepo, env: { ...process.env, DOTNET_ROOT: sdkDir, DOTNET_NOLOGO: '1' }, encoding: 'utf8',
    }).trim();
    requireFile(join(sdkDir, 'sdk', sdk, 'Microsoft.NETCoreSdk.BundledVersions.props'),
        'Build the checkout with its bootstrap SDK, or install the SDK selected by its global.json.');
    await mkdir(artifacts, { recursive: true });
    const runDir = await mkdtemp(join(artifacts, `local-runtime-${configuration.toLowerCase()}-`));
    const configPath = join(runDir, 'NuGet.config');
    await writeFile(join(runDir, 'global.json'), JSON.stringify({
        sdk: { version: sdk, rollForward: 'disable', allowPrerelease: true },
    }, null, 2));
    await writeFile(configPath, localNugetConfig(shipping, await readFile(join(root, 'NuGet.config'), 'utf8')));
    const env = {
        DOTNET_ROOT: sdkDir, DOTNET_CLI_HOME: join(runDir, 'home'),
        NUGET_PACKAGES: join(runDir, 'packages'), DOTNET_NOLOGO: '1',
    };
    const properties = localProperties({
        runtimePack, wasmSdk, crossgen2Tasks, crossgen2Dir,
        targets: join(root, 'src', 'local-runtime.targets'), configPath,
    });
    const packages = await Promise.all([runtimePack, wasmSdk].map(async pack => ({
        ...pack, sha512: createHash('sha512').update(await readFile(pack.path)).digest('base64'),
    })));
    const source = {
        checkout: runtimeRepo, commit: sha, dirty, configuration,
        runtimePackVersion: runtimePack.version, wasmSdkVersion: wasmSdk.version,
        crossgen2Dir, packages: packages.map(({ id, version, sha512 }) => ({ id, version, sha512 })), runDir,
    };
    console.log(`Local runtime: ${sha}${dirty ? ' (dirty)' : ''}, ${configuration}, SDK ${sdk}`);
    console.log(`Packs: runtime ${runtimePack.version}, WebAssembly ${wasmSdk.version}; compiler: ${crossgen2Dir}`);
    return { cwd: runDir, env, dotnet, sdk, properties, source, packages };
}

export async function verifyLocalPackages({ env, packages }) {
    for (const pack of packages) {
        const name = `${pack.id.toLowerCase()}.${pack.version.toLowerCase()}.nupkg`;
        const restored = join(env.NUGET_PACKAGES, pack.id.toLowerCase(), pack.version.toLowerCase(), name);
        const expected = pack.sha512 ?? createHash('sha512').update(await readFile(pack.path)).digest('base64');
        const actual = createHash('sha512').update(await readFile(restored)).digest('base64');
        if (actual !== expected) throw new Error(`Restored ${pack.id} does not match the local build.`);
    }
}
