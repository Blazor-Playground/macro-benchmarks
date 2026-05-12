import { mkdir, readdir, cp, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { type BenchContext } from '../context.js';
import { exec } from '../exec.js';
import { execSync } from 'node:child_process';
import { banner, info, err } from '../log.js';

// ── Constants ────────────────────────────────────────────────────────────────

const PACKAGES_DIR_NAME = 'aspnetcore-packages';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getAspNetCoreCloneDir(artifactsDir: string): string {
    return join(artifactsDir, 'aspnetcore-src');
}

function getPackagesDir(artifactsDir: string): string {
    return join(artifactsDir, PACKAGES_DIR_NAME);
}

async function findNupkg(dir: string, prefix: string): Promise<string | null> {
    if (!existsSync(dir)) return null;
    const files = await readdir(dir);
    const match = files.find(f => f.toLowerCase().startsWith(prefix.toLowerCase()) && f.endsWith('.nupkg'));
    return match ? join(dir, match) : null;
}

function parseVersionFromNupkg(nupkgPath: string, prefix: string): string {
    const filename = basename(nupkgPath, '.nupkg');
    // e.g. "Microsoft.AspNetCore.Components.WebAssembly.11.0.0-preview.5.26xxx.yy" → "11.0.0-preview.5.26xxx.yy"
    return filename.slice(prefix.length + 1); // +1 for the dot separator
}

// ── Clone ────────────────────────────────────────────────────────────────────

async function cloneAspNetCore(repo: string, commit: string, cloneDir: string): Promise<void> {
    // Mark safe.directory to avoid "dubious ownership" errors in Docker containers
    await exec('git', ['config', '--global', '--add', 'safe.directory', cloneDir], {
        label: 'git safe.directory',
    });

    if (existsSync(join(cloneDir, '.git'))) {
        info(`ASP.NET Core repo already cloned at ${cloneDir} — fetching latest`);
        await exec('git', ['-C', cloneDir, 'fetch', 'origin'], { label: 'git fetch' });
    } else {
        await mkdir(cloneDir, { recursive: true });
        const repoUrl = `https://github.com/${repo}.git`;
        info(`Cloning ${repoUrl}...`);
        await exec('git', [
            'clone', '--no-checkout', '--filter=blob:none', repoUrl, cloneDir,
        ], { label: 'git clone' });
    }

    info(`Checking out ${commit.slice(0, 10)}...`);
    await exec('git', ['-C', cloneDir, 'checkout', commit], { label: 'git checkout' });

    // Initialize submodules (aspnetcore uses them for MessagePack, googletest, etc.)
    info('Initializing submodules...');
    await exec('git', ['-C', cloneDir, 'submodule', 'update', '--init', '--recursive'], {
        label: 'git submodule update',
    });
}

// ── Build ────────────────────────────────────────────────────────────────────

async function buildAspNetCore(
    cloneDir: string,
    platform: 'windows' | 'linux' | 'darwin',
): Promise<void> {
    const isWin = platform === 'windows';

    // Step 1: Ensure shell scripts are executable (git checkout on tmpfs may lose +x,
    // and Docker --tmpfs defaults to noexec mount option)
    if (!isWin) {
        await exec('bash', ['-c', `find ${cloneDir} -name "*.sh" -exec chmod +x {} +`], {
            label: 'chmod scripts',
        });
    }

    // Step 2: Build managed code + pack in a single command.
    // eng/build.sh handles SDK download (InitializeToolset), restore, build, and pack.
    // Skip native, java, and installers — we only need managed C# + JS (for Blazor) + nupkgs.
    banner('Build ASP.NET Core (managed only, pack)');
    const buildFlags = '-NoBuildNative -NoBuildJava -NoBuildInstallers -pack -notest -c Release -bl';
    if (isWin) {
        await exec('cmd', [
            '/c', join(cloneDir, 'eng', 'build.cmd'),
            ...buildFlags.split(' '),
        ], { cwd: cloneDir, label: 'eng/build.cmd' });
    } else {
        // Use 'bash script' form to avoid noexec tmpfs issues
        await exec('bash', ['-c', `bash ${join(cloneDir, 'eng', 'build.sh')} ${buildFlags}`], {
            cwd: cloneDir,
            label: 'eng/build.sh',
        });
    }
}

// ── Collect Packages ─────────────────────────────────────────────────────────

async function collectPackages(cloneDir: string, outputDir: string): Promise<number> {
    await mkdir(outputDir, { recursive: true });

    let count = 0;
    const shippingDir = join(cloneDir, 'artifacts', 'packages', 'Release', 'Shipping');
    const nonShippingDir = join(cloneDir, 'artifacts', 'packages', 'Release', 'NonShipping');

    for (const dir of [shippingDir, nonShippingDir]) {
        if (!existsSync(dir)) continue;
        const files = await readdir(dir);
        for (const f of files) {
            if (f.endsWith('.nupkg')) {
                await cp(join(dir, f), join(outputDir, f));
                count++;
            }
        }
    }

    // Also collect internal dependencies (e.g. HotReload.Agent) from NuGet cache
    // that were restored during the aspnetcore build but aren't in its output packages.
    count += await collectFromNuGetCache(outputDir, [
        'microsoft.dotnet.hotreload.agent',
        'microsoft.dotnet.hotreload.agent.data',
    ]);

    return count;
}

/**
 * Copy packages from the NuGet global cache to the output dir.
 * NuGet cache layout: ~/.nuget/packages/{id}/{version}/{id}.{version}.nupkg
 */
async function collectFromNuGetCache(outputDir: string, packageIds: string[]): Promise<number> {
    const cacheRoot = join(process.env.HOME || process.env.USERPROFILE || '/root', '.nuget', 'packages');
    let count = 0;
    for (const id of packageIds) {
        const pkgDir = join(cacheRoot, id);
        if (!existsSync(pkgDir)) continue;
        const versions = await readdir(pkgDir);
        for (const ver of versions) {
            const nupkg = join(pkgDir, ver, `${id}.${ver}.nupkg`);
            if (existsSync(nupkg)) {
                const dest = join(outputDir, `${id}.${ver}.nupkg`);
                if (!existsSync(dest)) {
                    await cp(nupkg, dest);
                    info(`Collected ${id}.${ver}.nupkg from NuGet cache`);
                    count++;
                }
            }
        }
    }
    return count;
}

/**
 * Scan built packages for internal transitive dependencies and ensure they exist
 * in the output dir. If not found in NuGet cache, create minimal stub nupkg files.
 * These stubs satisfy restore for packages that are never actually loaded at runtime
 * (e.g. HotReload.Agent in publish scenarios).
 */
async function ensureTransitiveDeps(outputDir: string): Promise<void> {
    // Known internal packages that aspnetcore references but aren't on public feeds
    const INTERNAL_DEPS = [
        'microsoft.dotnet.hotreload.agent',
        'microsoft.dotnet.hotreload.agent.data',
    ];

    // Check which are already present
    const existing = await readdir(outputDir);
    const existingLower = new Set(existing.map(f => f.toLowerCase()));

    // Find required versions by scanning nuspec in built packages
    for (const depId of INTERNAL_DEPS) {
        if (existingLower.has(`${depId}.`) || existing.some(f => f.toLowerCase().startsWith(`${depId}.`) && f.endsWith('.nupkg'))) {
            continue; // Already have it
        }

        // Try to find the version needed by scanning package nuspecs
        const version = await findRequiredVersion(outputDir, depId);
        if (!version) continue;

        const nupkgName = `${depId}.${version}.nupkg`;
        if (existingLower.has(nupkgName.toLowerCase())) continue;

        // Try NuGet cache first
        const cacheRoot = join(process.env.HOME || process.env.USERPROFILE || '/root', '.nuget', 'packages');
        const cachedPkg = join(cacheRoot, depId, version, `${depId}.${version}.nupkg`);
        if (existsSync(cachedPkg)) {
            await cp(cachedPkg, join(outputDir, nupkgName));
            info(`Collected ${nupkgName} from NuGet cache`);
            continue;
        }

        // Create stub nupkg
        await createStubNupkg(outputDir, depId, version);
        info(`Created stub ${nupkgName} (internal dep not on public feeds)`);
    }
}

/**
 * Find the version of a dependency required by packages in outputDir.
 * Scans .nuspec files inside .nupkg (zip) archives.
 */
async function findRequiredVersion(outputDir: string, depId: string): Promise<string | null> {
    const files = await readdir(outputDir);
    for (const f of files) {
        if (!f.endsWith('.nupkg')) continue;
        const nupkgPath = join(outputDir, f);
        try {
            // Use unzip to extract nuspec content and grep for the dep
            const result = execSync(
                `unzip -p "${nupkgPath}" "*.nuspec" 2>/dev/null | grep -i "${depId}" || true`,
                { encoding: 'utf-8', timeout: 5000 },
            );
            // Match: <dependency id="Microsoft.DotNet.HotReload.Agent" version="10.0.100-preview.5.25265.101" .../>
            const re = new RegExp(`id="${depId}"[^>]*version="([^"]+)"`, 'i');
            const m = result.match(re);
            if (m) return m[1];
        } catch {
            // Skip packages we can't read
        }
    }
    return null;
}

/**
 * Create a minimal .nupkg stub (zip with nuspec only).
 */
async function createStubNupkg(outputDir: string, id: string, version: string): Promise<void> {
    const nuspec = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<package xmlns="http://schemas.microsoft.com/packaging/2013/05/nuspec.xsd">',
        '  <metadata>',
        `    <id>${id}</id>`,
        `    <version>${version}</version>`,
        '    <authors>Microsoft</authors>',
        '    <description>Stub package for benchmark builds</description>',
        '  </metadata>',
        '</package>',
    ].join('\n');

    const nupkgPath = join(outputDir, `${id}.${version}.nupkg`);
    const fileName = `${id}.nuspec`;
    await writeMinimalZip(nupkgPath, fileName, nuspec);
}

