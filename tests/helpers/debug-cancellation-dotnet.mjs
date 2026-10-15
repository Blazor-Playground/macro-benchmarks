#!/usr/bin/env node
// A controlled subprocess fixture, never a real SDK or a source of benchmark samples.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.DEBUG_CANCELLATION_FIXTURE;
if (!root) throw new Error('Missing cancellation-test directory');
const command = process.argv[2];
const version = '12.0.100-cancellation-fixture';
if (command === '--version') console.log(version);
else if (command === '--list-sdks') console.log(`${version} [${join(root, 'sdk')}]`);
else if (command === 'restore') console.log('Fixture restore complete');
else if (command === 'msbuild') {
    console.log(JSON.stringify({ Properties: {
        NETCoreSdkVersion: version, TargetFramework: 'net12.0', Configuration: 'Debug',
        RuntimeFlavor: 'Mono', RunArguments: 'blazor-devserver.dll',
        BundledNETCoreAppPackageVersion: '12.0.0', NETCoreSdkRuntimeIdentifier: 'fixture-host',
    } }));
} else if (command === 'run' || command === 'host') {
    appendFileSync(join(root, 'owned-pids'), `${process.pid}\n`);
    let stopping = false;
    process.on('SIGTERM', () => {
        if (stopping) return;
        stopping = true;
        // Keep cleanup asynchronous, including reaping the host before its launcher exits.
        setTimeout(() => process.exit(0), command === 'host' ? 150 : 500);
    });
    if (command === 'run') {
        spawn(process.execPath, [fileURLToPath(import.meta.url), 'host'], { env: process.env, stdio: 'inherit' });
    } else {
        const url = new URL(process.env.ASPNETCORE_URLS);
        createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.write('<html><body>Intentionally unfinished navigation');
            if (req.headers['sec-fetch-mode'] === 'navigate') writeFileSync(join(root, 'navigation-pending'), 'ready');
            // No end: page.goto must be interrupted by cancellation, not its 60-second timeout.
        }).listen(Number(url.port), '127.0.0.1');
    }
} else throw new Error(`Unexpected fixture command: ${command}`);
