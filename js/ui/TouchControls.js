export class TouchControls {
    constructor(input) {
        this.input = input;
        this.visible = false;
        this.pointerId = null;
        this.portalState = { near: false, locked: true };
        this.root = document.createElement('div');
        this.root.id = 'touch-controls';
        this.root.setAttribute('aria-label', 'Sterowanie dotykowe');
        this.root.hidden = true;
        this.stick = document.createElement('div');
        this.stick.id = 'touch-stick';
        this.stick.setAttribute('role', 'group');
        this.stick.setAttribute('aria-label', 'Ruch postaci');
        this.knob = document.createElement('div');
        this.knob.className = 'touch-stick-knob';
        this.stick.appendChild(this.knob);
        this.portal = document.createElement('button');
        this.portal.id = 'touch-portal';
        this.portal.type = 'button';
        this.portal.textContent = 'Portal';
        this.portal.hidden = true;
        this.menu = document.createElement('button');
        this.menu.id = 'touch-menu';
        this.menu.type = 'button';
        this.menu.setAttribute('aria-label', 'Menu gry');
        this.menu.innerHTML = '<span aria-hidden="true">Ⅱ</span>';
        this.root.appendChild(this.stick);
        this.root.appendChild(this.portal);
        this.root.appendChild(this.menu);
        document.body.appendChild(this.root);
        this._down = event => {
            if (this.pointerId !== null || !this.visible) return;
            event.preventDefault();
            this.pointerId = event.pointerId;
            this.stick.setPointerCapture?.(event.pointerId);
            this.moveStick(event);
        };
        this._move = event => { if (event.pointerId === this.pointerId) { event.preventDefault(); this.moveStick(event); } };
        this._up = event => { if (event.pointerId === this.pointerId) this.releaseStick(); };
        this.stick.addEventListener('pointerdown', this._down);
        this.stick.addEventListener('pointermove', this._move);
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.stick.addEventListener(type, this._up);
        this.bindAction(this.portal, 'portal');
        this.bindAction(this.menu, 'menu');
        this.media = window.matchMedia?.('(pointer: coarse)');
        this._mediaChange = () => { this.refreshDevice(); this.input.releaseAll(); };
        this.media?.addEventListener?.('change', this._mediaChange);
        this.refreshDevice();
    }
    bindAction(button, action) {
        let lastPointerAction = -Infinity;
        const activate = () => {
            if (!this.visible || button.disabled || (action === 'portal' && !this.portalState.near)) return;
            this.input.pressAction(action);
        };
        // A second finger does not reliably create a click while the first holds
        // the stick. Pointerdown supports that normal two-thumb interaction.
        button.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            event.preventDefault();
            lastPointerAction = performance.now();
            activate();
        });
        button.addEventListener('click', event => {
            if (performance.now() - lastPointerAction < 700) return;
            activate();
        });
    }
    refreshDevice() {
        this.isTouch = !!(this.media?.matches || globalThis.navigator?.maxTouchPoints > 0);
        document.body.classList?.toggle('touch-input', this.isTouch);
        this.root.hidden = !(this.visible && this.isTouch);
    }
    setVisible(visible) {
        this.input.controlsBlocked = !visible;
        if (this.visible === !!visible) return;
        this.visible = !!visible;
        this.root.hidden = !(this.visible && this.isTouch);
        if (!this.visible) this.input.releaseAll();
    }
    setPortalState(state = {}) {
        this.portalState = state;
        this.portal.hidden = !state.near;
        this.portal.disabled = !!state.locked;
        this.portal.textContent = state.locked ? `Poziom ${state.requiredLevel || 30}` : 'Portal';
        this.portal.setAttribute('aria-label', state.locked ? `Portal od poziomu ${state.requiredLevel || 30}` : `Portal: ${state.targetName || 'następny świat'}`);
    }
    moveStick(event) {
        const rect = this.stick.getBoundingClientRect();
        const radius = rect.width * 0.35;
        let dx = event.clientX - rect.left - rect.width / 2;
        let dy = event.clientY - rect.top - rect.height / 2;
        const length = Math.hypot(dx, dy);
        if (length > radius) { dx *= radius / length; dy *= radius / length; }
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.input.setTouchVector(dx / radius, -dy / radius);
    }
    releaseStick() {
        const pointerId = this.pointerId;
        this.pointerId = null;
        this.knob.style.transform = 'translate(0px, 0px)';
        if (pointerId !== null && this.stick.hasPointerCapture?.(pointerId)) this.stick.releasePointerCapture?.(pointerId);
        for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) this.input.touchKeys[key] = false;
        this.input.sendInput(true);
    }
    destroy() {
        this.releaseStick();
        this.media?.removeEventListener?.('change', this._mediaChange);
        this.root.remove();
        document.body.classList?.remove('touch-input');
    }
}
