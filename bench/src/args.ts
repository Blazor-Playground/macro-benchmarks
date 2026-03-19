import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import {
    Runtime, Preset, Engine, Profile, App, Stage,
    ALL_RUNTIMES, ALL_PRESETS, ALL_ENGINES, ALL_PROFILES, ALL_APPS, ALL_STAGES,
    parseRuntime, parsePreset, parseEngine, parseProfile, parseApp, parseStage,
} from './enums.js';
import { type BenchContext, loadContext } from './context.js';

// ── Help Text ────────────────────────────────────────────────────────────────

const HELP = `
bench — .NET Browser WASM Benchmark CLI

Usage: bench [options]

Pipeline control:
  --stages <list>          Comma-separated stage names (default: resolve-sdk,download-sdk,build,measure,transform-views)
                           Valid: ${ALL_STAGES.join(', ')}
  --context <path>         Load/save BenchContext from JSON file (cross-container handoff)
  --dry-run                Minimal run: empty-browser + dev-loop + chrome only

SDK & Runtime:
  --sdk-channel <ch>       SDK channel (default: 11.0)
  --sdk-version <ver>      Exact SDK version (overrides channel)
  --runtime <rt>           Runtime flavor: mono, coreclr, naotllvm (default: mono)
  --runtime-pack <ver>     Specific runtime pack version
  --runtime-commit <hash>  Specific dotnet/runtime commit hash

Filters (comma-separated, restrict what gets built/measured):
  --app <list>             App filter (default: all)
                           Valid: ${ALL_APPS.join(', ')}
  --preset <list>          Preset filter (default: all; dry-run: dev-loop)
                           Valid: ${ALL_PRESETS.join(', ')}
  --engine <list>          Engine filter (default: all; dry-run: chrome)
                           Valid: ${ALL_ENGINES.join(', ')}
  --profile <list>         Profile filter (default: all)
                           Valid: ${ALL_PROFILES.join(', ')}

Measurement:
  --retries <n>            Max retries on timeout (default: 0)
  --timeout <ms>           Per-measurement timeout (default: 300000)
  --warm-runs <n>          Warm/cold reload iterations (default: 5)
  --no-headless            Launch browsers in headed mode

Docker:
  --skip-docker-build      Reuse existing Docker images
  --force-docker-build     Rebuild Docker images even if they exist

Consolidation:
  --artifacts-dir <path>   CI artifacts input directory

Scheduling:
  --max-dispatches <n>     Max workflow dispatches (default: 1)
  --repo <owner/name>      GitHub repository (default: auto-detect)
  --branch <name>          Branch for dispatch (default: main)

Enumeration:
  --major <n>              .NET major version (default: 11)
  --months <n>             History months to scan (default: 3)
  --release-majors <list>  Comma-separated majors for release enumeration (default: 8,9,10)
  --force-enumerate        Re-resolve all versions (ignore cache)

General:
  --help                   Show this help
  --verbose                Verbose logging
`.trim();

// ── Argument Definition ──────────────────────────────────────────────────────

const ARG_OPTIONS = {
    // Pipeline control
    'stages': { type: 'string' as const, default: 'resolve-sdk,download-sdk,build,measure,transform-views' },
    'context': { type: 'string' as const, default: '' },
    'dry-run': { type: 'boolean' as const, default: false },

    // SDK & Runtime
    'sdk-channel': { type: 'string' as const, default: '' },
    'sdk-version': { type: 'string' as const, default: '' },
    'runtime': { type: 'string' as const, default: 'mono' },
    'runtime-pack': { type: 'string' as const, default: '' },
    'runtime-commit': { type: 'string' as const, default: '' },

    // Filters
    'app': { type: 'string' as const, default: '' },
    'preset': { type: 'string' as const, default: '' },
    'engine': { type: 'string' as const, default: '' },
    'profile': { type: 'string' as const, default: '' },

    // Measurement
    'retries': { type: 'string' as const, default: '0' },
    'timeout': { type: 'string' as const, default: '300000' },
    'warm-runs': { type: 'string' as const, default: '5' },
    'no-headless': { type: 'boolean' as const, default: false },

    // Docker
    'skip-docker-build': { type: 'boolean' as const, default: false },
    'force-docker-build': { type: 'boolean' as const, default: false },

    // Consolidation
    'artifacts-dir': { type: 'string' as const, default: '' },

    // Scheduling
    'max-dispatches': { type: 'string' as const, default: '1' },
    'repo': { type: 'string' as const, default: '' },
    'branch': { type: 'string' as const, default: 'main' },

    // Enumeration
    'major': { type: 'string' as const, default: '11' },
    'months': { type: 'string' as const, default: '3' },
    'release-majors': { type: 'string' as const, default: '8,9,10' },
    'force-enumerate': { type: 'boolean' as const, default: false },

    // General
    'help': { type: 'boolean' as const, default: false },
    'verbose': { type: 'boolean' as const, default: false },
} as const;

// ── Parsing Helpers ──────────────────────────────────────────────────────────

function parseCommaSeparated<T>(raw: string, parseFn: (v: string) => T): T[] {
    if (!raw) return [];
    return raw.split(',').map(s => parseFn(s.trim()));
}

function parseIntStrict(raw: string, name: string): number {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) {
        throw new Error(`Invalid ${name}: '${raw}' — expected a non-negative integer`);
    }
    return n;
}

