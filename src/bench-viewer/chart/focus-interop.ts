import { buildFocusReport } from './focus-data.js';
import { FocusCharts } from './focus-chart.js';
import { FocusLoader } from './focus-loader.js';
import { DEFAULT_FOCUS_GRAPH_VISIBILITY, DEFAULT_FOCUS_SELECTION, focusConfiguration, resolveFocusSelection } from './focus-selection.js';
import type { FocusFlavor, FocusGraphVisibility, FocusProfile, FocusPublication, FocusRange, FocusReport, FocusSelection } from './focus-types.js';

export class FocusSession {
    private controller: AbortController | null = null;
    private generation = 0;
    private disposed = false;
    private report: FocusReport | null = null;
    private publication: { app: string; data: FocusPublication } | null = null;

    constructor(
        private readonly loader: FocusLoader,
        private readonly charts: Pick<FocusCharts, 'render' | 'dispose'> = new FocusCharts(),
        private readonly now: () => Date = () => new Date(),
    ) {}

    async load(app: string, range: FocusRange, force = false, selection: FocusSelection = DEFAULT_FOCUS_SELECTION): Promise<string> {
        if (this.disposed) throw new Error('This focus view has been disposed.');
        resolveFocusSelection(selection);
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        const generation = ++this.generation;
        this.report = null;
        this.charts.dispose();
        try {
            const cached = !force && this.publication?.app === app ? this.publication.data : null;
            if (!cached) this.publication = null;
            const publication = cached ?? await this.loader.load(app, controller.signal, force);
            if (controller.signal.aborted || generation !== this.generation || this.disposed) {
                return JSON.stringify({ status: 'cancelled' });
            }
            this.report = buildFocusReport(publication, app, range, this.now(), selection);
            this.publication = { app, data: publication };
            return JSON.stringify({ status: 'ready', report: this.report });
        } catch (error) {
            if (controller.signal.aborted || this.disposed) return JSON.stringify({ status: 'cancelled' });
            throw error;
        }
    }

    render(owner: string, averaged: boolean, bands: boolean, visibility: FocusGraphVisibility = DEFAULT_FOCUS_GRAPH_VISIBILITY): void {
        if (this.disposed || !this.report) throw new Error('The focus view has no current report to render.');
        try {
            this.charts.render(owner, this.report, averaged, bands, visibility);
        } catch (error) {
            this.charts.dispose();
            throw error;
        }
    }

    dispose(): void {
        this.disposed = true;
        this.generation++;
        this.controller?.abort();
        this.report = null;
        this.publication = null;
        this.charts.dispose();
    }
}

const sessions = new Map<string, FocusSession>();

function sessionFor(id: string): FocusSession {
    const session = sessions.get(id);
    if (!session) throw new Error('The focus view session is no longer available.');
    return session;
}

export function createFocusSession(baseUri: string): string {
    const id = crypto.randomUUID();
    sessions.set(id, new FocusSession(new FocusLoader(new URL('data/views/', baseUri))));
    return id;
}

export function getFocusConfiguration(): string {
    return JSON.stringify(focusConfiguration());
}

export function loadFocusReport(id: string, app: string, range: FocusRange, flavor: FocusFlavor, startupProfile: FocusProfile, force: boolean): Promise<string> {
    return sessionFor(id).load(app, range, force, { flavor, startupProfile });
}

export function renderFocusCharts(id: string, averaged: boolean, bands: boolean, percentage: boolean, measurements: boolean): void {
    sessionFor(id).render(id, averaged, bands, { percentage, measurements });
}

export function disposeFocusSession(id: string): void {
    sessions.get(id)?.dispose();
    sessions.delete(id);
}
