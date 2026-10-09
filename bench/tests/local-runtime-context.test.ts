import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildContext } from '../src/args.js';

test('normal CLI measurement does not select system Chrome implicitly', async () => {
    const ctx = await buildContext(['--stages', 'measure', '--app', 'havit-bootstrap']);
    assert.equal(ctx.chromiumChannel, undefined);
});

test('a saved local measurement context preserves the explicit system Chrome opt-in', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'local-runtime-context-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const path = join(dir, 'context.json');
    await writeFile(path, JSON.stringify({ chromiumChannel: 'chrome' }));
    const ctx = await buildContext(['--stages', 'measure', '--context', path]);
    assert.equal(ctx.chromiumChannel, 'chrome');
});