/**
 * Write a minimal ZIP file containing a single text entry.
 * Pure Node.js implementation — no external dependencies needed.
 */
async function writeMinimalZip(zipPath: string, entryName: string, content: string): Promise<void> {
    const data = Buffer.from(content, 'utf-8');
    const nameBytes = Buffer.from(entryName, 'utf-8');
    const crc = crc32(data);

    // Local file header
    const localHeader = Buffer.alloc(30 + nameBytes.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4);          // version needed
    localHeader.writeUInt16LE(0, 6);           // flags
    localHeader.writeUInt16LE(0, 8);           // compression (store)
    localHeader.writeUInt16LE(0, 10);          // mod time
    localHeader.writeUInt16LE(0, 12);          // mod date
    localHeader.writeUInt32LE(crc, 14);        // crc32
    localHeader.writeUInt32LE(data.length, 18); // compressed size
    localHeader.writeUInt32LE(data.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBytes.length, 26); // filename length
    localHeader.writeUInt16LE(0, 28);          // extra field length
    nameBytes.copy(localHeader, 30);

    // Central directory entry
    const cdEntry = Buffer.alloc(46 + nameBytes.length);
    cdEntry.writeUInt32LE(0x02014b50, 0);      // signature
    cdEntry.writeUInt16LE(20, 4);              // version made by
    cdEntry.writeUInt16LE(20, 6);              // version needed
    cdEntry.writeUInt16LE(0, 8);              // flags
    cdEntry.writeUInt16LE(0, 10);             // compression
    cdEntry.writeUInt16LE(0, 12);             // mod time
    cdEntry.writeUInt16LE(0, 14);             // mod date
    cdEntry.writeUInt32LE(crc, 16);           // crc32
    cdEntry.writeUInt32LE(data.length, 20);   // compressed size
    cdEntry.writeUInt32LE(data.length, 24);   // uncompressed size
    cdEntry.writeUInt16LE(nameBytes.length, 28); // filename length
    cdEntry.writeUInt16LE(0, 30);             // extra field length
    cdEntry.writeUInt16LE(0, 32);             // comment length
    cdEntry.writeUInt16LE(0, 34);             // disk number start
    cdEntry.writeUInt16LE(0, 36);             // internal attrs
    cdEntry.writeUInt32LE(0, 38);             // external attrs
    cdEntry.writeUInt32LE(0, 42);             // local header offset
    nameBytes.copy(cdEntry, 46);

    const cdOffset = localHeader.length + data.length;
    const cdSize = cdEntry.length;

    // End of central directory
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);         // signature
    eocd.writeUInt16LE(0, 4);                  // disk number
    eocd.writeUInt16LE(0, 6);                  // disk with CD
    eocd.writeUInt16LE(1, 8);                  // entries on disk
    eocd.writeUInt16LE(1, 10);                 // total entries
    eocd.writeUInt32LE(cdSize, 12);            // CD size
    eocd.writeUInt32LE(cdOffset, 16);          // CD offset
    eocd.writeUInt16LE(0, 20);                 // comment length

    await writeFile(zipPath, Buffer.concat([localHeader, data, cdEntry, eocd]));
}

