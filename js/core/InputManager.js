export class InputManager {
    constructor() {
        this.keys = {};
        this.mouseWX = 0;
        this.mouseWY = 0;
        this.mouseClicked = false;
        this.camera = null;
        this.canvas = null;
        
        this.setupListeners();
    }
    
    setupListeners() {
        window.addEventListener('keydown', e => {
            this.keys[e.code] = true;
        });
        
        window.addEventListener('keyup', e => {
            this.keys[e.code] = false;
        });
        
        window.addEventListener('mousemove', e => {
            if (!this.camera || !this.canvas) return;
            
            const nx = (e.clientX / window.innerWidth) * 2 - 1;
            const ny = -(e.clientY / window.innerHeight) * 2 + 1;
            
            const VIEW = 420;
            const asp = window.innerWidth / window.innerHeight;
            
            this.mouseWX = this.camera.position.x + nx * (VIEW * asp);
            this.mouseWY = this.camera.position.y + ny * VIEW;
        });
        
        window.addEventListener('click', e => {
            this.mouseClicked = true;
        });
    }
    
    setCamera(camera) {
        this.camera = camera;
    }
    
    setCanvas(canvas) {
        this.canvas = canvas;
    }
    
    resetClick() {
        this.mouseClicked = false;
    }
    
    isKeyPressed(code) {
        return !!this.keys[code];
    }
}