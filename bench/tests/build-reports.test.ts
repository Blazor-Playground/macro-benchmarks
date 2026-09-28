import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collectBuildShardReports } from '../src/lib/build-reports.js';
import { App, Preset, Runtime } from '../src/enums.js';

test('collectBuildShardReports merges successful cells and failures', async () => {
    const root = await mkdtemp(join(tmpdir(), 'build-reports-'));
    try {
        const emptyDir = join(root, 'empty');
        const mudDir = join(root, 'mud');
        await mkdir(emptyDir);
        await mkdir(mudDir);
        await writeFile(join(emptyDir, 'build-report.json'), JSON.stringify({
            sdkVersion: '12.0.100-test',
            apps: [App.EmptyBlazor],
            completedAt: new Date().toISOString(),
            succeeded: [{
                app: App.EmptyBlazor,
                preset: Preset.DevLoop,
                runtime: Runtime.Mono,
                compileTimeMs: 100,
                integrity: { fileCount: 1, totalBytes: 2 },
                publishDir: '/publish/empty',
            }],
            failures: [],
        }));
        await writeFile(join(mudDir, 'build-report.json'), JSON.stringify({
            sdkVersion: '12.0.100-test',
            apps: [App.MudBlazor],
            completedAt: new Date().toISOString(),
            succeeded: [],
            failures: [{
                target: 'mud-blazor/dev-loop',
                errorLines: ['error NU1202: incompatible package'],
            }],
        }));

        const result = await collectBuildShardReports(
            root,
            [App.EmptyBlazor, App.MudBlazor],
            '12.0.100-test',
        );

        assert.equal(result.succeeded.length, 1);
        assert.deepEqual(result.failures, [{
            target: 'mud-blazor/dev-loop',
            errorLines: ['error NU1202: incompatible package'],
        }]);
        assert.deepEqual(result.reportErrors, []);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('collectBuildShardReports treats a missing shard as a reporting error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'build-reports-'));
    try {
        const result = await collectBuildShardReports(
            root,
            [App.EmptyBlazor],
            '12.0.100-test',
        );

        assert.deepEqual(result.failures, []);
        assert.deepEqual(result.reportErrors, [
            'Build shard empty-blazor did not produce a report; inspect its GitHub Actions job log.',
        ]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