function detectPlatform(): 'windows' | 'linux' | 'darwin' {
    switch (process.platform) {
        case 'win32': return 'windows';
        case 'darwin': return 'darwin';
        default: return 'linux';
    }
}

function detectIsDocker(): boolean {
    return existsSync('/.dockerenv') || process.env['container'] === 'docker';
}

function findRepoRoot(): string {
    // Walk up from this file's directory to find package.json at repo root
    let dir = resolve(import.meta.dirname ?? process.cwd(), '..');
    for (let i = 0; i < 10; i++) {
        if (existsSync(resolve(dir, 'NuGet.config'))) return dir;
        const parent = resolve(dir, '..');
        if (parent === dir) break;
        dir = parent;
    }
    // Fallback: cwd
    return process.cwd();
}

// ── Main Parse Function ──────────────────────────────────────────────────────

export async function buildContext(argv?: string[]): Promise<BenchContext> {
    const { values } = parseArgs({
        options: ARG_OPTIONS,
        strict: true,
        args: argv,
    });

    if (values.help) {
        console.log(HELP);
        process.exit(0);
    }

    // If --context provided, load base context from file.
    // The loaded context provides resolved state (sdkInfo, buildManifest, paths)
    // that earlier stages populated. CLI args always win for explicit parameters.
    const contextPath = values.context || '';
    let loaded: Partial<BenchContext> = {};
    if (contextPath && existsSync(contextPath)) {
        loaded = await loadContext(contextPath);
    }

    const dryRun = values['dry-run'] ?? false;

    // Parse comma-separated filters
    const stages = parseCommaSeparated(values.stages!, parseStage);
    const apps = parseCommaSeparated(values.app!, parseApp);
    const presets = parseCommaSeparated(values.preset!, parsePreset);
    const engines = parseCommaSeparated(values.engine!, parseEngine);
    const profiles = parseCommaSeparated(values.profile!, parseProfile);

    // Apply dry-run defaults
    const effectiveApps = apps.length > 0 ? apps
        : dryRun
            ? [App.MicroBenchmarks]
            : [App.MicroBenchmarks, App.EmptyBlazor, App.BlazingPizza, App.HavitBootstrap, App.MudBlazor, App.SemiAvalonia, App.UnoGallery];
    const effectivePresets = presets.length > 0 ? presets
        : dryRun
            ? [Preset.DevLoop]
            : [...Object.values(Preset)];
    const effectiveEngines = engines.length > 0 ? engines
        : dryRun
            ? [Engine.Chrome]
            : [...Object.values(Engine)];
    const effectiveProfiles = profiles.length > 0 ? profiles
        : [...Object.values(Profile)];

    const repoRoot = process.env['REPO_ROOT'] ?? loaded.repoRoot ?? findRepoRoot();
    const artifactsDir = process.env['ARTIFACTS_DIR'] ?? loaded.artifactsDir ?? resolve(repoRoot, 'artifacts');

    const ctx: BenchContext = {
        // Pipeline control
        stages,
        dryRun,
        verbose: values.verbose ?? false,

        // SDK & Runtime
        sdkChannel: values['sdk-channel'] || loaded.sdkChannel || '11.0',
        sdkVersion: values['sdk-version'],
        runtime: parseRuntime(values.runtime!),
        runtimePack: values['runtime-pack'],
        runtimeCommit: values['runtime-commit'],

        // Filters
        apps: effectiveApps,
        presets: effectivePresets,
        engines: effectiveEngines,
        profiles: effectiveProfiles,

        // Measurement
        retries: parseIntStrict(values.retries!, 'retries'),
        timeout: parseIntStrict(values.timeout!, 'timeout'),
        warmRuns: parseIntStrict(values['warm-runs']!, 'warm-runs'),
        headless: !(values['no-headless'] ?? false),

        // Docker
        skipDockerBuild: values['skip-docker-build'] ?? false,
        forceDockerBuild: values['force-docker-build'] ?? false,

        // Consolidation
        artifactsInputDir: values['artifacts-dir'] || undefined,

        // Scheduling
        maxDispatches: parseIntStrict(values['max-dispatches']!, 'max-dispatches'),
        repo: values.repo || process.env['GITHUB_REPOSITORY'] || undefined,
        branch: values.branch!,

        // Enumeration
        major: parseIntStrict(values.major!, 'major'),
        months: parseIntStrict(values.months!, 'months'),
        releaseMajors: values['release-majors']!.split(',').map(s => parseIntStrict(s.trim(), 'release-majors')),
        forceEnumerate: values['force-enumerate'] ?? false,

        // Resolved paths
        repoRoot,
        artifactsDir,
        sdkDir: loaded.sdkDir!,
        dotnetBin: loaded.dotnetBin!,
        publishDir: loaded.publishDir!,
        resultsDir: loaded.resultsDir!,
        buildLabel: loaded.buildLabel!,
        runId: loaded.runId!,

        // Resolved state from earlier stages (via --context)
        sdkInfo: loaded.sdkInfo!,
        buildManifest: loaded.buildManifest!,
        isLatestDaily: loaded.isLatestDaily ?? false,

        // Environment detection
        platform: detectPlatform(),
        isCI: !!(process.env['CI'] || process.env['GITHUB_ACTIONS']),
        isDocker: detectIsDocker(),
        ciRunId: process.env['GITHUB_RUN_ID'] || undefined,
    };

    return ctx;
}
