export function mkShape(type, size, col) {
    let geo;
    
    if (type === 'sq') {
        geo = new THREE.PlaneGeometry(size, size);
    } else if (type === 'cir') {
        geo = new THREE.CircleGeometry(size * 0.6, 24);
    } else if (type === 'tri') {
        const s = new THREE.Shape();
        s.moveTo(0, size * 0.7);
        s.lineTo(-size * 0.65, -size * 0.45);
        s.lineTo(size * 0.65, -size * 0.45);
        s.closePath();
        geo = new THREE.ShapeGeometry(s);
    } else if (type === 'dia') {
        const s = new THREE.Shape();
        s.moveTo(0, size * 0.8);
        s.lineTo(size * 0.55, 0);
        s.lineTo(0, -size * 0.8);
        s.lineTo(-size * 0.55, 0);
        s.closePath();
        geo = new THREE.ShapeGeometry(s);
    } else if (type === 'pent') {
        const s = new THREE.Shape();
        for (let i = 0; i < 5; i++) {
            const a = i * Math.PI * 2 / 5 - Math.PI / 2;
            s[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * size * .65, Math.sin(a) * size * .65);
        }
        s.closePath();
        geo = new THREE.ShapeGeometry(s);
    } else if (type === 'hex') {
        const s = new THREE.Shape();
        for (let i = 0; i < 6; i++) {
            const a = i * Math.PI * 2 / 6;
            s[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * size * .65, Math.sin(a) * size * .65);
        }
        s.closePath();
        geo = new THREE.ShapeGeometry(s);
    } else if (type === 'hept') {
        const s = new THREE.Shape();
        for (let i = 0; i < 7; i++) {
            const a = i * Math.PI * 2 / 7 - Math.PI / 2;
            s[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * size * .65, Math.sin(a) * size * .65);
        }
        s.closePath();
        geo = new THREE.ShapeGeometry(s);
    } else if (type === 'oct') {
        const s = new THREE.Shape();
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI * 2 / 8;
            s[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * size * .65, Math.sin(a) * size * .65);
        }
        s.closePath();
        geo = new THREE.ShapeGeometry(s);
    } else if (type === 'non') {
        const s = new THREE.Shape();
        for (let i = 0; i < 9; i++) {
            const a = i * Math.PI * 2 / 9 - Math.PI / 2;
            s[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * size * .65, Math.sin(a) * size * .65);
        }
        s.closePath();
        geo = new THREE.ShapeGeometry(s);
    } else {
        geo = new THREE.PlaneGeometry(size, size);
    }
    
    const mat = new THREE.MeshBasicMaterial({ color: col });
    return new THREE.Mesh(geo, mat);
}

export function mkRing(r, thick, col, opacity = 0.35) {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, r, 0, Math.PI * 2, false);
    const h = new THREE.Path();
    h.absarc(0, 0, r - thick, 0, Math.PI * 2, true);
    sh.holes.push(h);
    const geo = new THREE.ShapeGeometry(sh);
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity });
    return new THREE.Mesh(geo, mat);
}