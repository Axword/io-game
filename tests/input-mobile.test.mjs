import test from 'node:test';
import assert from 'node:assert/strict';
import { InputManager } from '../js/core/InputManager.js';

test('touch stick supports eight normalized directions and a neutral dead zone', () => {
    const input = new InputManager();
    input.setTouchVector(.05, -.05);
    assert.deepEqual(input.getMovementVector(), { x: 0, y: 0 });
    for (const [x, y] of [[1,0], [1,1], [0,1], [-1,1], [-1,0], [-1,-1], [0,-1], [1,-1]]) {
        input.setTouchVector(x, y);
        const movement = input.getMovementVector();
        assert.ok(Math.abs(Math.hypot(movement.x, movement.y) - 1) < 1e-10);
        assert.equal(Math.sign(movement.x), x);
        assert.equal(Math.sign(movement.y), y);
    }
});

test('releasing touch keeps a held physical movement key active', () => {
    const input = new InputManager();
    input.onKeyDown({ code: 'KeyD', target: { tagName: 'CANVAS' } });
    input.setTouchVector(-1, 0);
    assert.equal(input.getMovementVector().x, 0);
    input.setTouchVector(0, 0);
    assert.equal(input.getMovementVector().x, 1);
    input.onKeyUp({ code: 'KeyD' });
    assert.equal(input.getMovementVector().x, 0);
});

test('keyboard input in form fields cannot move the character or use the portal', () => {
    const input = new InputManager();
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
        input.onKeyDown({ code: 'KeyW', target: { tagName } });
        input.onKeyDown({ code: 'KeyE', target: { tagName } });
    }
    input.onKeyDown({ code: 'KeyE', target: { isContentEditable: true } });
    assert.equal(input.isKeyPressed('KeyW'), false);
    assert.equal(input.consumeAction('portal'), false);
});

test('portal press is one action and repeated keydown does not queue repeated travel', () => {
    const input = new InputManager();
    const event = { code: 'KeyE', target: { tagName: 'CANVAS' } };
    input.onKeyDown(event);
    assert.equal(input.consumeAction('portal'), true);
    input.onKeyDown({ ...event, repeat: true });
    assert.equal(input.consumeAction('portal'), false);
    input.onKeyUp(event);
    input.onKeyDown(event);
    assert.equal(input.consumeAction('portal'), true);
});

test('release flushes stopped movement even inside the network send interval', () => {
    const input = new InputManager();
    const sent = [];
    input.setWebSocketClient({ connected: true, sendInput(message) { sent.push(message); } });
    input.onKeyDown({ code: 'KeyD', target: { tagName: 'CANVAS' } });
    input.onKeyUp({ code: 'KeyD' });
    assert.equal(sent.length, 2);
    assert.equal(sent[0].keys.KeyD, true);
    assert.equal(sent[1].keys.KeyD, false);
    input.setTouchVector(1, 1);
    input.releaseAll();
    assert.deepEqual(input.getMovementVector(), { x: 0, y: 0 });
    assert.ok(!sent.at(-1).keys.KeyD && !sent.at(-1).keys.KeyW);
});

test('closing controls cancels pending action timers without leaving held keys', async () => {
    const input = new InputManager();
    input.pressAction('portal');
    assert.equal(input.isKeyPressed('KeyE'), true);
    input.releaseAll();
    assert.equal(input.isKeyPressed('KeyE'), false);
    assert.equal(input.consumeAction('portal'), false);
    assert.equal(input.actionTimers.size, 0);
});

test('an open menu blocks movement and portal keys while Escape can close it', () => {
    const input = new InputManager();
    input.controlsBlocked = true;
    input.onKeyDown({ code: 'KeyW', target: { tagName: 'BUTTON' } });
    input.onKeyDown({ code: 'KeyE', target: { tagName: 'BUTTON' } });
    input.onKeyDown({ code: 'Escape', target: { tagName: 'BUTTON' } });
    assert.deepEqual(input.getMovementVector(), { x: 0, y: 0 });
    assert.equal(input.consumeAction('portal'), false);
    assert.equal(input.consumeAction('menu'), true);
});

test('keyboard Space remains available for native focused menu buttons', () => {
    const input = new InputManager();
    let prevented = false;
    input.controlsBlocked = true;
    input.onKeyDown({ code: 'Space', target: { tagName: 'BUTTON' }, preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
});
