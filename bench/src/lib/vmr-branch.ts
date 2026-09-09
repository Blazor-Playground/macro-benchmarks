import { fetchJson, githubHeaders, GITHUB_API } from './http.js';
import { info } from '../log.js';

// ── VMR branch detection ─────────────────────────────────────────────────────

const VMR_REPO = 'dotnet/dotnet';

interface CompareResult {
    status: 'identical' | 'ahead' | 'behind' | 'diverged';
}

// vmrGitHash → resolved branch, so repeated versions sharing a VMR commit hit the API once.
const branchCache = new Map<string, string>();

/**
 * Candidate branches to test for a given .NET major, most-preferred first.
 * 'main' is first so any commit on main's history (including pre-fork bases) is
 * labeled 'main'; release-only builds fall through to the release entries. An
 * optional SDK feature band adds the band-specific release branch (e.g. band 3 →
 * `release/<major>.0.3xx`) so GA releases outside the 1xx band still resolve.
 */
export function vmrBranchCandidates(major: number, band?: number): string[] {
    const list = ['main'];
    if (band && band !== 1) list.push(`release/${major}.0.${band}xx`);
    list.push(`release/${major}.0.1xx`, `release/${major}.0`);
    return list;
}

/**
 * Resolve which dotnet/dotnet branch a VMR commit belongs to by ancestry.
 *
 * A commit is "on" a branch when `compare/<branch>...<sha>` is `behind` or
 * `identical` — i.e. the commit is an ancestor of (or equal to) the branch tip.
 * Candidates are checked in order; the first match wins. Returns 'unknown' when
 * no candidate matches or the compare API is unavailable.
 */
export async function resolveVmrBranch(
    sha: string,
    candidates: string[],
    token: string | undefined,
    verbose = false,
): Promise<string> {
    const cached = branchCache.get(sha);
    if (cached) return cached;

    const headers = githubHeaders(token);
    for (const branch of candidates) {
        const url = `${GITHUB_API}/repos/${VMR_REPO}/compare/${branch}...${sha}`;
        const cmp = await fetchJson<CompareResult>(url, headers);
        if (cmp && (cmp.status === 'behind' || cmp.status === 'identical')) {
            branchCache.set(sha, branch);
            if (verbose) info(`VMR ${sha.slice(0, 10)} → ${branch}`);
            return branch;
        }
    }

    branchCache.set(sha, 'unknown');
    if (verbose) info(`VMR ${sha.slice(0, 10)} → unknown (no candidate branch matched)`);
    return 'unknown';
}
