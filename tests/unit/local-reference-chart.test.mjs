import assert from 'node:assert/strict';
import test from 'node:test';
import { FocusCharts } from '../../src/bench-viewer/wwwroot/chart/focus-chart.js';
import { buildFocusReport } from '../../src/bench-viewer/wwwroot/chart/focus-data.js';
import { publicationFor } from '../helpers/focus-fixture.mjs';

test('fixed reference is a dashed overlay, not an indexed observation dataset', () => {
    const names = ['Chart', 'document', 'HTMLCanvasElement'];
    const originals = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
    const charts = [];
    const calls = [];
    const context = {
        save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, stroke() {},
        setLineDash(value) { calls.push(['dash', value]); },
        moveTo(x, y) { calls.push(['move', x, y]); },
        lineTo(x, y) { calls.push(['line', x, y]); },
        measureText(value) { return { width: value.length }; },
    };
    class Canvas {
        clientWidth = 400;
        getContext() { return context; }
    }
    class Chart {
        constructor(_context, config) { this.config = config; charts.push(this); }
        destroy() {}
    }
    Object.assign(globalThis, { Chart, HTMLCanvasElement: Canvas, document: { getElementById: () => new Canvas() } });
    try {
        const report = buildFocusReport(publicationFor('havit-bootstrap'), 'havit-bootstrap', '14d', new Date('2026-09-20'));
        const metric = report.metrics[0];
        metric.fixedReference = {
            value: 1234, label: 'After reference', measuredAt: '2026-10-14T10:00:00Z',
            sdkVersion: '11.fixture', commit: 'f'.repeat(40), dirty: true, rounds: 3,
        };
        metric.points.forEach(point => { point.coreclr = null; });
        report.metrics = [metric];
        new FocusCharts().render('local', report, false, false, { measurements: true, percentage: false });
        const config = charts[0].config;
        assert.deepEqual(config.data.datasets.map(dataset => dataset.label), [metric.monoLabel]);
        assert.equal(config.options.scales.x.title.text, 'Before source snapshot date (UTC)');
        config.plugins[0].beforeDatasetsDraw({
            ctx: context, chartArea: { left: 10, right: 350, top: 0, bottom: 200 },
            scales: { y: { getPixelForValue(value) { assert.equal(value, 1234); return 70; } } },
        });
        assert.deepEqual(calls, [['dash', [6, 4]], ['move', 10, 70], ['line', 350, 70], ['dash', []]]);
        const footer = config.options.plugins.tooltip.callbacks.footer().join(' ');
        assert.match(footer, /Measured 2026-10-14/);
        assert.match(footer, /Base ffffffffffff \+ local changes/);
        assert.match(footer, /Pooled from 3 rounds/);
        assert.doesNotMatch(footer, /2026-09/);
    } finally {
        names.forEach((name, index) => originals[index]
            ? Object.defineProperty(globalThis, name, originals[index]) : Reflect.deleteProperty(globalThis, name));
    }
});
