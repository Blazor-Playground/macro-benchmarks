import { FocusCharts } from './focus-chart.js';
import { DebugLoader } from './debug-loader.js';
import { buildDebugReport } from './debug-data.js';
import type { DebugPublication, DebugReport } from './debug-types.js';
import type { FocusRange } from './focus-types.js';

export class DebugSession {
    private controller: AbortController | null = null;
    private generation = 0;
    private disposed = false;
    private publication: { app: string; value: DebugPublication } | null = null;
    private report: DebugReport | null = null;
    constructor(private readonly loader: DebugLoader, private readonly charts: Pick<FocusCharts, 'render' | 'dispose'> = new FocusCharts(),
        private readonly now: () => Date = () => new Date()) {}
    async load(app: string, range: FocusRange, cohort: string, force: boolean): Promise<string> {
        if (this.disposed) throw new Error('Debug session is disposed');
        this.controller?.abort();
        const controller = this.controller = new AbortController(), generation = ++this.generation;
        this.report = null; this.charts.dispose();
        try {
            const cached = !force && this.publication?.app === app ? this.publication.value : null;
            if (!cached) this.publication = null;
            const value = cached ?? await this.loader.load(app, controller.signal, force);
            if (this.disposed || controller.signal.aborted || generation !== this.generation) return JSON.stringify({ status: 'cancelled' });
            this.publication = { app, value };
            this.report = buildDebugReport(value, app, range, cohort, this.now());
            const resource = value.index.apps.find(item => item.id === app);
            this.report.rawDataPath = resource ? new URL(resource.file, this.loader.root).href : null;
            return JSON.stringify({ status: 'ready', report: this.report });
        } catch (error) {
            if (controller.signal.aborted || this.disposed) return JSON.stringify({ status: 'cancelled' });
            throw error;
        }
    }
    render(owner: string, measurements: boolean, percentage: boolean): void {
        if (!this.report || this.disposed) return;
        try { this.charts.render(owner, this.report, false, false, { measurements, percentage }); }
        catch (error) { this.charts.dispose(); throw error; }
    }
    dispose(): void {
        this.disposed = true; this.generation++; this.controller?.abort();
        this.report = null; this.publication = null; this.charts.dispose();
    }
}
const sessions = new Map<string, DebugSession>();
function session(id: string): DebugSession {
    const result = sessions.get(id);
    if (!result) throw new Error('Debug session no longer exists');
    return result;
}
export function createDebugSession(base: string, local = false): string {
    const id = crypto.randomUUID();
    sessions.set(id, new DebugSession(new DebugLoader(new URL(local ? 'data/local-debug/' : 'data/views/debug/', base))));
    return id;
}
export function loadDebugReport(id: string, app: string, range: FocusRange, cohort: string, force: boolean): Promise<string> {
    return session(id).load(app, range, cohort, force);
}
export function renderDebugCharts(id: string, measurements: boolean, percentage: boolean): void {
    session(id).render(id, measurements, percentage);
}
export function disposeDebugSession(id: string): void { sessions.get(id)?.dispose(); sessions.delete(id); }
