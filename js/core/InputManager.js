export class InputManager {
    constructor() {
        this.keys = {};
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseClicked = false;
        this.mouseDown = false;
        this.camera = null;
        this.canvas = null;
        this.wsClient = null;
        this.lastInputSent = 0;
        this.inputSendInterval = 1000 / 25; // 25 TPS to match server

        this._boundKeyDown = this.onKeyDown.bind(this);
        this._boundKeyUp = this.onKeyUp.bind(this);
        this._boundMouseMove = this.onMouseMove.bind(this);
        this._boundMouseDown = this.onMouseDown.bind(this);
        this._boundMouseUp = this.onMouseUp.bind(this);
    }

    setCamera(camera) {
        this.camera = camera;
    }

    setCanvas(canvas) {
        this.canvas = canvas;
        if (canvas) {
            window.addEventListener('keydown', this._boundKeyDown);
            window.addEventListener('keyup', this._boundKeyUp);
            canvas.addEventListener('mousemove', this._boundMouseMove);
            canvas.addEventListener('mousedown', this._boundMouseDown);
            canvas.addEventListener('mouseup', this._boundMouseUp);
        }
    }

    setWebSocketClient(wsClient) {
        this.wsClient = wsClient;
    }

    onKeyDown(e) {
        this.keys[e.code] = true;
        this.sendInput();
    }

    onKeyUp(e) {
        this.keys[e.code] = false;
        this.sendInput();
    }

    onMouseMove(e) {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;

        if (this.camera) {
            const W = rect.width;
            const H = rect.height;
            const viewWidth = this.camera.right - this.camera.left;
            const viewHeight = this.camera.top - this.camera.bottom;
            const worldX = this.camera.position.x + (screenX / W - 0.5) * viewWidth;
            const worldY = this.camera.position.y + (0.5 - screenY / H) * viewHeight;
            this.mouseX = worldX;
            this.mouseY = worldY;
        } else {
            this.mouseX = screenX;
            this.mouseY = screenY;
        }
    }

    onMouseDown(e) {
        this.mouseDown = true;
        this.mouseClicked = true;
        this.sendInput();
    }

    onMouseUp(e) {
        this.mouseDown = false;
        this.mouseClicked = false;
        this.sendInput();
    }

    isKeyPressed(code) {
        return !!this.keys[code];
    }

    resetClick() {
        this.mouseClicked = false;
    }

    sendInput() {
        if (!this.wsClient || !this.wsClient.connected) return;
        const now = performance.now();
        if (now - this.lastInputSent < this.inputSendInterval) return;
        this.lastInputSent = now;

        this.wsClient.sendInput({
            keys: { ...this.keys },
            mouseX: this.mouseX,
            mouseY: this.mouseY,
            mouseClicked: this.mouseClicked
        });
    }

    update() {
        // Periodically resend input even if keys haven't changed
        this.sendInput();
    }

    destroy() {
        window.removeEventListener('keydown', this._boundKeyDown);
        window.removeEventListener('keyup', this._boundKeyUp);
        if (this.canvas) {
            this.canvas.removeEventListener('mousemove', this._boundMouseMove);
            this.canvas.removeEventListener('mousedown', this._boundMouseDown);
            this.canvas.removeEventListener('mouseup', this._boundMouseUp);
        }
    }
}
