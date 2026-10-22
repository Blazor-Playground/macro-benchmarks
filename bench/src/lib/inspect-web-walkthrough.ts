/**
 * inspect-web-walkthrough.ts — Playwright walkthrough for Inspect Web (dotnet-inspect's
 * browser-wasm build, see src/inspect-web/README.md).
 *
 * Unlike the UI walkthroughs, this drives the managed inspection engine directly through
 * Inspect Web's published-runtime benchmark bridge (`window.__inspectWebRuntimeBenchmark`),
 * which forwards each call to the production Web Worker. The timed scenario is compute-bound
 * C#: package acquisition + metadata projection, whole-assembly performance analysis, and
 * per-member IL facts.
 *
 * nuget.org traffic is served from fixtures staged by src/inspect-web/build.mjs, so the
 * measurement never depends on the live service. Any unexpected external request fails the run.
 */

import type { Page, Route } from 'playwright';
import { debug } from '../log.js';
import { type WalkthroughOpts } from './walkthrough-types.js';

const FIXTURE_DIR = 'inspect-web-fixtures/';

/**
 * Pinned scenario. The expected counts are semantic checks for the package at the commit pinned
 * in src/inspect-web/InspectWeb.csproj; update them together with the pin.
 */
const SCENARIO = {
    packageId: 'Microsoft.Extensions.Primitives',
    version: '10.0.0',
    targetFramework: 'net10.0',
    memberCount: 24,
    expected: { types: 22, members: 134, performanceOpportunities: 15 },
} as const;

type Scenario = typeof SCENARIO;

interface ScenarioResult {
    milliseconds: number;
    steps: Record<string, number>;
    memberFacts: number;
}

interface FixtureManifest {
    files: { url: string; path: string; contentType: string }[];
}

/** Runs inside the browser; must be self-contained. */
const browserInspectWebScenario = async (scenario: Scenario): Promise<ScenarioResult> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bridge = (globalThis as any).__inspectWebRuntimeBenchmark;
    if (!bridge) throw new Error('Inspect Web benchmark bridge is unavailable');
    const { packageId, version, targetFramework } = scenario;
    const steps: Record<string, number> = {};
    const started = performance.now();

    let mark = performance.now();
    const load = await bridge.package.queryPackage(packageId, version, targetFramework);
    steps['query-package'] = performance.now() - mark;
    const surface = load.surface;
    if (!surface) {
        throw new Error(load.versionSettlement?.content?.failure?.reason ?? 'queryPackage produced no surface');
    }
    if (surface.inspectionError) throw new Error(`Package inspection failed: ${surface.inspectionError}`);
    if (surface.types.length !== scenario.expected.types || surface.totalMembers !== scenario.expected.members) {
        throw new Error(`Unexpected package surface: ${surface.types.length} types / ${surface.totalMembers} members `
            + `(expected ${scenario.expected.types} / ${scenario.expected.members})`);
    }
    const assembly = surface.assemblies.find((a: { id: string }) => a.id === surface.defaultAssemblyId)
        ?? surface.assemblies[0];

    mark = performance.now();
    const perf = await bridge.analysis.queryPackagePerformance(packageId, version, targetFramework, assembly.name);
    steps['package-performance'] = performance.now() - mark;
    if (perf.inspectionError) throw new Error(`Package performance analysis failed: ${perf.inspectionError}`);
    if (perf.totalOpportunities !== scenario.expected.performanceOpportunities) {
        throw new Error(`Unexpected performance opportunities: ${perf.totalOpportunities} `
            + `(expected ${scenario.expected.performanceOpportunities})`);
    }

    // Deterministic, evenly spaced member sample. Interface members are excluded: they have no
    // implementation body and member facts reject them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates = surface.types.filter((type: any) => type.kind !== 'interface').flatMap((type: any) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type.api.flatMap((member: any) => {
            const body = member.bodySelectors[0];
            return body ? [{
                key: [type.assembly, type.definitionId, body.selectorKey, body.token].join('|'),
                assembly: type.assembly,
                typeIdentity: type.definitionId,
                memberName: body.memberName,
                memberSignature: member.signature,
                selectorKey: body.selectorKey,
                metadataToken: body.token,
            }] : [];
        }),
    ).sort((l: { key: string }, r: { key: string }) => l.key.localeCompare(r.key));
    if (candidates.length < scenario.memberCount) {
        throw new Error(`Expected at least ${scenario.memberCount} analyzable members, found ${candidates.length}`);
    }
    const selected = Array.from({ length: scenario.memberCount },
        (_, i) => candidates[Math.floor(i * (candidates.length - 1) / (scenario.memberCount - 1))]);

    mark = performance.now();
    for (const c of selected) {
        const facts = await bridge.analysis.queryMemberFacts(
            surface.package, surface.version, surface.activeFramework, c.assembly, c.typeIdentity,
            c.memberName, c.memberSignature, c.selectorKey, c.metadataToken, true);
        if (facts.metadataToken !== c.metadataToken) {
            throw new Error(`Member facts returned token ${facts.metadataToken} for ${c.metadataToken}`);
        }
    }
    steps['member-facts'] = performance.now() - mark;

    return { milliseconds: performance.now() - started, steps, memberFacts: selected.length };
};

