import { buildFocusReport } from './focus-data.js';
import { FocusCharts } from './focus-chart.js';
import { FocusLoader } from './focus-loader.js';
import { DEFAULT_FOCUS_GRAPH_VISIBILITY, DEFAULT_FOCUS_SELECTION, focusConfiguration, resolveFocusSelection } from './focus-selection.js';
export class FocusSession {
    loader;
    charts;
    now;
    controller = null;
    generation = 0;
    disposed = false;
    report = null;
    publication = null;
    constructor(loader, charts = new FocusCharts(), now = () => new Date()) {
        this.loader = loader;
        this.charts = charts;
        this.now = now;
    }
    async load(app, range, force = false, selection = DEFAULT_FOCUS_SELECTION) {
        if (this.disposed)
            throw new Error('This focus view has been disposed.');
        resolveFocusSelection(selection);
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        const generation = ++this.generation;
        this.report = null;
        this.charts.dispose();
        try {
            const cached = !force && this.publication?.app === app ? this.publication.data : null;
            if (!cached)
                this.publication = null;
            const publication = cached ?? await this.loader.load(app, controller.signal, force);
            if (controller.signal.aborted || generation !== this.generation || this.disposed) {
                return JSON.stringify({ status: 'cancelled' });
            }
            this.report = buildFocusReport(publication, app, range, this.now(), selection);
            this.publication = { app, data: publication };
            return JSON.stringify({ status: 'ready', report: this.report });
        }
        catch (error) {
            if (controller.signal.aborted || this.disposed)
                return JSON.stringify({ status: 'cancelled' });
            throw error;
        }
    }
    render(owner, averaged, bands, visibility = DEFAULT_FOCUS_GRAPH_VISIBILITY) {
        if (this.disposed || !this.report)
            throw new Error('The focus view has no current report to render.');
        try {
            this.charts.render(owner, this.report, averaged, bands, visibility);
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
function sessionFor(id) {
    const session = sessions.get(id);
    if (!session)
        throw new Error('The focus view session is no longer available.');
    return session;
}
export function createFocusSession(baseUri) {
    const id = crypto.randomUUID();
    sessions.set(id, new FocusSession(new FocusLoader(new URL('data/views/', baseUri))));
    return id;
}
export function getFocusConfiguration() {
    return JSON.stringify(focusConfiguration());
}
export function loadFocusReport(id, app, range, flavor, startupProfile, force) {
    return sessionFor(id).load(app, range, force, { flavor, startupProfile });
}
export function renderFocusCharts(id, averaged, bands, percentage, measurements) {
    sessionFor(id).render(id, averaged, bands, { percentage, measurements });
}
export function disposeFocusSession(id) {
    sessions.get(id)?.dispose();
    sessions.delete(id);
}
