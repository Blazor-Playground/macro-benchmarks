import { readFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import type { MeasurementEnvironment } from '../context.js';

export function measurementEnvironment(): MeasurementEnvironment {
    let os: string = platform();
    if (os === 'linux') {
        try {
            const release = readFileSync('/etc/os-release', 'utf8');
            os = release.match(/^PRETTY_NAME="?([^"\n]+)"?$/m)?.[1] || os;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
    }
    return { os, arch: arch() };
}
