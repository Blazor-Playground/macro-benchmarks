import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statusLine } from './local-command.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeGuide = 'https://github.com/dotnet/runtime/blob/main/docs/workflow/README.md';

export function probeCommand(command, args, platform = process.platform) {
    const result = platform === 'win32' && command === 'npm'
        ? spawnSync('cmd.exe', ['/d', '/c', 'npm', ...args], { encoding: 'utf8', timeout: 10000 })
        : spawnSync(command, args, { encoding: 'utf8', timeout: 10000 });
    return {
        ok: !result.error && result.status === 0,
        detail: result.error?.message ?? (result.stdout || result.stderr || `exit ${result.status}`).trim().split('\n')[0],
        output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    };
}

export async function probeTar(command, probe = probeCommand, platform = process.platform) {
    const directory = await mkdtemp(join(tmpdir(), 'bench-tar-check-'));
    try {
        const archive = join(directory, 'probe.nupkg');
        await writeFile(archive, Buffer.from(
            'UEsDBBQAAAAAAAAAIVAAAAAAAAAAAAAAAAAWAAAAcHJlcmVxdWlzaXRlLXByb2JlLnR4dFBLAQIUAxQAAAAAAAAAIVAAAAAAAAAAAAAAAAAWAAAAAAAAAAAAAACAAQAAAABwcmVyZXF1aXNpdGUtcHJvYmUudHh0UEsFBgAAAAABAAEARAAAADQAAAAAAA==',
            'base64'));
        const result = probe(command, ['-tf', archive], platform);
        return {
            ok: result.ok && result.output.includes('prerequisite-probe.txt'),
            detail: !result.ok ? result.detail : result.output.includes('prerequisite-probe.txt')
                ? 'can read ZIP/.nupkg archives' : 'Archive listing did not contain the ZIP probe entry.',
        };
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

export async function probeBrowsers({ engines, systemChrome = false, headless = true }, load = () => import('playwright')) {
    const results = [];
    let pw;
    try {
        pw = await load();
    } catch (error) {
        return engines.map(engine => ({
            engine, ok: false, detail: `Cannot load Playwright: ${error.message}`,
        }));
    }
    for (const engine of engines) {
        let browser;
        const result = { engine, ok: false, detail: '' };
        try {
            browser = await (engine === 'firefox' ? pw.firefox : pw.chromium).launch({
                channel: engine === 'chrome' && systemChrome ? 'chrome' : undefined,
                headless, timeout: 15000,
            });
            result.ok = true;
            result.detail = browser.version();
        } catch (error) {
            result.detail = error.message.split('\n').find(line => line.trim()) ?? error.message;
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (error) {
                    result.ok = false;
                    result.detail = `Browser cleanup failed: ${error.message.split('\n')[0]}`;
                }
            }
        }
        results.push(result);
    }
    return results;
}

export async function checkPrerequisites({ runtimeRepo, sdk, engines, systemChrome, headless }, {
    root = repoRoot, platform = process.platform, nodeVersion = process.versions.node,
    probe = probeCommand, exists = existsSync, tar = process.env.BENCH_TAR ?? 'tar',
    checkTar = probeTar, browsers = probeBrowsers,
} = {}) {
    const checks = [];
    const add = (name, result, install) => checks.push({ name, ...result, install });
    const install = (brew, apt, dnf, windows) => platform === 'darwin' ? brew :
        platform === 'win32' ? windows : `Ubuntu/Debian: ${apt}\nFedora: ${dnf}`;
    const nodeHelp = platform === 'darwin'
        ? 'brew install node@24\nexport PATH="$(brew --prefix node@24)/bin:$PATH"'
        : platform === 'win32' ? 'winget install --id OpenJS.NodeJS.LTS --exact (then reopen your terminal)'
            : 'Install Node.js 24+ from https://nodejs.org/en/download (including npm), then reopen your terminal.';
    add('Node.js >= 24', { ok: Number(nodeVersion.split('.')[0]) >= 24, detail: nodeVersion }, nodeHelp);
    const tools = [
        ['npm', ['--version'], nodeHelp],
        ['git', ['--version'], install('brew install git', 'sudo apt-get install git', 'sudo dnf install git',
            'winget install --id Git.Git --exact')],
        ['curl', ['--version'], install('brew install curl', 'sudo apt-get install curl', 'sudo dnf install curl',
            'Install/update curl from https://curl.se/windows/ and add it to PATH.')],
        ['cmake', ['--version'], install('brew install cmake', 'sudo apt-get install cmake', 'sudo dnf install cmake',
            'winget install --id Kitware.CMake --exact')],
        ['ninja', ['--version'], install('brew install ninja', 'sudo apt-get install ninja-build', 'sudo dnf install ninja-build',
            'winget install --id Ninja-build.Ninja --exact')],
        [platform === 'win32' ? 'python' : 'python3', ['--version'],
            install('brew install python', 'sudo apt-get install python3', 'sudo dnf install python3',
                'Install Python 3 from https://www.python.org/downloads/windows/ and enable Add Python to PATH.')],
    ];
    if (platform === 'win32') {
        tools.push(['cl', ['/?'],
            `Install Visual Studio with Desktop development with C++, then run this script from a Developer Command Prompt.\n${runtimeGuide}`]);
        tools.push(['powershell', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'],
            `Enable Windows PowerShell and run from a Developer Command Prompt.\n${runtimeGuide}`]);
    } else {
        tools.push(['bash', ['--version'], install('brew install bash', 'sudo apt-get install bash', 'sudo dnf install bash', '')]);
        tools.push(['make', ['--version'], install('xcode-select --install', 'sudo apt-get install build-essential', 'sudo dnf install make gcc-c++', '')]);
        tools.push(['clang++', ['--version'], install('xcode-select --install', 'sudo apt-get install clang llvm lld',
            'sudo dnf install clang llvm lld', '')]);
        if (platform === 'darwin') {
            tools.push(['xcrun', ['--show-sdk-path'],
                'xcode-select --install\nIf Xcode is already installed, select its developer directory and accept its license.']);
        } else {
            tools.push(['pkg-config', ['--version'], install('', 'sudo apt-get install pkg-config',
                'sudo dnf install pkgconf-pkg-config', '')]);
        }
    }
    for (const [command, args, repair] of tools) {
        const result = probe(command, args, platform);
        if ((command === 'python' || command === 'python3') && result.ok && !/^Python 3\./.test(result.output)) {
            result.ok = false;
            result.detail = `Python 3 required; found ${result.detail}`;
        }
        add(command, result, repair);
    }
    add(`${tar} ZIP/.nupkg support`, await checkTar(tar, probe, platform),
        install('brew install libarchive\nexport BENCH_TAR="$(brew --prefix libarchive)/bin/bsdtar"',
            'sudo apt-get install libarchive-tools\nexport BENCH_TAR=bsdtar',
            'sudo dnf install bsdtar\nexport BENCH_TAR=bsdtar',
            'Use Windows tar.exe (libarchive), or install bsdtar from https://www.libarchive.org/ and set BENCH_TAR to its executable.'));
    const hasPlaywright = exists(join(root, 'node_modules', 'playwright', 'package.json'));
    add('Benchmark npm dependencies (Playwright)', { ok: hasPlaywright, detail: hasPlaywright ? 'installed' : 'missing' }, 'npm ci');
    const tsxLoader = join(root, 'bench', 'node_modules', 'tsx', 'dist', 'loader.mjs');
    const tsx = exists(tsxLoader) ? probe(process.execPath, ['--import', tsxLoader, '--eval', ''], platform)
        : { ok: false, detail: 'missing' };
    if (tsx.ok) tsx.detail = 'loader usable';
    add('Bench CLI npm dependencies (tsx)', tsx, 'npm ci --prefix bench');
    let browserChecks = [];
    if (hasPlaywright) {
        browserChecks = await browsers({ engines, systemChrome, headless });
    } else {
        browserChecks = engines.map(engine => ({ engine, ok: false, detail: 'Not checked until Playwright is installed.' }));
    }
    for (const result of browserChecks) {
        const browser = result.engine === 'firefox' ? 'firefox' : 'chromium';
        const repair = result.engine === 'chrome' && systemChrome
            ? 'Install Google Chrome from https://www.google.com/chrome/, or omit --system-chrome and run npx playwright install chromium.'
            : `After npm ci: npx playwright install ${browser}`;
        add(`${result.engine === 'chrome' && systemChrome ? 'Google Chrome' : browser} launch`, result,
            `${repair}${platform === 'linux' ? `\nFor missing Linux browser libraries: npx playwright install-deps ${browser}` : ''}`);
    }
    if (sdk) {
        const sdkDir = resolve(sdk);
        const result = probe(join(sdkDir, platform === 'win32' ? 'dotnet.exe' : 'dotnet'), ['--list-sdks'], platform);
        if (result.ok && !/^\d+\.\d+\.\d+/m.test(result.output)) {
            result.ok = false;
            result.detail = 'No installed SDKs reported by this dotnet executable.';
        }
        add('Explicit app SDK', result,
            'Point --sdk at a compatible installed SDK directory; download one from https://dotnet.microsoft.com/download/dotnet.');
    }
    if (runtimeRepo) {
        const path = resolve(runtimeRepo);
        const script = join(path, platform === 'win32' ? 'build.cmd' : 'build.sh');
        const hasSource = exists(script) && exists(join(path, 'global.json'));
        add('Runtime checkout', { ok: hasSource, detail: hasSource ? path : `Missing ${script} or global.json` },
            'Use --runtime-repo <dotnet/runtime-root>, or omit it to let the orchestrator clone dotnet/runtime.');
        if (hasSource && checks.find(check => check.name === 'git').ok) {
            add('Runtime merge base with origin/main', probe('git', ['-C', path, 'merge-base', 'HEAD', 'refs/remotes/origin/main'], platform),
                `Fetch origin/main yourself (git -C "${path}" fetch origin main) and ensure the checkout has enough history for a merge base.`);
        }
    }
    return {
        checks, ok: checks.every(check => check.ok),
        browsers: Object.fromEntries(browserChecks.filter(check => check.ok).map(check => [check.engine, check.detail])),
    };
}

export function reportPrerequisites(report, writeLine = console.log) {
    writeLine('Prerequisite checks (no installations are performed):');
    for (const check of report.checks) {
        writeLine(statusLine(`${check.name}: ${check.detail}`, check.ok ? 'OK' : 'FAILED'));
        if (!check.ok) writeLine(`  How to fix:\n${check.install.split('\n').map(line => `    ${line}`).join('\n')}`);
    }
    writeLine(`Native tool version requirements and platform libraries remain checkout-specific: ${runtimeGuide}`);
    return report.ok;
}
