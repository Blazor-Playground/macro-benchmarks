import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wrapFocusTooltipText } from '../../src/bench-viewer/wwwroot/chart/focus-chart.js';

test('native tooltip text wraps at word boundaries without dropping labels or measurements', () => {
    const text = 'CoreCLR publish (native-relink) raw: 142,094 ms';
    const lines = wrapFocusTooltipText(text, 18, value => value.length);
    assert.deepEqual(lines, ['CoreCLR publish', '(native-relink)', 'raw: 142,094 ms']);
    assert.equal(lines.join(' '), text);
});

test('a long SDK token wraps without truncation', () => {
    const sdk = '12.0.100-alpha.1.26471.111';
    const lines = wrapFocusTooltipText(sdk, 10, value => value.length);
    assert(lines.every(line => line.length <= 10));
    assert.equal(lines.join(''), sdk);
});

test('measurement units do not end up alone on a line', () => {
    for (const unit of ['ms', 's', 'MB']) {
        assert.deepEqual(wrapFocusTooltipText(`Mono raw: 25,207 ${unit}`, 16, value => value.length),
            ['Mono raw:', `25,207 ${unit}`]);
    }
});

test('tooltip wrapping measures rendered width rather than character count', () => {
    const measure = value => [...value].reduce((width, letter) => width + (letter === 'W' ? 3 : 1), 0);
    const lines = wrapFocusTooltipText('WWW iii', 5, measure);
    assert.deepEqual(lines, ['W', 'W', 'W', 'iii']);
    assert(lines.every(line => measure(line) <= 5));
    assert.deepEqual(wrapFocusTooltipText('', 5, measure), []);
    assert.deepEqual(wrapFocusTooltipText('iii', 5, measure), ['iii']);
});

test('invalid tooltip widths are rejected explicitly', () => {
    for (const width of [0, -1, NaN, Infinity]) {
        assert.throws(() => wrapFocusTooltipText('text', width, value => value.length), /finite and positive/);
    }
});
