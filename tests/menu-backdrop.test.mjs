import test from 'node:test';
import assert from 'node:assert/strict';
import { MenuBackdrop } from '../js/ui/MenuBackdrop.js';

function fixture(reducedMotion = false) {
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    globalThis.window = { innerWidth: 1920, innerHeight: 1080, matchMedia() { return { matches: reducedMotion }; } };
    globalThis.document = { hidden: false };
    const context = new Proxy({}, { get(target, key) { return target[key] ?? (() => {}); }, set(target, key, value) { target[key] = value; return true; } });
    const requests = [];
    const canvas = { width: 300, height: 150, hidden: true, getContext(type) { requests.push(type); return context; } };
    return { preview: new MenuBackdrop(canvas), requests, restore() { globalThis.window = previousWindow; globalThis.document = previousDocument; } };
}

test('menu preview uses bounded 2D pools and stops while hidden or in gameplay', () => {
    const { preview, requests, restore } = fixture();
    try {
        preview.update(1 / 30, true);
        assert.deepEqual(requests, ['2d']);
        assert.equal(preview.canvas.width, 900);
        const frame = preview.frames, time = preview.time;
        preview.update(.05, false);
        assert.equal(preview.canvas.hidden, true);
        assert.equal(preview.frames, frame);
        assert.equal(preview.time, time);
        document.hidden = true;
        preview.update(.05, true);
        assert.equal(preview.frames, frame);
        assert.equal(preview.time, time);
        document.hidden = false;
        const enemies = preview.enemies, shots = preview.shots, orbs = preview.orbs;
        for (let i = 0; i < 1200; i++) preview.update(1 / 120, true);
        assert.ok(preview.frames > frame && preview.frames - frame <= 301, '120Hz loop stays at at most 30 preview draws per second');
        assert.equal(preview.enemies, enemies);
        assert.equal(preview.shots, shots);
        assert.equal(preview.orbs, orbs);
        assert.deepEqual([enemies.length, shots.length, orbs.length], [24, 36, 34]);
    } finally { restore(); }
});

test('reduced-motion menu preview draws a static scene and redraws only on resize', () => {
    const { preview, restore } = fixture(true);
    try {
        for (let i = 0; i < 120; i++) preview.update(1 / 60, true);
        assert.equal(preview.frames, 1);
        assert.equal(preview.time, 0);
        window.innerWidth = 390; window.innerHeight = 844;
        preview.update(1 / 60, true);
        assert.equal(preview.frames, 2);
        assert.equal(preview.canvas.width, 390);
        assert.equal(preview.canvas.height, 844);
    } finally { restore(); }
});
