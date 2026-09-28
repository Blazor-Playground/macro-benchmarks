import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    type BenchContext,
    type BuildFailureSummary,
    type BuildManifestEntry,
    type BuildShardReport,
} from '../context.js';
import { type App } from '../enums.js';

export interface BuildFailure {
    target: string;
    errorOutput: string;
}

export interface CollectedBuildReports {
    succeeded: BuildManifestEntry[];
    failures: BuildFailureSummary[];
    reportErrors: string[];
}

const ERROR_LINE_PATTERN = /\b(error\s*(:|MSB|CS|NU|NETSDK|TS)\S*|Build FAILED)\b/i;

export function extractErrorLines(output: string): string[] {
    const seen = new Set<string>();
    const results: string[] = [];
    for (const line of output.split('\n')) {
        if (ERROR_LINE_PATTERN.test(line)) {
            const trimmed = line.trim();
            if (trimmed && !seen.has(trimmed)) {
                seen.add(trimmed);
                results.push(trimmed);
            }
        }
    }
    return results.slice(0, 50);
}

function summarizeFailure(failure: BuildFailure): BuildFailureSummary {
    const errorLines = extractErrorLines(failure.errorOutput);
    return {
        target: failure.target,
        errorLines: errorLines.length > 0 ? errorLines : [failure.errorOutput.trim()],
    };
}

export function getBuildResultsDir(ctx: BenchContext): string {
    const runId = process.env['BENCH_RUN_ID']
        || ctx.runId
        || new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
    return join(ctx.artifactsDir, 'results', runId);
}

export async function writeBuildShardReport(
    ctx: BenchContext,
    succeeded: BuildManifestEntry[],
    failures: BuildFailure[],
): Promise<string> {
    const resultsDir = getBuildResultsDir(ctx);
    await mkdir(resultsDir, { recursive: true });

    const report: BuildShardReport = {
        sdkVersion: ctx.sdkInfo?.sdkVersion || ctx.sdkVersion,
        apps: ctx.apps,
        completedAt: new Date().toISOString(),
        succeeded,
        failures: failures.map(summarizeFailure),
    };
    const path = join(resultsDir, 'build-report.json');
    await writeFile(path, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    return path;
}

export async function writeFallbackBuildShardReport(ctx: BenchContext, error: unknown): Promise<void> {
    const path = join(getBuildResultsDir(ctx), 'build-report.json');
    if (existsSync(path)) return;

    const message = error instanceof Error ? error.message : String(error);
    const failures = ctx.apps.map(app => ({
        target: `${app}/shard`,
        errorOutput: message,
    }));
    await writeBuildShardReport(ctx, [], failures);
}

async function findReports(dir: string): Promise<string[]> {
    if (!existsSync(dir)) return [];

    const files: string[] = [];
    for (const entry of await readdir(dir)) {
        const path = join(dir, entry);
        if ((await stat(path)).isDirectory()) {
            files.push(...await findReports(path));
        } else if (entry === 'build-report.json') {
            files.push(path);
        }
    }
    return files;
}

function isBuildShardReport(value: unknown): value is BuildShardReport {
    if (!value || typeof value !== 'object') return false;
    const report = value as Partial<BuildShardReport>;
    return typeof report.sdkVersion === 'string'
        && Array.isArray(report.apps)
        && Array.isArray(report.succeeded)
        && Array.isArray(report.failures);
}

export async function collectBuildShardReports(
    reportsDir: string,
    expectedApps: App[],
    sdkVersion: string,
): Promise<CollectedBuildReports> {
    const succeeded: BuildManifestEntry[] = [];
    const failures: BuildFailureSummary[] = [];
    const reportErrors: string[] = [];
    const reportedApps = new Set<App>();

    for (const path of await findReports(reportsDir)) {
        try {
            const report: unknown = JSON.parse(await readFile(path, 'utf-8'));
            if (!isBuildShardReport(report)) {
                reportErrors.push(`Malformed build report: ${path}`);
                continue;
            }
            if (report.sdkVersion !== sdkVersion) {
                reportErrors.push(
                    `Build report SDK ${report.sdkVersion} does not match expected SDK ${sdkVersion}: ${path}`,
                );
                continue;
            }
            for (const app of report.apps) {
                if (reportedApps.has(app)) {
                    reportErrors.push(`Multiple build reports were produced for ${app}`);
                }
                reportedApps.add(app);
            }
            succeeded.push(...report.succeeded);
            failures.push(...report.failures);
        } catch (error) {
            reportErrors.push(`Could not read ${path}: ${error instanceof Error ? error.message : error}`);
        }
    }

    for (const app of expectedApps) {
        if (!reportedApps.has(app)) {
            reportErrors.push(`Build shard ${app} did not produce a report; inspect its GitHub Actions job log.`);
        }
    }

    return { succeeded, failures, reportErrors };
}
