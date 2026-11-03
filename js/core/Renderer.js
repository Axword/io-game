import { VIEW } from '../config/constants.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0xc4c6cf);
        this.scene = new THREE.Scene();
        const asp = window.innerWidth / window.innerHeight;
        const view = window.innerHeight <= 500 ? 300 : VIEW;
        this.camera = new THREE.OrthographicCamera(-view * asp, view * asp, view, -view, -100, 100);
        this.camera.position.z = 10;
        this.setupResize();
    }
    setupResize() {
        this.onResize = () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            const asp = window.innerWidth / window.innerHeight;
            const view = window.innerHeight <= 500 ? 300 : VIEW;
            this.camera.left = -view * asp;
            this.camera.right = view * asp;
            this.camera.top = view;
            this.camera.bottom = -view;
            this.camera.updateProjectionMatrix();
        };
        window.addEventListener('resize', this.onResize);
    }
    render() { this.renderer.render(this.scene, this.camera); }
    getScene() { return this.scene; }
    getCamera() { return this.camera; }
    destroy() {
        window.removeEventListener('resize', this.onResize);
        this.renderer.dispose();
    }
}
