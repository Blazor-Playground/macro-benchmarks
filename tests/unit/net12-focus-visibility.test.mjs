import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicationFor } from '../helpers/focus-fixture.mjs';
import { buildFocusReport } from '../../src/bench-viewer/wwwroot/chart/focus-data.js';
import { FocusCharts, focusChartModel } from '../../src/bench-viewer/wwwroot/chart/focus-chart.js';
import { DEFAULT_FOCUS_AVERAGED, DEFAULT_FOCUS_GRAPH_VISIBILITY, focusConfiguration } from '../../src/bench-viewer/wwwroot/chart/focus-selection.js';

const report = () => buildFocusReport(publicationFor('havit-bootstrap'), 'havit-bootstrap', '14d', new Date('2026-09-20'));
const modes = [
    { percentage: true, measurements: false, keys: ['percent'], axes: ['x', 'comparison'] },
    { percentage: false, measurements: true, keys: ['coreclr', 'mono'], axes: ['x', 'y'] },
    { percentage: true, measurements: true, keys: ['coreclr', 'mono', 'percent'], axes: ['x', 'y', 'comparison'] },
    { percentage: false, measurements: false, keys: [], axes: [] },
];

test('measurements-only visibility defaults come from the central configuration', () => {
    assert.deepEqual(DEFAULT_FOCUS_GRAPH_VISIBILITY, { percentage: false, measurements: true });
    assert.deepEqual(focusConfiguration().defaultGraphVisibility, DEFAULT_FOCUS_GRAPH_VISIBILITY);
    assert.deepEqual(focusChartModel(report().metrics[0], true, true).series.map(series => series.key), ['coreclr', 'mono']);
});

test('raw graph defaults use exact measurements, disable bands and preserve secondary rolling summaries', () => {
    assert.equal(DEFAULT_FOCUS_AVERAGED, false);
    assert.equal(focusConfiguration().defaultAveraged, DEFAULT_FOCUS_AVERAGED);
    const data = report();
    const before = structuredClone(data);
    for (const metric of data.metrics) {
        const graph = focusChartModel(metric, DEFAULT_FOCUS_AVERAGED, true);
        assert.equal(graph.bands, false);
        assert.equal(graph.series[0].data.at(-1).y, metric.latest.coreclr / metric.divisor);
        assert.equal(graph.series[1].data.at(-1).y, metric.latest.mono / metric.divisor);
        assert(metric.averageComparison);
    }
    assert.deepEqual(data, before);
});

for (const mode of modes) {
    test(`visible curve model percentage=${mode.percentage} measurements=${mode.measurements} never changes summaries`, () => {
        const value = report();
        const before = structuredClone(value);
        for (const metric of value.metrics) {
            const average = focusChartModel(metric, true, true, mode);
            const raw = focusChartModel(metric, false, true, mode);
            assert.deepEqual(average.series.map(series => series.key), mode.keys);
            assert.equal(average.bands, mode.keys.length > 0);
            assert.equal(raw.bands, false);
            assert.equal(average.bandOpacity, 0.2);
            assert.deepEqual(value, before);
        }
    });
}

test('chart ownership removes disabled axes, destroys both-off graphs and never touches Home instances', () => {
    const names = ['Chart', 'document', 'HTMLCanvasElement'];
    const originals = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
    let lookups = 0;
    const active = new Set();
    class Canvas {
        constructor(id) { this.id = id; }
        getContext() { return { canvas: this }; }
    }
    class Chart {
        constructor(context, config) { this.config = config; this.id = context.canvas.id; active.add(this); }
        destroy() { active.delete(this); }
    }
    Object.assign(globalThis, { Chart, HTMLCanvasElement: Canvas, document: {
        getElementById(id) { lookups++; return new Canvas(id); },
    } });
    try {
        const home = new Chart({ canvas: { id: 'home' } }, {});
        const charts = new FocusCharts();
        const data = report();
        for (const mode of modes) {
            const previousLookups = lookups;
            charts.render('focus-owner', data, true, true, mode);
            const own = [...active].filter(chart => chart !== home);
            assert.equal(own.length, mode.keys.length ? 4 : 0);
            if (!mode.keys.length) assert.equal(lookups, previousLookups, 'off rendering never queries a canvas');
            for (const chart of own) {
                assert.deepEqual(Object.keys(chart.config.options.scales), mode.axes);
                assert.equal(chart.config.data.datasets.length, mode.keys.length);
            }
            assert(active.has(home));
        }
        for (let i = 0; i < 10; i++) {
            charts.render('focus-owner', data, true, true, modes[0]);
            assert.equal(active.size, 5);
            charts.render('focus-owner', data, true, true, modes[3]);
            assert.equal(active.size, 1);
        }
        charts.dispose();
        assert.deepEqual([...active], [home]);
    } finally {
        names.forEach((name, i) => originals[i] ? Object.defineProperty(globalThis, name, originals[i]) : Reflect.deleteProperty(globalThis, name));
    }
});

test('percentage-only mode does not create an empty graph for runtime-only incomplete pairs', () => {
    const data = report();
    for (const metric of data.metrics) {
        metric.points.forEach(point => { point.percent = null; point.percentWindow = null; });
    }
    const charts = new FocusCharts();
    assert.doesNotThrow(() => charts.render('no-canvas-needed', data, true, true, { percentage: true, measurements: false }));
});
