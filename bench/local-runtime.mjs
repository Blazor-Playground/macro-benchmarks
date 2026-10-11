import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { runCommand } from './local-command.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeIds = {
    coreclr: 'Microsoft.NETCore.App.Runtime.browser-wasm',
    mono: 'Microsoft.NETCore.App.Runtime.Mono.browser-wasm',
};
const wasmSdkId = 'Microsoft.NET.Sdk.WebAssembly.Pack';
const publicMirror = 'https://pkgs.dev.azure.com/dnceng/public/_packaging/dotnet-public/nuget/v3/index.json';
const help = `Publish Havit against an already-built dotnet/runtime checkout (Node.js >= 24).

node bench/local-runtime.mjs --runtime-repo <path> [options] [-- <measurement options>]

  --runtime <coreclr|mono>             Default: coreclr
  --variant <no-workload|r2r|aot|composite> Default: no-workload; r2r/composite are CoreCLR-only
  --configuration <Release|Debug>      Runtime build configuration (default: Release)
  --sdk <directory>                    Default: <runtime-repo>/.dotnet
  --packages-dir <directory>           Default: artifacts/packages/<configuration>/Shipping
  --runtime-version <version>          Required if multiple runtime package versions exist
  --wasm-sdk-version <version>         Required if multiple WebAssembly package versions exist
  --crossgen2-tasks <directory>         Default: artifacts/bin/Crossgen2Tasks/<configuration>
  --crossgen2-dir <directory>           Default: artifacts/bin/coreclr/browser.wasm.<configuration>/<host-arch>/crossgen2
  --use-sdk-crossgen2                  Explicitly use the base SDK's compiler (mixed-bits experiment)
  --emsdk <directory>                  Mono AOT: override checkout's provisioned Emscripten path
  --tfm <netN.0>                       Optional target framework override
  --aspnet-version <version>           Optional ASP.NET package override, not runtime version
  --exclude-source <name>              Explicitly omit a public NuGet source from repo NuGet.config (repeatable)
  --runtime-commit <sha>               Provenance for an artifact stand-in without a git checkout
  --label <name>                       Output prefix (default: local-havit)
  --measure                           Run existing measure stage after publishing
  --help                              Show this help

Measure options after -- are passed to the helper (e.g. --cold-runs 3 --warm-runs 2).
The local helper also supports --system-chrome (installed Google Chrome; no browser download).
Each invocation creates a fresh artifacts/local-runtime/<label>-<runtime>-<variant>-*/ run.
No source build, SDK/workload installation, checkout modification, commit, or push is performed.`;

export function normalizeVariant(variant, runtime) {
    if (variant === 'r2r') {
        if (runtime !== 'coreclr') throw new Error('R2R requires CoreCLR; use aot for Mono AOT.');
        return 'aot';
    }
    return variant;
}

