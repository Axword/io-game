// Shared unit geometry keeps crowds from allocating one GPU buffer per entity.
const SHAPE_GEOMETRIES = new Map();
function unitShape(type) {
    if (SHAPE_GEOMETRIES.has(type)) return SHAPE_GEOMETRIES.get(type);
    let geometry;
    if (type === 'sq') geometry = new THREE.PlaneGeometry(1, 1);
    else if (type === 'cir') geometry = new THREE.CircleGeometry(0.6, 32);
    else {
        const path = new THREE.Shape();
        const special = { tri: [[0,.7],[-.65,-.45],[.65,-.45]], dia: [[0,.8],[.55,0],[0,-.8],[-.55,0]] };
        const points = special[type];
        if (points) points.forEach(([x,y], i) => path[i ? 'lineTo' : 'moveTo'](x,y));
        else {
            const sides = { pent:5, hex:6, hept:7, oct:8, non:9 }[type] || 5;
            for (let i = 0; i < sides; i++) {
                const angle = i * Math.PI * 2 / sides + Math.PI / 2;
                path[i ? 'lineTo' : 'moveTo'](Math.cos(angle) * .65, Math.sin(angle) * .65);
            }
        }
        path.closePath();
        geometry = new THREE.ShapeGeometry(path);
    }
    geometry.userData.shared = true;
    SHAPE_GEOMETRIES.set(type, geometry);
    return geometry;
}
export function mkShape(type, size, col) {
    const mesh = new THREE.Mesh(unitShape(type), new THREE.MeshBasicMaterial({ color: col }));
    mesh.scale.set(size, size, 1);
    mesh.userData.baseScale = size;
    return mesh;
}
export function mkRing(r, thick, col, opacity = 0.35) {
    return new THREE.Mesh(new THREE.RingGeometry(Math.max(0, r - thick), r, 40),
        new THREE.MeshBasicMaterial({color:col, transparent:opacity < 1, opacity, depthWrite:opacity >= 1}));
}
export function disposeObject(object) {
    if (!object || object.userData?.disposed) return;
    object.userData ||= {};
    object.userData.disposed = true;
    object.parent?.remove(object);
    object.traverse?.(node => {
        if (node.geometry && !node.geometry.userData?.shared) node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
            if (!material || material.userData?.shared) continue;
            // Text sprites own their canvas texture; shared asset textures opt out.
            if (material.map && !material.map.userData?.shared) material.map.dispose();
            material.dispose();
        }
    });
}
