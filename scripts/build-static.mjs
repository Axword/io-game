import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function backendScript(value) {
    if (value === undefined || value === '') return '';
    let url;
    try { url = new URL(value); } catch { throw new Error('VAMPS_SERVER_URL must be an absolute ws:// or wss:// URL'); }
    if (!['ws:', 'wss:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.hash) {
        throw new Error('VAMPS_SERVER_URL must use ws:// or wss:// without credentials or a fragment');
    }
    const literal = JSON.stringify(url.href).replace(/[<>&\u2028\u2029]/g, character =>
        '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
    return `<script>window.VAMPS_SERVER_URL=${literal};</script>\n    `;
}

function prepareDestination(outputDir) {
    const destination = path.resolve(outputDir);
    const relative = path.relative(projectRoot, destination);
    const temporary = relative.startsWith('tmp' + path.sep) && relative !== 'tmp' + path.sep;
    if (destination !== path.join(projectRoot, 'dist') && !temporary) {
        throw new Error('Static output must be dist or a temporary directory inside this project');
    }
    let existing = destination;
    while (!fs.existsSync(existing)) existing = path.dirname(existing);
    const realRoot = fs.realpathSync(projectRoot);
    const resolved = fs.realpathSync(existing);
    if (resolved !== realRoot && !resolved.startsWith(realRoot + path.sep)) throw new Error('Static output resolves outside the project');
    if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) throw new Error('Static output cannot be a symbolic link');
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(destination, { recursive: true });
    return destination;
}

function copyRuntimeTree(source, destination, extensions) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const from = path.join(source, entry.name), to = path.join(destination, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Runtime assets cannot be symbolic links: ${entry.name}`);
        if (entry.isDirectory()) copyRuntimeTree(from, to, extensions);
        else if (extensions.has(path.extname(entry.name).toLowerCase())) fs.copyFileSync(from, to);
    }
}

export function buildStatic({ outputDir = path.join(projectRoot, 'dist'), serverUrl = process.env.VAMPS_SERVER_URL } = {}) {
    // Validate configuration and required inputs before removing a previous build.
    const configuration = backendScript(serverUrl);
    const sourceHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
    const entry = '<script type="module" src="js/main.js"></script>';
    if (!sourceHtml.includes(entry)) throw new Error('Cannot find the game module entry in index.html');
    const threeFile = path.join(projectRoot, 'node_modules/three/build/three.min.js');
    fs.accessSync(threeFile);
    const destination = prepareDestination(outputDir);
    for (const directory of ['js', 'shared']) copyRuntimeTree(path.join(projectRoot, directory), path.join(destination, directory), new Set(['.js', '.json']));
    copyRuntimeTree(path.join(projectRoot, 'css'), path.join(destination, 'css'), new Set(['.css']));
    copyRuntimeTree(path.join(projectRoot, 'assets'), path.join(destination, 'assets'),
        new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.wav', '.ogg', '.glb', '.gltf', '.bin', '.json']));
    const threeDestination = path.join(destination, 'node_modules/three/build/three.min.js');
    fs.mkdirSync(path.dirname(threeDestination), { recursive: true });
    fs.copyFileSync(threeFile, threeDestination);
    fs.writeFileSync(path.join(destination, 'index.html'), sourceHtml.replace(entry, () => configuration + entry));
    return destination;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    buildStatic();
    console.log('Static game built in dist');
}