export function parseOptions(args) {
    const separator = args.indexOf('--');
    const { values } = parseArgs({
        args: separator < 0 ? args : args.slice(0, separator),
        options: {
            'runtime-repo': { type: 'string' },
            runtime: { type: 'string', default: 'coreclr' },
            variant: { type: 'string', default: 'no-workload' },
            configuration: { type: 'string', default: 'Release' },
            sdk: { type: 'string' },
            'packages-dir': { type: 'string' },
            'runtime-version': { type: 'string' },
            'wasm-sdk-version': { type: 'string' },
            'crossgen2-tasks': { type: 'string' },
            'crossgen2-dir': { type: 'string' },
            'use-sdk-crossgen2': { type: 'boolean', default: false },
            emsdk: { type: 'string' },
            tfm: { type: 'string' },
            'aspnet-version': { type: 'string' },
            'exclude-source': { type: 'string', multiple: true },
            'runtime-commit': { type: 'string' },
            label: { type: 'string', default: 'local-havit' },
            measure: { type: 'boolean', default: false },
            help: { type: 'boolean', default: false },
        },
    });
    if (values.help) return values;
    if (!values['runtime-repo']) throw new Error('--runtime-repo is required. See --help.');
    if (!Object.hasOwn(runtimeIds, values.runtime)) throw new Error('--runtime must be coreclr or mono.');
    values.variant = normalizeVariant(values.variant, values.runtime);
    if (!['no-workload', 'aot', 'composite'].includes(values.variant)) throw new Error('Unknown --variant. See --help.');
    if (values.variant === 'composite' && values.runtime !== 'coreclr') throw new Error('Composite requires CoreCLR.');
    if (!['Release', 'Debug'].includes(values.configuration)) throw new Error('--configuration must be Release or Debug.');
    if (values.runtime === 'mono' && values.variant === 'aot' && values.configuration !== 'Release') {
        throw new Error('Mono AOT requires a Release runtime build.');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(values.label)) throw new Error('--label must contain only letters, digits, - and _.');
    if (values.tfm && !/^net\d+\.\d+$/.test(values.tfm)) throw new Error('--tfm must be a TFM such as net12.0.');
    if (values['runtime-commit'] && !/^[a-f0-9]{7,40}$/i.test(values['runtime-commit'])) {
        throw new Error('--runtime-commit must be a git SHA.');
    }
    if (values['use-sdk-crossgen2'] && (values.runtime !== 'coreclr' || values.variant === 'no-workload')) {
        throw new Error('--use-sdk-crossgen2 is only meaningful for CoreCLR aot/composite.');
    }
    if (values['use-sdk-crossgen2'] && values['crossgen2-dir']) {
        throw new Error('Choose --crossgen2-dir or --use-sdk-crossgen2, not both.');
    }
    values.measureArgs = separator < 0 ? [] : args.slice(separator + 1);
    for (const source of values['exclude-source'] ?? []) {
        if (!source || /[;\r\n]/.test(source)) throw new Error('Invalid --exclude-source name.');
    }
    if (values.measureArgs.length && !values.measure) throw new Error('Options after -- require --measure.');
    // MSBuild treats semicolons as property/list separators even in an argv element.
    for (const [key, value] of Object.entries(values)) {
        if (typeof value === 'string' && /[;\r\n]/.test(value)) throw new Error(`Unsupported separator in --${key}.`);
    }
    return values;
}

export async function findPackage(directory, id, version) {
    if (!existsSync(directory)) throw new Error(`Package directory not found: ${directory}`);
    const prefix = `${id}.`;
    const matches = (await readdir(directory)).filter(name =>
        name.startsWith(prefix) && name.endsWith('.nupkg') && !name.endsWith('.symbols.nupkg') &&
        /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(name.slice(prefix.length, -6)),
    );
    const selected = version ? matches.filter(name => name === `${id}.${version}.nupkg`) : matches;
    if (selected.length !== 1) {
        throw new Error(`Expected one ${id} package in ${directory}, found ${selected.length}. ` +
            `Rebuild packs.product, or select an explicit version. Candidates: ${matches.join(', ') || '(none)'}`);
    }
    return { id, version: selected[0].slice(prefix.length, -6), path: join(directory, selected[0]) };
}

function requireFile(path, instruction) {
    if (!existsSync(path)) throw new Error(`Missing ${path}\n${instruction}`);
    return path;
}

export function xmlEscape(value) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function nugetConfig(sources, localIds) {
    return `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
${sources.map(({ key, value }) => `    <add key="${xmlEscape(key)}" value="${xmlEscape(value)}" />`).join('\n')}
  </packageSources>
  <packageSourceMapping>
    <clear />
${sources.map(({ key }, index) => `    <packageSource key="${xmlEscape(key)}">
${(index === 0 ? localIds : ['*']).map(id => `      <package pattern="${xmlEscape(id)}" />`).join('\n')}
    </packageSource>`).join('\n')}
  </packageSourceMapping>
</configuration>
`;
}

export function localPublicSources(repositoryConfig, excluded = [], writeLine = console.log) {
    const configured = [...repositoryConfig.matchAll(/<add\s+key="([^"]+)"\s+value="([^"]+)"\s*\/>/g)]
        .map(match => ({ key: match[1], value: match[2] }));
    const names = new Set(configured.map(source => source.key));
    const exclusions = new Set(excluded);
    for (const key of exclusions) {
        if (!names.has(key)) throw new Error(`Unknown --exclude-source '${key}' in repository NuGet.config.`);
    }
    const sources = [];
    if (!exclusions.has('dotnet-public')) {
        sources.push({ key: 'dotnet-public', value: publicMirror });
        writeLine(`Local public packages: official dotnet-public mirror (${publicMirror}); NuGet.org is not used by this local restore.`);
    }
    for (const source of configured) {
        if (exclusions.has(source.key)) writeLine(`Explicitly excluding NuGet source: ${source.key}`);
        else if (!['nuget.org', 'dotnet-public'].includes(source.key)) sources.push(source);
    }
    return sources;
}

