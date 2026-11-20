import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { MONO_BASELINE_REF, monoBaselineCommit, selectMonoBaseline } from '../../bench/local-baseline-sources.mjs';

test('Mono selection uses one release/11.0 first-parent tip and committer-time cutoff, never main or a side branch', async t => {
    const root = await mkdtemp(join(tmpdir(), 'mono-source-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
    git('init', '--quiet');
    git('config', 'user.name', 'Fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    async function commit(name, timestamp) {
        await writeFile(join(root, 'source.txt'), name);
        git('add', '.');
        execFileSync('git', ['-C', root, 'commit', '--quiet', '-m', name], {
            env: { ...process.env, GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: timestamp },
        });
        return git('rev-parse', 'HEAD');
    }
    const first = await commit('release first', '2020-10-01T10:00:00Z');
    const second = await commit('release second', '2020-10-02T10:00:00Z');
    git('update-ref', MONO_BASELINE_REF, second);
    const main = await commit('main only', '2020-10-03T10:00:00Z');
    git('update-ref', 'refs/remotes/origin/main', main);
    const original = git('rev-parse', 'HEAD');
    const early = selectMonoBaseline(root, new Date('2020-10-02T09:59:59Z'));
    assert.equal(early.commit, first);
    assert.equal(early.selectedTip, second);
    assert.equal(selectMonoBaseline(root, new Date('2020-10-02T10:00:00Z')).commit, second);
    git('update-ref', MONO_BASELINE_REF, main);
    assert.equal(selectMonoBaseline(root, new Date('2020-10-04'), early.selectedTip).commit, second);
    assert.equal(git('rev-parse', 'HEAD'), original);
    assert.throws(() => selectMonoBaseline(root, new Date('2020-09-01')), /No Mono release\/11.0 snapshot/);
    git('update-ref', '-d', MONO_BASELINE_REF);
    assert.throws(() => selectMonoBaseline(root), /Missing local origin\/release\/11.0/);
});

test('legacy Mono commit fallback is explicit-entry-local; malformed cross-branch metadata never falls back', () => {
    const coreclr = 'a'.repeat(40), mono = 'b'.repeat(40);
    assert.equal(monoBaselineCommit(coreclr), coreclr);
    assert.equal(monoBaselineCommit(coreclr, { ref: MONO_BASELINE_REF, commit: mono }), mono);
    for (const invalid of [null, {}, { ref: 'refs/remotes/origin/main', commit: mono },
        { ref: MONO_BASELINE_REF, commit: 'bad' }]) {
        assert.throws(() => monoBaselineCommit(coreclr, invalid), /Invalid explicit Mono/);
    }
});
