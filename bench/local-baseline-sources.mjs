import { execFileSync } from 'node:child_process';

export const MONO_BASELINE_REF = 'refs/remotes/origin/release/11.0';
export const CROSS_BRANCH_BASELINE_WARNING =
    'Mono uses release/11.0 while CoreCLR uses main. These are cross-branch controls, not a same-source pair; SDK, TFM and ASP.NET versions may differ.';

export function monoBaselineCommit(coreclrCommit, monoSource) {
    if (monoSource === undefined) return coreclrCommit;
    if (!monoSource || monoSource.ref !== MONO_BASELINE_REF ||
        typeof monoSource.commit !== 'string' || !/^[a-f0-9]{40}$/i.test(monoSource.commit)) {
        throw new Error('Invalid explicit Mono release/11.0 baseline provenance.');
    }
    return monoSource.commit;
}

export function selectMonoBaseline(runtimeRepo, cutoff = new Date(), selectedTip) {
    if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime())) {
        throw new Error('Mono baseline selection requires a valid cutoff.');
    }
    const git = args => execFileSync('git', ['-C', runtimeRepo, ...args],
        { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
    let tip;
    try { tip = selectedTip ?? git(['rev-parse', '--verify', `${MONO_BASELINE_REF}^{commit}`]); }
    catch (error) {
        throw new Error('Missing local origin/release/11.0 for the Mono control. Fetch that branch explicitly; no main/older-source fallback was used.', { cause: error });
    }
    if (!/^[a-f0-9]{40}$/i.test(tip)) throw new Error('Invalid pinned Mono branch tip.');
    const selected = git(['log', '--first-parent', '--format=%H%x09%ct', tip]).split('\n')
        .map(line => {
            const [commit, seconds] = line.split('\t');
            return { commit, time: Number(seconds) * 1000 };
        }).find(row => row.time <= cutoff.getTime());
    if (!selected) {
        throw new Error(`No Mono release/11.0 snapshot at or before ${cutoff.toISOString()}; fetch/deepen that branch explicitly.`);
    }
    return { ref: MONO_BASELINE_REF, commit: selected.commit,
        committedAt: new Date(selected.time).toISOString(), selectedTip: tip };
}