/** Compute CRC-32 for a buffer. */
function crc32(buf: Buffer): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Stage Entry Point ────────────────────────────────────────────────────────

export async function run(ctx: BenchContext): Promise<BenchContext> {
    banner('Build ASP.NET Core');

    if (!ctx.aspnetCoreBuildRequired) {
        info('ASP.NET Core build not required — skipping');
        return ctx;
    }

    if (!ctx.aspnetCoreCommit) {
        throw new Error('build-aspnetcore stage requires ctx.aspnetCoreCommit');
    }

    const { aspnetCoreCommit, aspnetCoreRepo, artifactsDir, platform } = ctx;

    info(`ASP.NET Core repo: ${aspnetCoreRepo}`);
    info(`ASP.NET Core commit: ${aspnetCoreCommit.slice(0, 10)}`);

    // ── Step 1: Check for pre-built packages (CI artifact download) ──────
    const packagesDir = getPackagesDir(artifactsDir);
    if (existsSync(packagesDir)) {
        const files = await readdir(packagesDir);
        const nupkgs = files.filter(f => f.endsWith('.nupkg'));
        if (nupkgs.length > 0) {
            info(`Found ${nupkgs.length} pre-built ASP.NET Core packages at ${packagesDir} — skipping build`);

            // Ensure internal transitive deps are available (from cache or as stubs)
            await ensureTransitiveDeps(packagesDir);

            // Detect version from a known package
            const probe = nupkgs.find(f =>
                f.toLowerCase().startsWith('microsoft.aspnetcore.components.webassembly.')
                && !f.toLowerCase().includes('devserver'),
            );
            let packageVersion = 'custom-build';
            if (probe) {
                packageVersion = parseVersionFromNupkg(
                    join(packagesDir, probe),
                    'Microsoft.AspNetCore.Components.WebAssembly',
                );
            }

            return {
                ...ctx,
                aspnetCorePackagesDir: packagesDir,
                aspnetCorePackageVersion: packageVersion,
                sdkInfo: {
                    ...ctx.sdkInfo,
                    aspnetCoreVersion: packageVersion,
                    aspnetCoreGitHash: aspnetCoreCommit,
                },
            };
        }
    }

    // ── Step 2: Clone repo ───────────────────────────────────────────────
    const cloneDir = getAspNetCoreCloneDir(artifactsDir);
    await cloneAspNetCore(aspnetCoreRepo, aspnetCoreCommit, cloneDir);

    // ── Step 3: Build ────────────────────────────────────────────────────
    await buildAspNetCore(cloneDir, platform);

    // ── Step 4: Collect packages ─────────────────────────────────────────
    const packageCount = await collectPackages(cloneDir, packagesDir);
    if (packageCount === 0) {
        throw new Error(
            'No NuGet packages found after ASP.NET Core build.\n'
            + `Searched: ${join(cloneDir, 'artifacts', 'packages', 'Release')}`,
        );
    }
    info(`Collected ${packageCount} packages to ${packagesDir}`);

    // Ensure internal transitive deps are available (from cache or as stubs)
    await ensureTransitiveDeps(packagesDir);

    // ── Step 5: Detect version ───────────────────────────────────────────
    const shippingDir = join(cloneDir, 'artifacts', 'packages', 'Release', 'Shipping');
    const probeNupkg = await findNupkg(shippingDir, 'Microsoft.AspNetCore.Components.WebAssembly');
    let packageVersion = 'custom-build';
    if (probeNupkg) {
        packageVersion = parseVersionFromNupkg(probeNupkg, 'Microsoft.AspNetCore.Components.WebAssembly');
        info(`Built ASP.NET Core package version: ${packageVersion}`);
    }

    // ── Step 6: Update context ───────────────────────────────────────────
    return {
        ...ctx,
        aspnetCorePackagesDir: packagesDir,
        aspnetCorePackageVersion: packageVersion,
        sdkInfo: {
            ...ctx.sdkInfo,
            aspnetCoreVersion: packageVersion,
            aspnetCoreGitHash: aspnetCoreCommit,
        },
    };
}