async function installFixtureRoutes(page: Page, baseUrl: string, unexpected: string[]): Promise<void> {
    const manifestUrl = new URL(FIXTURE_DIR + 'fixtures.json', baseUrl);
    const response = await fetch(manifestUrl);
    if (!response.ok) throw new Error(`Inspect Web fixture manifest missing: ${manifestUrl} → HTTP ${response.status}`);
    const manifest = await response.json() as FixtureManifest;
    const byUrl = new Map(manifest.files.map(f => [f.url, f]));
    const bodies = new Map<string, Buffer>();
    const origin = new URL(baseUrl).origin;

    await page.route(url => url.origin !== origin, async (route: Route) => {
        const requestUrl = new URL(route.request().url());
        const fixture = byUrl.get(`${requestUrl.origin}${requestUrl.pathname}`);
        if (!fixture) {
            unexpected.push(route.request().url());
            await route.abort('blockedbyclient');
            return;
        }
        let body = bodies.get(fixture.path);
        if (!body) {
            const local = await fetch(new URL(FIXTURE_DIR + fixture.path, baseUrl));
            if (!local.ok) throw new Error(`Inspect Web fixture missing: ${fixture.path}`);
            body = Buffer.from(await local.arrayBuffer());
            bodies.set(fixture.path, body);
        }
        // The bench server sets COEP require-corp, so cross-origin fixtures need CORS headers.
        await route.fulfill({
            status: 200,
            body,
            headers: {
                'content-type': fixture.contentType,
                'access-control-allow-origin': '*',
                'cross-origin-resource-policy': 'cross-origin',
            },
        });
    });
}

/**
 * Loads Inspect Web with nuget.org routed to fixtures, waits for the Worker's managed engine,
 * then runs the scenario inside the browser in a single page.evaluate(). Returns wall-clock ms.
 */
export async function runInspectWebWalkthrough(opts: WalkthroughOpts<Page>): Promise<number> {
    const { page, url, timeout, verbose = false } = opts;
    if (!page) throw new Error('inspect-web walkthrough requires a browser page');
    const log = verbose ? (msg: string) => debug(`InspectWeb: ${msg}`) : () => { };

    const unexpected: string[] = [];
    await installFixtureRoutes(page, url, unexpected);
    try {
        log('navigating...');
        await page.goto(url, { timeout, waitUntil: 'load' });
        await page.waitForFunction(
            () => (globalThis as Record<string, unknown>).bench_complete !== undefined,
            null, { timeout },
        );

        // esbuild's keepNames injects __name() calls into the serialized function body.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.evaluate(() => { (globalThis as any).__name = (fn: any) => fn; });
        const result = await page.evaluate(browserInspectWebScenario, SCENARIO);
        if (unexpected.length > 0) {
            throw new Error(`Unexpected external requests (add fixtures to src/inspect-web/fixtures.json): ${unexpected.join(', ')}`);
        }
        log(`scenario ${Math.round(result.milliseconds)}ms `
            + Object.entries(result.steps).map(([k, v]) => `${k}=${Math.round(v)}`).join(' ')
            + ` (${result.memberFacts} member facts)`);
        return result.milliseconds;
    } catch (e) {
        if (unexpected.length > 0) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(`${msg}; unexpected external requests: ${unexpected.join(', ')}`);
        }
        throw e;
    } finally {
        await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
}
