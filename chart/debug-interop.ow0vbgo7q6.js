import { FocusCharts } from './focus-chart.js';
import { DebugLoader } from './debug-loader.js';
import { buildDebugReport } from './debug-data.js';
export class DebugSession {
    loader;
    charts;
    now;
    controller = null;
    generation = 0;
    disposed = false;
    publication = null;
    report = null;
    constructor(loader, charts = new FocusCharts(), now = () => new Date()) {
        this.loader = loader;
        this.charts = charts;
        this.now = now;
    }
    async load(app, range, force) {
        if (this.disposed)
            throw new Error('Debug session is disposed');
        this.controller?.abort();
        const controller = this.controller = new AbortController(), generation = ++this.generation;
        this.report = null;
        this.charts.dispose();
        try {
            const cached = !force && this.publication?.app === app ? this.publication.value : null;
            if (!cached)
                this.publication = null;
            const value = cached ?? await this.loader.load(app, controller.signal, force);
            if (this.disposed || controller.signal.aborted || generation !== this.generation)
                return JSON.stringify({ status: 'cancelled' });
            this.publication = { app, value };
            this.report = buildDebugReport(value, app, range, this.now());
            return JSON.stringify({ status: 'ready', report: this.report });
        }
        catch (error) {
            if (controller.signal.aborted || this.disposed)
                return JSON.stringify({ status: 'cancelled' });
            throw error;
        }
    }
    render(owner, measurements, percentage) {
        if (!this.report || this.disposed)
            return;
        try {
            this.charts.render(owner, this.report, false, false, { measurements, percentage });
        }
        catch (error) {
            this.charts.dispose();
            throw error;
        }
    }
    dispose() {
        this.disposed = true;
        this.generation++;
        this.controller?.abort();
        this.report = null;
        this.publication = null;
        this.charts.dispose();
    }
}
const sessions = new Map();
function session(id) {
    const result = sessions.get(id);
    if (!result)
        throw new Error('Debug session no longer exists');
    return result;
}
export function createDebugSession(base) {
    const id = crypto.randomUUID();
    sessions.set(id, new DebugSession(new DebugLoader(new URL('data/views/debug/', base))));
    return id;
}
export function loadDebugReport(id, app, range, force) {
    return session(id).load(app, range, force);
}
export function renderDebugCharts(id, measurements, percentage) {
    session(id).render(id, measurements, percentage);
}
export function disposeDebugSession(id) { sessions.get(id)?.dispose(); sessions.delete(id); }
export function revealDebugMethodology() {
    const details = document.getElementById('debug-methodology');
    if (!(details instanceof HTMLDetailsElement))
        throw new Error('Debug methodology section is missing');
    const summary = details.querySelector('summary');
    if (!summary)
        throw new Error('Debug methodology summary is missing');
    details.open = true;
    details.scrollIntoView({ block: 'start' });
    summary.focus({ preventScroll: true });
}
