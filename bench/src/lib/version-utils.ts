// ── Parsed .NET SDK / runtime version ────────────────────────────────────────

import { type SdkInfo } from '../context.js';

/**
 * Structured representation of a .NET version string.
 *
 * Handles all published formats:
 *   GA releases    — "10.0.300", "9.0.312"
 *   Preview builds — "11.0.100-preview.3.26162.108"
 *   Alpha builds   — "11.0.0-alpha.1.25123.456"
 *   RC builds      — "11.0.100-rc.1.26080.116"
 */
export interface ParsedVersion {
    major: number;
    minor: number;
    patch: number;
    /** Everything after the first '-', or empty string for GA releases */
    prerelease: string;
    /** True when prerelease is non-empty */
    isPrerelease: boolean;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

export function parseVersion(version: string): ParsedVersion {
    const dashIdx = version.indexOf('-');
    const mainPart = dashIdx === -1 ? version : version.slice(0, dashIdx);
    const prerelease = dashIdx === -1 ? '' : version.slice(dashIdx + 1);
    const parts = mainPart.split('.').map(Number);
    const [major, minor, patch] = parts;
    if (!Number.isFinite(major)) {
        throw new Error(`Cannot parse version '${version}'`);
    }
    return { major, minor: minor || 0, patch: patch || 0, prerelease, isPrerelease: prerelease !== '' };
}

// ── Convenience accessors ────────────────────────────────────────────────────

export function getVersionMajor(version: string): number {
    return parseVersion(version).major;
}

export function getVersionChannel(version: string): string {
    return parseVersion(version).major + '.0';
}

/** SDK feature band: patch ÷ 100 (e.g. 300 → 3, 100 → 1) */
export function getFeatureBand(sdkVersion: string): number {
    return Math.floor(parseVersion(sdkVersion).patch / 100);
}

export function isPrerelease(version: string): boolean {
    return version.includes('-');
}

// ── Arcade SHORT_DATE ────────────────────────────────────────────────────────

/**
 * Decode the 5-digit Arcade SHORT_DATE found in prerelease version suffixes.
 *
 *   YY = shortDate / 1000
 *   MM = (shortDate % 1000) / 50
 *   DD = (shortDate % 1000) % 50
 */
function decodeArcadeShortDate(shortDate: number): Date {
    const yy = Math.floor(shortDate / 1000);
    const remainder = shortDate % 1000;
    const mm = Math.floor(remainder / 50);
    const dd = remainder % 50;
    return new Date(Date.UTC(2000 + yy, mm - 1, dd));
}

/**
 * Extract and decode the Arcade SHORT_DATE from a prerelease version string.
 * Returns null for GA versions or versions that don't contain the pattern.
 *
 * e.g. "11.0.0-preview.3.26160.119" → Date(2026-03-10)
 */
export function parseArcadeDate(version: string): Date | null {
    const m = version.match(/\.\d+\.(\d{5})\.\d+$/);
    if (!m) return null;
    return decodeArcadeShortDate(parseInt(m[1], 10));
}

// ── SDK ↔ runtime version derivation ─────────────────────────────────────────

/**
 * Derive the SDK version from a runtime pack version by replacing the
 * patch component 0 with 100 (band 1).
 *
 * e.g. "11.0.0-preview.3.26153.117" → "11.0.100-preview.3.26153.117"
 */
export function deriveSdkVersion(runtimePackVersion: string): string {
    return runtimePackVersion.replace(/^(\d+\.\d+)\.0/, '$1.100');
}

// ── Version comparison ───────────────────────────────────────────────────────

/**
 * Compare two .NET version strings using semver-like ordering.
 *
 * GA releases sort after prereleases of the same major.minor.patch:
 *   preview < alpha < rc < GA
 */
export function compareVersions(a: string, b: string): number {
    const pa = parseVersion(a);
    const pb = parseVersion(b);

    const preOrder = (pre: string) =>
        pre === '' ? 2 : pre.startsWith('rc') ? 1 : 0;

    return (pa.major - pb.major)
        || (pa.minor - pb.minor)
        || (pa.patch - pb.patch)
        || (preOrder(pa.prerelease) - preOrder(pb.prerelease))
        || pa.prerelease.localeCompare(pb.prerelease);
}

// ── SdkInfo version fields ───────────────────────────────────────────────────

/**
 * Populate the parsed version fields (major, minor, patch, channel, isPrerelease)
 * on a partial SdkInfo from its sdkVersion string.
 */
export function populateVersionFields<T extends Pick<SdkInfo, 'sdkVersion'>>(
    info: T,
): T & Pick<SdkInfo, 'major' | 'minor' | 'patch' | 'channel' | 'isPrerelease'> {
    const v = parseVersion(info.sdkVersion);
    return {
        ...info,
        major: v.major,
        minor: v.minor,
        patch: v.patch,
        channel: `${v.major}.0`,
        isPrerelease: v.isPrerelease,
    };
}
