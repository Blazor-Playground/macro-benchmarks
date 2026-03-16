import { Engine } from '../enums.js';
import { isWindows } from '../exec.js';

// ── CLI Engine Command Resolution ────────────────────────────────────────────

export interface EngineCommand {
    cmd: string;
    args: string[];
}

/**
 * Get the executable command and flags for a CLI engine.
 * - v8: `d8 --module` on Linux, `v8.cmd --module` on Windows (jsvu)
 * - node: `node`
 */
export function getEngineCommand(engine: Engine): EngineCommand {
    switch (engine) {
        case Engine.V8:
            return {
                cmd: isWindows() ? 'v8.cmd' : 'd8',
                args: ['--module'],
            };
        case Engine.Node:
            return {
                cmd: 'node',
                args: [],
            };
        default:
            throw new Error(`Not a CLI engine: ${engine}`);
    }
}

// ── Stdout JSON Parser ───────────────────────────────────────────────────────

/**
 * Parse CLI stdout for a JSON object containing benchmark results.
 * Scans from the last line backwards because .NET may emit diagnostic
 * output before the benchmark results JSON line.
 */
export function parseCliOutput(stdout: string): Record<string, unknown> {
    const lines = stdout.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const trimmed = lines[i].trim();
        if (!trimmed || !trimmed.startsWith('{')) continue;
        try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed === 'object' && parsed !== null) {
                return parsed;
            }
        } catch {
            // not valid JSON, continue scanning
        }
    }
    throw new Error(`No JSON output found in CLI stdout.\nOutput:\n${stdout}`);
}

// ── Bench Results Validation ─────────────────────────────────────────────────

/**
 * Validate that all required internal metric keys are present and are
 * positive finite numbers.
 */
export function validateBenchResults(
    results: Record<string, number>,
    requiredKeys: string[],
): void {
    for (const key of requiredKeys) {
        const val = results[key];
        if (val == null || !Number.isFinite(val) || val <= 0) {
            throw new Error(
                `Invalid benchmark result for '${key}': ${val}. ` +
                `Expected a positive finite number. Results: ${JSON.stringify(results)}`,
            );
        }
    }
}