export async function discover(options) {
    const runtimeRepo = resolve(options['runtime-repo']);
    const artifacts = join(runtimeRepo, 'artifacts');
    const configuration = options.configuration;
    const flavor = options.runtime === 'coreclr' ? 'CoreCLR' : 'Mono';
    const build = options.runtime === 'coreclr'
        ? `./build.sh clr+libs+host -os browser -arch wasm -c ${configuration} /p:RuntimeFlavor=${flavor}`
        : `./build.sh mono+libs -os browser -arch wasm -c ${configuration} /p:RuntimeFlavor=${flavor}`;
    const instruction = `In ${runtimeRepo}, run ${build}, then ./build.sh packs.product -os browser -arch wasm -c ${configuration} /p:RuntimeFlavor=${flavor}. ` +
        'On Windows use build.cmd instead of ./build.sh.';
    const sdkDir = resolve(options.sdk ?? join(runtimeRepo, '.dotnet'));
    const dotnetBin = requireFile(join(sdkDir, process.platform === 'win32' ? 'dotnet.exe' : 'dotnet'), instruction);
    const packagesDir = resolve(options['packages-dir'] ?? join(artifacts, 'packages', configuration, 'Shipping'));
    let runtimePack, wasmSdk;
    try {
        runtimePack = await findPackage(packagesDir, runtimeIds[options.runtime], options['runtime-version']);
        wasmSdk = await findPackage(packagesDir, wasmSdkId, options['wasm-sdk-version']);
    } catch (error) {
        throw new Error(`${error.message}\n${instruction}`, { cause: error });
    }
    const result = { runtimeRepo, sdkDir, dotnetBin, packagesDir, runtimePack, wasmSdk };
    if (options.runtime === 'coreclr' && options.variant !== 'no-workload') {
        result.crossgen2Tasks = resolve(options['crossgen2-tasks'] ?? join(artifacts, 'bin', 'Crossgen2Tasks', configuration));
        for (const file of ['Crossgen2Tasks.dll', 'Microsoft.NET.CrossGen.props', 'Microsoft.NET.CrossGen.targets']) {
            requireFile(join(result.crossgen2Tasks, file), instruction);
        }
        if (!options['use-sdk-crossgen2']) {
            result.crossgen2Dir = resolve(options['crossgen2-dir'] ??
                join(artifacts, 'bin', 'coreclr', `browser.wasm.${configuration}`, process.arch, 'crossgen2'));
            requireFile(join(result.crossgen2Dir, process.platform === 'win32' ? 'crossgen2.exe' : 'crossgen2'),
                `${instruction}\nUse --crossgen2-dir for a different host-tool layout. ` +
                '--use-sdk-crossgen2 is an explicit mixed-bits fallback, not a local compiler test.');
        }
    }
    if (options.runtime === 'mono' && options.variant === 'aot') {
        try {
            result.monoPackages = await Promise.all([
                'Microsoft.NET.Runtime.WebAssembly.Sdk',
                'Microsoft.NET.Runtime.MonoAOTCompiler.Task',
                'Microsoft.NET.Runtime.MonoTargets.Sdk',
            ].map(id => findPackage(packagesDir, id, wasmSdk.version)));
        } catch (error) {
            throw new Error(`${error.message}\n${instruction}`, { cause: error });
        }
        result.monoCompiler = requireFile(join(artifacts, 'bin', 'mono', `browser.wasm.${configuration}`,
            'cross', 'browser-wasm', process.platform === 'win32' ? 'mono-aot-cross.exe' : 'mono-aot-cross'),
        `${instruction}\nAlso build mono.aotcross -os browser -arch wasm -c Release.`);
        const emscriptenVersion = (await readFile(requireFile(join(runtimeRepo, 'src', 'mono', 'browser',
            'emscripten-version.txt'), instruction), 'utf8')).trim();
        const host = `${process.platform === 'darwin' ? 'osx' : process.platform === 'win32' ? 'windows' : 'linux'}-${process.arch}`;
        result.emsdk = resolve(options.emsdk ?? join(process.env.DOTNET_WASM_TOOL_CACHE_DIR ??
            join(runtimeRepo, '.dotnet', 'wasm-tools'), 'emscripten', `${emscriptenVersion}-${host}`));
        requireFile(join(result.emsdk, 'emscripten', 'emcc.py'),
            'Provision the checkout toolchain with ./build.sh provision.emsdk -os browser, ' +
            'or pass --emsdk <provisioned directory> (especially for runtime git worktrees).');
    }
    return result;
}

