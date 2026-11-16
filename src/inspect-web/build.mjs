#!/usr/bin/env node
// build.mjs — restore/publish driver for the inspect-web benchmark app (see README.md).
//
//   node build.mjs restore --checkout <dir> --repository <url> --commit <sha> --dotnet <path> [--property K=V]...
//   node build.mjs publish ... --out <publishDir> [--maxcpucount <n>]
//
// restore: check out the pinned dotnet-inspect commit, retarget it, restore DotnetInspect.Web,
//          build the Vite frontend once per checkout, and download the nuget.org fixtures.
// publish: publish DotnetInspect.Web into <publishDir>, then stage the bench readiness script and
//          fixtures into <publishDir>/wwwroot.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const nugetConfig = join(here, 'NuGet.inspect-web.config');
const hostProject = join('src', 'DotnetInspect.Web', 'DotnetInspect.Web.csproj');

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const opts = { command, properties: [] };
    for (let i = 0; i < rest.length; i++) {
        const key = rest[i];
        const value = rest[++i];
        if (value === undefined) throw new Error(`Missing value for ${key}`);
        switch (key) {
            case '--checkout': opts.checkout = resolve(value); break;
            case '--repository': opts.repository = value; break;
            case '--commit': opts.commit = value; break;
            case '--dotnet': opts.dotnet = value; break;
            case '--out': opts.out = resolve(value); break;
            case '--maxcpucount': opts.maxCpuCount = value; break;
            case '--property': opts.properties.push(value); break;
            default: throw new Error(`Unknown argument ${key}`);
        }
    }
    for (const required of ['checkout', 'repository', 'commit', 'dotnet']) {
        if (!opts[required]) throw new Error(`--${required} is required`);
    }
    if (command !== 'restore' && command !== 'publish') {
        throw new Error(`Unknown command '${command}' (expected restore or publish)`);
    }
    if (command === 'publish' && !opts.out) throw new Error('--out is required for publish');
    return opts;
}

function log(message) {
    console.log(`[inspect-web] ${message}`);
}

function run(file, args, { cwd, env, capture = false } = {}) {
    log(`${file} ${args.join(' ')}`);
    const result = spawnSync(file, args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`${file} ${args.join(' ')} exited with ${result.status}`);
    }
    return result.stdout ?? '';
}

function git(args, cwd) {
    return run('git', args, { cwd, capture: true }).trim();
}

function ensureCheckout({ checkout, repository, commit }) {
    if (!existsSync(join(checkout, '.git'))) {
        rmSync(checkout, { recursive: true, force: true });
        mkdirSync(checkout, { recursive: true });
        git(['init', '--quiet'], checkout);
        git(['remote', 'add', 'origin', repository], checkout);
    }
    let head = '';
    try { head = git(['rev-parse', 'HEAD'], checkout); } catch { /* empty repository */ }
    if (head !== commit) {
        git(['fetch', '--quiet', '--depth', '1', 'origin', commit], checkout);
        git(['checkout', '--quiet', '--force', commit], checkout);
    }
    // Discard any previous patching so the patch below always applies to pristine sources.
    git(['reset', '--quiet', '--hard', commit], checkout);
    patchCheckout(checkout);
}

// Upstream pins an exact .NET 11 SDK and hardcodes net11.0 in the Inspect Web host and facade
// projects. Drop the SDK pin and route those projects through $(DefaultTargetFramework), which
// the wrapper sets to $(BenchmarkTargetFramework) for every project in the graph.
function patchCheckout(checkout) {
    rmSync(join(checkout, 'global.json'), { force: true });
    const srcDir = join(checkout, 'src');
    let patched = 0;
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const projectFile = join(srcDir, entry.name, `${entry.name}.csproj`);
        if (!existsSync(projectFile)) continue;
        const text = readFileSync(projectFile, 'utf8');
        const next = text.replace(
            /<TargetFramework>net\d+\.\d+<\/TargetFramework>/,
            '<TargetFramework>$(DefaultTargetFramework)</TargetFramework>',
        );
        if (next !== text) {
            writeFileSync(projectFile, next);
            patched++;
        }
    }
    if (patched === 0) throw new Error('No hardcoded TargetFramework found to patch; review build.mjs against the pinned commit.');
    log(`Retargeted ${patched} project(s) to $(DefaultTargetFramework)`);
}

// Upstream sets ArtifactsPath to the unnormalized '$(MSBuildThisFileDirectory)../artifacts', so every
// R2R OutputR2RImage contains 'src/..'. The WebAssembly SDK's _WasmCoreClrPruneStalePerAppR2R then
// fails to match those paths against its normalized obj/R2R glob and deletes the images it just
// compiled, publishing the app without R2R code. Pass the same directory, normalized.
function propertyArgs(opts) {
    return [`-p:ArtifactsPath=${join(opts.checkout, 'artifacts')}`, ...opts.properties.map(p => `-p:${p}`)];
}

