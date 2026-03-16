import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { type BenchContext } from '../context.js';
import { info, banner } from '../log.js';
import { resolveGitHubToken, githubHeaders, GITHUB_API } from '../lib/http.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface CommitEntry {
    sha: string;
    message: string;
    authorDate: string;
    committerDate: string;
    author: string;
    url: string;
}

interface CommitsList {
    repo: string;
    since: string;
    until: string;
    totalCommits: number;
    commits: CommitEntry[];
}

// ── GitHub REST API ──────────────────────────────────────────────────────────

const REPO = 'dotnet/runtime';

async function fetchCommitsPage(
    since: string,
    until: string,
    page: number,
    token?: string,
): Promise<CommitEntry[]> {
    const url = new URL(`${GITHUB_API}/repos/${REPO}/commits`);
    url.searchParams.set('since', since);
    url.searchParams.set('until', until);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));

    const headers = githubHeaders(token);

    const response = await fetch(url.toString(), { headers });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(
            `GitHub API ${response.status} for ${REPO} commits (page ${page}): ${body.slice(0, 200)}`
        );
    }

    const data = await response.json() as Array<{
        sha: string;
        commit: {
            message: string;
            author: { date: string; name: string };
            committer: { date: string };
        };
        html_url: string;
    }>;

    return data.map(item => ({
        sha: item.sha,
        message: item.commit.message.split('\n')[0],
        authorDate: item.commit.author.date,
        committerDate: item.commit.committer.date,
        author: item.commit.author.name,
        url: item.html_url,
    }));
}

async function fetchAllCommits(
    since: string,
    until: string,
    verbose: boolean,
    token?: string,
): Promise<CommitEntry[]> {
    const all: CommitEntry[] = [];
    let page = 1;

    while (true) {
        const batch = await fetchCommitsPage(since, until, page, token);
        if (batch.length === 0) break;
        all.push(...batch);
        if (verbose) {
            info(`Fetched page ${page}: ${batch.length} commits (total: ${all.length})`);
        }
        if (batch.length < 100) break;
        page++;
    }

    return all;
}

// ── Existing file helpers ────────────────────────────────────────────────────

async function loadExisting(path: string): Promise<CommitsList | null> {
    if (!existsSync(path)) return null;
    try {
        const raw = await readFile(path, 'utf-8');
        const data = JSON.parse(raw) as CommitsList;
        if (data.commits?.length > 0) return data;
    } catch {
        // Corrupt file — treat as absent
    }
    return null;
}

function mergeCommits(fresh: CommitEntry[], existing: CommitEntry[]): CommitEntry[] {
    const seen = new Set(existing.map(c => c.sha));
    const newCommits = fresh.filter(c => !seen.has(c.sha));
    return [...newCommits, ...existing];
}

function trimToWindow(commits: CommitEntry[], sinceISO: string): CommitEntry[] {
    return commits.filter(c => c.committerDate >= sinceISO);
}

// ── Stage ────────────────────────────────────────────────────────────────────

export async function run(ctx: BenchContext): Promise<BenchContext> {
    banner('Enumerate commits');

    const outputPath = join(ctx.artifactsDir, 'commits-list.json');

    const now = new Date();
    const since = new Date(now.getTime() - ctx.months * 30 * 24 * 60 * 60 * 1000);
    const sinceISO = since.toISOString();
    const untilISO = now.toISOString();

    info(`Enumerating commits for ${REPO} (last ${ctx.months} months)`);

    const token = await resolveGitHubToken();
    if (!token && ctx.verbose) {
        info('No GitHub token found (env vars or gh CLI) — unauthenticated requests (60 req/hr limit)');
    }

    const existing = await loadExisting(outputPath);
    let commits: CommitEntry[];

    if (existing && existing.repo === REPO) {
        // Incremental: fetch only one page of the most recent commits
        info('Existing commits-list.json found — fetching one page to update');
        const fresh = await fetchCommitsPage(existing.until, untilISO, 1, token);
        if (ctx.verbose) {
            info(`Fetched ${fresh.length} new commits since last run`);
        }
        commits = trimToWindow(mergeCommits(fresh, existing.commits), sinceISO);
    } else {
        // Full fetch: no existing file or repo mismatch
        info(`Since: ${sinceISO}`);
        commits = await fetchAllCommits(sinceISO, untilISO, ctx.verbose, token);
    }

    const result: CommitsList = {
        repo: REPO,
        since: sinceISO,
        until: untilISO,
        totalCommits: commits.length,
        commits,
    };

    await mkdir(ctx.artifactsDir, { recursive: true });
    await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    info(`Wrote ${commits.length} commits to ${outputPath}`);

    return ctx;
}
