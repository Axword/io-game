import { TouchControls } from '../ui/TouchControls.js';

const MOVEMENT_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
const editable = target => !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export class InputManager {
    constructor() {
        this.keys = {};
        this.touchKeys = {};
        this.actions = new Set();
        this.actionTimers = new Map();
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseClicked = false;
        this.mouseDown = false;
        this.camera = null;
        this.canvas = null;
        this.wsClient = null;
        this.lastInputSent = -Infinity;
        this.inputSendInterval = 40;
        this._boundKeyDown = event => this.onKeyDown(event);
        this._boundKeyUp = event => this.onKeyUp(event);
        this._boundMouseMove = event => this.onMouseMove(event);
        this._boundMouseDown = () => { this.mouseDown = true; this.mouseClicked = true; this.sendInput(); };
        this._boundMouseUp = () => { this.mouseDown = false; this.sendInput(true); };
        this._boundRelease = () => this.releaseAll();
        this._boundVisibility = () => { if (document.hidden) this.releaseAll(); };
    }
    setCamera(camera) { this.camera = camera; }
    setCanvas(canvas) {
        if (this.canvas === canvas) return;
        this.detachEvents();
        this.canvas = canvas;
        if (!canvas) return;
        window.addEventListener('keydown', this._boundKeyDown);
        window.addEventListener('keyup', this._boundKeyUp);
        window.addEventListener('blur', this._boundRelease);
        window.addEventListener('resize', this._boundRelease);
        window.addEventListener('mouseup', this._boundMouseUp);
        document.addEventListener?.('visibilitychange', this._boundVisibility);
        canvas.addEventListener('mousemove', this._boundMouseMove);
        canvas.addEventListener('mousedown', this._boundMouseDown);
        this.touchControls = new TouchControls(this);
    }
    detachEvents() {
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('keyup', this._boundKeyUp);
        window.removeEventListener('blur', this._boundRelease);
        window.removeEventListener('resize', this._boundRelease);
        window.removeEventListener('mouseup', this._boundMouseUp);
        document.removeEventListener?.('visibilitychange', this._boundVisibility);
        this.canvas?.removeEventListener('mousemove', this._boundMouseMove);
        this.canvas?.removeEventListener('mousedown', this._boundMouseDown);
        this.touchControls?.destroy();
        this.touchControls = null;
    }
    setWebSocketClient(client) { this.wsClient = client; }
    onKeyDown(event) {
        if (editable(event.target)) return;
        const code = event.code;
        if (this.controlsBlocked && (MOVEMENT_CODES.includes(code) || code === 'KeyE')) return;
        if (MOVEMENT_CODES.includes(code) || (code === 'Space' && !this.controlsBlocked && event.target?.tagName !== 'BUTTON')) event.preventDefault?.();
        if (!this.keys[code] && !event.repeat) {
            if (code === 'KeyE') this.actions.add('portal');
            if (code === 'Escape') this.actions.add('menu');
        }
        this.keys[code] = true;
        this.sendInput(!event.repeat);
    }
    onKeyUp(event) { this.keys[event.code] = false; this.sendInput(true); }
    setTouchVector(x, y) {
        const moving = Math.hypot(x, y) >= 0.18;
        this.touchKeys.KeyW = moving && y > 0.25;
        this.touchKeys.KeyS = moving && y < -0.25;
        this.touchKeys.KeyD = moving && x > 0.25;
        this.touchKeys.KeyA = moving && x < -0.25;
        this.sendInput(!moving);
    }
    pressAction(action) {
        const code = action === 'portal' ? 'KeyE' : action === 'menu' ? 'Escape' : null;
        if (!code || this.touchKeys[code]) return;
        this.actions.add(action);
        this.touchKeys[code] = true;
        this.sendInput(true);
        const timer = setTimeout(() => {
            this.touchKeys[code] = false;
            this.actionTimers.delete(code);
            this.sendInput(true);
        }, 250);
        this.actionTimers.set(code, timer);
    }
    consumeAction(action) { const requested = this.actions.has(action); this.actions.delete(action); return requested; }
    releaseAll() {
        this.keys = {};
        this.touchKeys = {};
        this.actions.clear();
        for (const timer of this.actionTimers.values()) clearTimeout(timer);
        this.actionTimers.clear();
        this.mouseDown = false;
        this.mouseClicked = false;
        this.touchControls?.releaseStick();
        this.sendInput(true);
    }
    isKeyPressed(code) { return !!(this.keys[code] || this.touchKeys[code]); }
    getMovementVector() {
        const x = Number(this.isKeyPressed('KeyD') || this.isKeyPressed('ArrowRight')) - Number(this.isKeyPressed('KeyA') || this.isKeyPressed('ArrowLeft'));
        const y = Number(this.isKeyPressed('KeyW') || this.isKeyPressed('ArrowUp')) - Number(this.isKeyPressed('KeyS') || this.isKeyPressed('ArrowDown'));
        const length = Math.hypot(x, y) || 1;
        return { x: x / length, y: y / length };
    }
    onMouseMove(event) {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left, y = event.clientY - rect.top;
        this.mouseX = this.camera ? this.camera.position.x + (x / rect.width - 0.5) * (this.camera.right - this.camera.left) : x;
        this.mouseY = this.camera ? this.camera.position.y + (0.5 - y / rect.height) * (this.camera.top - this.camera.bottom) : y;
    }
    resetClick() { this.mouseClicked = false; }
    sendInput(force = false) {
        if (!this.wsClient?.connected) return;
        const now = performance.now();
        if (!force && now - this.lastInputSent < this.inputSendInterval) return;
        this.lastInputSent = now;
        this.wsClient.sendInput({ keys: { ...this.keys, ...Object.fromEntries(Object.entries(this.touchKeys).filter(([, value]) => value)) }, mouseX: this.mouseX, mouseY: this.mouseY, mouseClicked: this.mouseClicked });
    }
    update() { this.sendInput(); }
    destroy() { this.releaseAll(); this.detachEvents(); this.canvas = null; }
}