function dotnetEnv(dotnet) {
    const dotnetDir = dirname(dotnet);
    return {
        DOTNET: dotnet,
        DOTNET_ROOT: process.env.DOTNET_ROOT ?? dotnetDir,
        PATH: `${dotnetDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
        DOTNET_CLI_TELEMETRY_OPTOUT: '1',
        DOTNET_NOLOGO: '1',
    };
}

// The frontend facade compiler needs the SDK-owned dotnet.d.ts. Upstream only looks for the Mono
// runtime pack, so resolve whichever browser-wasm runtime pack this flavor restored.
function resolveDotnetDeclaration(opts, env) {
    const stdout = run(opts.dotnet, [
        'msbuild', hostProject, '-nologo',
        ...propertyArgs(opts),
        '-target:ProcessFrameworkReferences',
        '-getProperty:NuGetPackageRoot',
        '-getItem:RuntimePack',
    ], { cwd: opts.checkout, env, capture: true });
    const parsed = JSON.parse(stdout);
    const packs = (parsed.Items?.RuntimePack ?? []).filter(pack =>
        /^Microsoft\.NETCore\.App\.Runtime(\.Mono)?\.browser-wasm$/.test(pack.Identity));
    if (packs.length !== 1) {
        throw new Error(`Expected one browser-wasm runtime pack, found ${packs.length}`);
    }
    const pack = packs[0];
    const packageDir = pack.PackageDirectory
        || join(parsed.Properties.NuGetPackageRoot, pack.NuGetPackageId.toLowerCase(), pack.NuGetPackageVersion);
    const declaration = join(packageDir, 'runtimes', 'browser-wasm', 'native', 'dotnet.d.ts');
    if (!existsSync(declaration)) throw new Error(`dotnet.d.ts not found at ${declaration}`);
    return declaration;
}

function buildFrontend(opts, env) {
    const webDir = join(opts.checkout, 'inspect-web');
    const stamp = join(webDir, 'dist', '.bench-frontend-built');
    if (existsSync(stamp)) {
        log('Frontend already built for this checkout');
        return;
    }
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    run(npm, ['ci', '--no-audit', '--no-fund'], { cwd: webDir, env });
    run(npm, ['run', 'build'], { cwd: webDir, env });
    writeFileSync(stamp, `${opts.commit}\n`);
}

function fixturesDir(opts) {
    return join(dirname(opts.checkout), 'fixtures');
}

async function downloadFixtures(opts) {
    const manifest = JSON.parse(readFileSync(join(here, 'fixtures.json'), 'utf8'));
    for (const file of manifest.files) {
        const target = join(fixturesDir(opts), file.path);
        if (existsSync(target)) continue;
        log(`Downloading fixture ${file.url}`);
        const response = await fetch(file.url);
        if (!response.ok) throw new Error(`Fixture download failed: ${file.url} → HTTP ${response.status}`);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, Buffer.from(await response.arrayBuffer()));
    }
}

async function restore(opts) {
    ensureCheckout(opts);
    // Inner outputs live in the checkout; start every preset/runtime combination clean.
    rmSync(join(opts.checkout, 'artifacts'), { recursive: true, force: true });
    const env = dotnetEnv(opts.dotnet);
    run(opts.dotnet, ['restore', hostProject, '--configfile', nugetConfig, ...propertyArgs(opts)],
        { cwd: opts.checkout, env });
    const declaration = resolveDotnetDeclaration(opts, env);
    writeFileSync(join(opts.checkout, '.bench-dotnet-dts'), declaration);
    buildFrontend(opts, { ...env, DOTNET_DTS: declaration });
    await downloadFixtures(opts);
}

function stageBenchAssets(opts) {
    const webRoot = join(opts.out, 'wwwroot');
    const indexPath = join(webRoot, 'index.html');
    if (!existsSync(indexPath)) throw new Error(`Published index.html not found at ${indexPath}`);

    cpSync(join(here, 'bench-ready.js'), join(webRoot, 'bench-ready.js'));
    const html = readFileSync(indexPath, 'utf8');
    if (!html.includes('bench-ready.js')) {
        const tag = '<script src="/bench-ready.js"></script>';
        const next = html.replace(/<head>/i, `<head>\n    ${tag}`);
        if (next === html) throw new Error('Could not inject bench-ready.js into index.html');
        writeFileSync(indexPath, next);
    }
    // The static server prefers precompressed variants; drop any stale ones for the edited page.
    rmSync(`${indexPath}.br`, { force: true });
    rmSync(`${indexPath}.gz`, { force: true });

    cpSync(fixturesDir(opts), join(webRoot, 'inspect-web-fixtures'), { recursive: true });
    cpSync(join(here, 'fixtures.json'), join(webRoot, 'inspect-web-fixtures', 'fixtures.json'));
}

function publish(opts) {
    const declarationFile = join(opts.checkout, '.bench-dotnet-dts');
    if (!existsSync(declarationFile)) throw new Error('Run restore before publish');
    const env = { ...dotnetEnv(opts.dotnet), DOTNET_DTS: readFileSync(declarationFile, 'utf8').trim() };
    run(opts.dotnet, [
        'publish', hostProject, '--no-restore',
        '-o', opts.out,
        ...(opts.maxCpuCount ? [`-maxcpucount:${opts.maxCpuCount}`] : []),
        `-bl:${join(opts.out, 'inspect-web-inner.binlog')}`,
        ...propertyArgs(opts),
    ], { cwd: opts.checkout, env });
    stageBenchAssets(opts);
}

const opts = parseArgs(process.argv.slice(2));
try {
    if (opts.command === 'restore') {
        await restore(opts);
    } else {
        publish(opts);
    }
} catch (e) {
    console.error(`[inspect-web] error: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
}
