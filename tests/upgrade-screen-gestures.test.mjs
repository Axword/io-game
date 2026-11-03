import test from 'node:test';
import assert from 'node:assert/strict';
import { UpgradeScreen } from '../js/ui/UpgradeScreen.js';

function node() {
    return {
        style: {}, dataset: {}, children: [], listeners: new Map(),
        classList: { toggle() {} }, setAttribute() {},
        replaceChildren() { this.children = []; },
        appendChild(child) { this.children.push(child); },
        addEventListener(type, handler) {
            if (!this.listeners.has(type)) this.listeners.set(type, []);
            this.listeners.get(type).push(handler);
        },
        removeEventListener(type, handler) {
            this.listeners.set(type, (this.listeners.get(type) || []).filter(listener => listener !== handler));
        }
    };
}

// Dispatch through document capture before the current button, including when
// pointerdown has synchronously replaced that button with the next offer.
function dispatch(document, target, type, data = {}) {
    const event = { type, target, detail: 1, clientX: 80, clientY: 120, ...data,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() { this.stopped = true; } };
    for (const listener of document.listeners.get(type) || []) {
        listener(event);
        if (event.stopped) return event;
    }
    for (const listener of target.listeners.get(type) || []) {
        listener(event);
        if (event.stopped) break;
    }
    return event;
}

test('one touch selects one queued offer across replacement, without delaying the next tap, mouse or keyboard', () => {
    const originalDocument = globalThis.document, originalWindow = globalThis.window;
    const screenNode = node(), container = node();
    const document = { ...node(), getElementById: id => id === 'up-cards' ? container : screenNode, createElement: node };
    globalThis.document = document;
    globalThis.window = node();
    const selected = [];
    let screen;
    const next = () => screen.show([{ name: 'Damage', upgradeKey: `offer-${selected.length}`, icon: 'bow', rarId: 0 }]);
    screen = new UpgradeScreen(card => { selected.push(card.upgradeKey); next(); });
    try {
        next();
        const old = container.children[0];
        dispatch(document, old, 'pointerdown', { pointerType: 'touch', pointerId: 7 });
        assert.equal(selected.length, 1);
        assert.notEqual(container.children[0], old);
        dispatch(document, container.children[0], 'pointerup', { pointerType: 'touch', pointerId: 7 });
        const click = dispatch(document, container.children[0], 'click', { pointerType: 'touch', pointerId: 7 });
        assert.equal(click.defaultPrevented, true);
        assert.equal(selected.length, 1, 'the replacement card cannot receive the same gesture twice');

        // No clock advance: an intentional second tap must work immediately.
        dispatch(document, container.children[0], 'pointerdown', { pointerType: 'touch', pointerId: 7 });
        dispatch(document, container.children[0], 'pointerup', { pointerType: 'touch', pointerId: 7 });
        const safariClick = dispatch(document, container.children[0], 'click');
        assert.equal(safariClick.defaultPrevented, true, 'legacy Safari MouseEvent is matched to its released touch');
        assert.equal(selected.length, 2);

        dispatch(document, container.children[0], 'click', { detail: 0 });
        assert.equal(selected.length, 3, 'keyboard activation remains available');
        dispatch(document, container.children[0], 'pointerdown', { pointerType: 'mouse', pointerId: 1 });
        dispatch(document, container.children[0], 'click', { pointerType: 'mouse', pointerId: 1 });
        assert.equal(selected.length, 4, 'a genuine mouse click still selects normally');
    } finally {
        screen.destroy();
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
    }
});

test('the compatibility click from a final touch choice cannot activate the HUD underneath the hidden panel', () => {
    const originalDocument = globalThis.document, originalWindow = globalThis.window;
    const screenNode = node(), container = node(), underlying = node();
    const document = { ...node(), getElementById: id => id === 'up-cards' ? container : screenNode, createElement: node };
    globalThis.document = document;
    globalThis.window = node();
    let accidentallyActivated = 0;
    underlying.addEventListener('click', () => accidentallyActivated++);
    let screen;
    screen = new UpgradeScreen(() => screen.hide());
    try {
        screen.show([{ name: 'Damage', upgradeKey: 'last', icon: 'bow', rarId: 0 }]);
        dispatch(document, container.children[0], 'pointerdown', { pointerType: 'pen', pointerId: 9 });
        assert.equal(screenNode.style.display, 'none');
        dispatch(document, underlying, 'pointerup', { pointerType: 'pen', pointerId: 9 });
        dispatch(document, underlying, 'click', { pointerType: 'pen', pointerId: 9 });
        assert.equal(accidentallyActivated, 0);

        // Some browsers omit that compatibility click. A reused pointer ID on
        // the next intentional HUD gesture must retire the leftover ticket.
        screen.show([{ name: 'Damage', upgradeKey: 'again', icon: 'bow', rarId: 0 }]);
        dispatch(document, container.children[0], 'pointerdown', { pointerType: 'touch', pointerId: 7 });
        dispatch(document, underlying, 'pointerup', { pointerType: 'touch', pointerId: 7 });
        dispatch(document, underlying, 'pointerdown', { pointerType: 'touch', pointerId: 7 });
        dispatch(document, underlying, 'pointerup', { pointerType: 'touch', pointerId: 7 });
        dispatch(document, underlying, 'click');
        assert.equal(accidentallyActivated, 1, 'a deliberate next HUD tap is not swallowed');
    } finally {
        screen.destroy();
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
    }
});
