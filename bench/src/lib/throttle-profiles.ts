import { Profile } from '../enums.js';

// ── CDP Throttle Profile Definitions ─────────────────────────────────────────

export interface NetworkConditions {
    offline: boolean;
    downloadThroughput: number;  // bytes/sec
    uploadThroughput: number;    // bytes/sec
    latency: number;             // ms
}

export interface CpuThrottle {
    rate: number;  // slowdown factor (e.g. 3 = 3x slower)
}

export interface ThrottleProfile {
    network: NetworkConditions | null;
    cpu: CpuThrottle | null;
}

/**
 * Desktop: no throttling.
 * Mobile: simulates ~3-year-old Android phone on US 4G LTE.
 *   - CPU 3× slowdown
 *   - 20 Mbps download / 5 Mbps upload / 70ms RTT
 */
export const PROFILES: Record<Profile, ThrottleProfile | null> = {
    [Profile.Desktop]: null,
    [Profile.Mobile]: {
        cpu: { rate: 3 },
        network: {
            offline: false,
            downloadThroughput: 2_500_000,   // 20 Mbps in bytes/sec
            uploadThroughput: 625_000,        // 5 Mbps in bytes/sec
            latency: 70,
        },
    },
};
