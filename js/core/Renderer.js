import { VIEW } from '../config/constants.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0xf5f5f5); // Białe tło
        
        this.scene = new THREE.Scene();
        
        let asp = window.innerWidth / window.innerHeight;
        this.camera = new THREE.OrthographicCamera(
            -VIEW * asp, VIEW * asp, VIEW, -VIEW, -100, 100
        );
        this.camera.position.z = 10;
        
        this.setupResize();
    }
    
    setupResize() {
        window.addEventListener('resize', () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            const asp = window.innerWidth / window.innerHeight;
            this.camera.left = -VIEW * asp;
            this.camera.right = VIEW * asp;
            this.camera.updateProjectionMatrix();
        });
    }
    
    render() {
        this.renderer.render(this.scene, this.camera);
    }
    
    getScene() {
        return this.scene;
    }
    
    getCamera() {
        return this.camera;
    }
}