async function hashPackage(pack) {
    return { ...pack, sha512: createHash('sha512').update(await readFile(pack.path)).digest('base64') };
}

function capture(command, args, cwd, env) {
    return execFileSync(command, args, { cwd, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
}

async function runStep(command, args, cwd, env, logPath) {
    return runCommand(command, args, { cwd, env, logPath });
}

async function integrity(directory) {
    let fileCount = 0, totalBytes = 0;
    for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        fileCount++;
        totalBytes += (await stat(join(entry.parentPath, entry.name))).size;
    }
    return { fileCount, totalBytes };
}

export async function provenance(runtimeRepo, explicitCommit) {
    if (existsSync(join(runtimeRepo, '.git'))) {
        const hash = capture('git', ['rev-parse', 'HEAD'], runtimeRepo);
        if (explicitCommit && !hash.startsWith(explicitCommit)) throw new Error('--runtime-commit does not match checkout HEAD.');
        return {
            checkout: runtimeRepo,
            hash,
            date: capture('git', ['show', '-s', '--format=%cI', 'HEAD'], runtimeRepo),
            author: capture('git', ['show', '-s', '--format=%an', 'HEAD'], runtimeRepo),
            message: capture('git', ['show', '-s', '--format=%s', 'HEAD'], runtimeRepo),
            dirty: !!capture('git', ['status', '--porcelain'], runtimeRepo),
        };
    }
    if (!explicitCommit) throw new Error('No .git in runtime checkout. For artifact stand-ins, pass --runtime-commit <actual source SHA>.');
    return { checkout: runtimeRepo, hash: explicitCommit, date: '', author: '',
        message: 'Artifact stand-in; source checkout unavailable', dirty: null };
}

export async function publish(options) {
    const tar = process.env.BENCH_TAR ?? 'tar';
    const local = await discover(options);
    const source = await provenance(local.runtimeRepo, options['runtime-commit']);
    const outputRoot = join(repoRoot, 'artifacts', 'local-runtime');
    await mkdir(outputRoot, { recursive: true });
    const runDir = await mkdtemp(join(outputRoot, `${options.label}-${options.runtime}-${options.variant}-`));
    for (const directory of ['logs', 'packages', 'dotnet-home', 'tmp', 'results']) {
        await mkdir(join(runDir, directory));
    }
    const env = {
        ...process.env,
        DOTNET_ROOT: local.sdkDir,
        DOTNET_CLI_HOME: join(runDir, 'dotnet-home'),
        NUGET_PACKAGES: join(runDir, 'packages'),
        TMPDIR: join(runDir, 'tmp'), TMP: join(runDir, 'tmp'), TEMP: join(runDir, 'tmp'),
        DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1',
        DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
    };
    const sdkVersion = capture(local.dotnetBin, ['--version'], options.sdk ? local.sdkDir : local.runtimeRepo, env);
    requireFile(join(local.sdkDir, 'sdk', sdkVersion, 'Microsoft.NETCoreSdk.BundledVersions.props'),
        'The selected bootstrap SDK was not found under --sdk. Supply a compatible SDK directory.');
    // Freeze selection outside the runtime checkout; neither repo's global.json is edited.
    await writeFile(join(runDir, 'global.json'), JSON.stringify({
        sdk: { version: sdkVersion, rollForward: 'disable', allowPrerelease: true },
    }, null, 2));
    const project = join(repoRoot, 'src', 'havit-bootstrap', 'HavitBootstrap.csproj');
    const packages = await Promise.all([local.runtimePack, local.wasmSdk, ...(local.monoPackages ?? [])].map(hashPackage));
    const sources = [{ key: 'local-runtime', value: local.packagesDir }];
    for (const directory of [join(repoRoot, 'artifacts', 'nuget-packages'),
        process.env.NUGET_PACKAGES ?? join(homedir(), '.nuget', 'packages')]) {
        if (existsSync(directory)) sources.push({ key: `cache-${sources.length}`, value: directory });
    }
    const repositoryConfig = await readFile(join(repoRoot, 'NuGet.config'), 'utf8');
    sources.push(...localPublicSources(repositoryConfig, options['exclude-source']));
    const configPath = join(runDir, 'NuGet.config');
    await writeFile(configPath, nugetConfig(sources, packages.map(pack => pack.id)));
    const label = basename(runDir);
    const preset = options.variant === 'no-workload' ? 'no-workload' : 'aot';
    const common = [
        `/p:CustomAfterMicrosoftCommonTargets=${join(repoRoot, 'bench', 'local-runtime.targets')}`,
        `/p:LocalRuntimePackVersion=${local.runtimePack.version}`,
        `/p:LocalWebAssemblySdkPackVersion=${local.wasmSdk.version}`,
        `/p:BenchmarkPreset=${preset === 'aot' ? 'Aot' : 'NoWorkload'}`,
        `/p:RuntimeFlavor=${options.runtime === 'coreclr' ? 'CoreCLR' : 'Mono'}`,
        '/p:Configuration=Release', `/p:BuildLabel=${label}`,
        `/p:RestoreConfigFile=${configPath}`, '/p:UsingBrowserRuntimeWorkload=false',
        '/p:MSBuildDisableTaskHost=true', '/p:UseSharedCompilation=false',
        '-m:1', '/nr:false',
    ];
    if (options.tfm) common.push(`/p:BenchmarkTargetFramework=${options.tfm}`);
    if (options['aspnet-version']) common.push(`/p:MicrosoftAspNetCoreVersion=${options['aspnet-version']}`);
    if (local.crossgen2Tasks) common.push(
        `/p:Crossgen2SdkOverridePropsPath=${join(local.crossgen2Tasks, 'Microsoft.NET.CrossGen.props')}`,
        `/p:Crossgen2SdkOverrideTargetsPath=${join(local.crossgen2Tasks, 'Microsoft.NET.CrossGen.targets')}`,
    );
    if (local.crossgen2Dir) common.push(`/p:Crossgen2InBuildDir=${local.crossgen2Dir}`);
    if (options.variant === 'composite') {
        const targets = capture(tar, ['-xOf', local.wasmSdk.path,
            'build/Microsoft.NET.Sdk.WebAssembly.Browser.CoreCLR.targets'], runDir);
        if (!targets.includes('PublishReadyToRunComposite')) {
            throw new Error('Local WebAssembly pack does not support composite R2R. Rebuild a checkout containing composite support.');
        }
        common.push('/p:PublishReadyToRunComposite=true');
    }
    if (local.monoPackages) {
        const directories = [];
        for (const pack of local.monoPackages) {
            const directory = join(runDir, 'native-tools', pack.id);
            await mkdir(directory, { recursive: true });
            capture(tar, ['-xf', pack.path, '-C', directory], runDir);
            directories.push(directory);
        }
        common.push(
            '/p:MSBuildEnableWorkloadResolver=false',
            `/p:LocalMonoWebAssemblySdkDir=${directories[0]}`,
            `/p:LocalMonoAotTasksDir=${directories[1]}`,
            `/p:LocalMonoTargetsDir=${directories[2]}`,
            `/p:LocalMonoAotCompiler=${local.monoCompiler}`,
            `/p:EMSDK_PATH=${local.emsdk}`,
            '/p:WasmUseEMSDK_PATH=true',
        );
    }
    const properties = JSON.parse(capture(local.dotnetBin, ['msbuild', project, ...common,
        '-getProperty:TargetFramework,MicrosoftAspNetCoreVersion,NETCoreSdkVersion,NETCoreSdkRuntimeIdentifier'],
    runDir, env)).Properties;
    console.log(`SDK: ${sdkVersion} (${local.sdkDir}); TFM: ${properties.TargetFramework}`);
    console.log(`Local packs: ${packages.map(pack => `${pack.id}/${pack.version}`).join(', ')}`);
    if (options['use-sdk-crossgen2']) console.warn('WARNING: using base SDK crossgen2, not the local compiler.');
    console.log(`Run: ${runDir}`);
    await writeFile(join(runDir, 'inputs.json'), JSON.stringify({ options, local, source, sdkVersion, properties, packages }, null, 2));
    await runStep(local.dotnetBin, ['restore', project, ...common, '--verbosity', 'minimal'],
        runDir, env, join(runDir, 'logs', 'restore.log'));
    for (const pack of packages.slice(0, 2)) {
        const restored = join(env.NUGET_PACKAGES, pack.id.toLowerCase(), pack.version.toLowerCase(),
            `${pack.id.toLowerCase()}.${pack.version.toLowerCase()}.nupkg`);
        const restoredHash = createHash('sha512').update(await readFile(restored)).digest('base64');
        if (restoredHash !== pack.sha512) throw new Error(`Restored ${pack.id} does not match the local build. Refusing to publish.`);
    }
    const publishDir = join(runDir, 'publish');
    const compileTimeMs = await runStep(local.dotnetBin, [
        'publish', project, '--no-restore', ...common, '-o', publishDir, '--verbosity', 'minimal',
        '/p:DisableParallelEmccCompile=true', '/p:DisableParallelAot=true',
        `-bl:${join(runDir, 'logs', 'publish.binlog')}`,
    ], runDir, env, join(runDir, 'logs', 'publish.log'));
    requireFile(join(publishDir, 'wwwroot', 'index.html'), 'Publish did not produce a browser app.');
    if (options.variant === 'composite' && !(await readdir(join(publishDir, 'wwwroot', '_framework')))
        .some(name => /^Havit\.Blazor\.Documentation\.r2r(?:\.[^.]+)?\.wasm$/.test(name))) {
        throw new Error('Composite publish did not produce the Havit.Blazor.Documentation.r2r*.wasm owner image.');
    }
    const manifest = {
        runDir, repoRoot, sdkDir: local.sdkDir, dotnetBin: local.dotnetBin, buildLabel: label,
        runtime: options.runtime, preset, variant: options.variant, configuration: options.configuration,
        compileTimeMs, publishDir, integrity: await integrity(publishDir),
        sdkInfo: {
            sdkVersion, major: Number(sdkVersion.split('.')[0]), minor: Number(sdkVersion.split('.')[1]),
            patch: Number(sdkVersion.split('.')[2].split('-')[0]), channel: sdkVersion.split('.').slice(0, 2).join('.'),
            isPrerelease: sdkVersion.includes('-'), runtimeGitHash: source.hash,
            runtimeCommitDateTime: source.date,
            runtimeCommitAuthor: source.author, runtimeCommitMessage: source.message,
            runtimePackVersion: local.runtimePack.version, aspnetCoreVersion: properties.MicrosoftAspNetCoreVersion,
            aspnetCoreGitHash: '', aspnetCoreCommitDateTime: '', aspnetCoreCommitAuthor: '', aspnetCoreCommitMessage: '',
            sdkGitHash: '', vmrGitHash: '', workloadVersion: local.wasmSdk.version,
            bootstrapSdkVersion: sdkVersion, releaseDate: '', isRuntimeCustomBuild: true,
            bundledFrameworkTfm: properties.TargetFramework,
            localRuntime: { variant: options.variant, source, packages, compiler: local.crossgen2Dir ?? local.monoCompiler ?? null,
                usesSdkCrossgen2: options['use-sdk-crossgen2'] },
        },
    };
    const manifestPath = join(runDir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Published: ${publishDir}\nManifest: ${manifestPath}`);
    if (options.measure) {
        const tsx = requireFile(join(repoRoot, 'bench', 'node_modules', 'tsx', 'dist', 'loader.mjs'),
            'Run npm ci --prefix bench, then rerun measurement using the saved manifest.');
        await runStep(process.execPath, ['--import', tsx, join(repoRoot, 'bench', 'src', 'scripts', 'measure-local-runtime.ts'),
            manifestPath, ...options.measureArgs], repoRoot, env, join(runDir, 'logs', 'measure.log'));
    }
    return manifestPath;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    try {
        const options = parseOptions(process.argv.slice(2));
        if (options.help) console.log(help);
        else {
            if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js >= 24 is required.');
            await publish(options);
        }
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
