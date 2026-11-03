import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { buildStatic, projectRoot } from '../scripts/build-static.mjs';

function temporary(t) {
    const parent = path.join(projectRoot, 'tmp');
    fs.mkdirSync(parent, { recursive: true });
    const directory = fs.mkdtempSync(path.join(parent, 'static-build-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return path.join(directory, 'dist');
}

test('a production static build contains every browser dependency and excludes server, tests and repository files', t => {
    const output = buildStatic({ outputDir: temporary(t), serverUrl: 'wss://vamp-io.onrender.com' });
    const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
    const context = { window: {} };
    const configuration = html.match(/<script>(window\.VAMPS_SERVER_URL=.*?)<\/script>/s);
    assert.ok(configuration);
    vm.runInNewContext(configuration[1], context);
    assert.equal(context.window.VAMPS_SERVER_URL, 'wss://vamp-io.onrender.com/');
    assert.ok(html.indexOf('window.VAMPS_SERVER_URL') < html.indexOf('type="module"'));
    assert.equal(fs.readFileSync(path.join(output, 'node_modules/three/build/three.min.js'), 'utf8'),
        fs.readFileSync(path.join(projectRoot, 'node_modules/three/build/three.min.js'), 'utf8'));
    for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
        if (!/^[a-z]+:/i.test(match[1])) assert.ok(fs.existsSync(path.join(output, match[1])), match[1]);
    }
    for (const directory of ['js', 'shared']) for (const entry of fs.readdirSync(path.join(output, directory), { recursive: true, withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
        const file = path.join(entry.parentPath, entry.name);
        for (const match of fs.readFileSync(file, 'utf8').matchAll(/(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
            assert.ok(fs.existsSync(path.resolve(path.dirname(file), match[1])), `${file}: ${match[1]}`);
        }
    }
    for (const forbidden of ['server', 'tests', '.git', '.env', 'package.json', 'README.md', 'scripts', 'assets/icons/generate-icons.mjs']) {
        assert.equal(fs.existsSync(path.join(output, forbidden)), false, forbidden);
    }
    assert.ok(fs.existsSync(path.join(output, 'shared/systems/zoneAggro.js')));
    assert.ok(fs.existsSync(path.join(output, 'js/ui/EquipmentDescriptions.js')));
    fs.writeFileSync(path.join(output, 'stale.js'), 'old build');
    buildStatic({ outputDir: output, serverUrl: '' });
    assert.equal(fs.existsSync(path.join(output, 'stale.js')), false, 'rebuilding removes stale publication files');
    assert.equal(fs.readFileSync(path.join(output, 'index.html'), 'utf8').includes('window.VAMPS_SERVER_URL='), false, 'unset configuration preserves same-host behavior');
});

test('backend configuration is safe inside HTML and malformed URLs do not erase an existing build', t => {
    const output = temporary(t);
    const malicious = 'wss://example.test/?value=</script><script>alert("x")</script>&test=$$';
    buildStatic({ outputDir: output, serverUrl: malicious });
    const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
    const script = html.match(/<script>(window\.VAMPS_SERVER_URL=.*?)<\/script>/s)[1];
    assert.equal(script.includes('</script>'), false);
    assert.equal(script.includes('&'), false);
    const context = { window: {} };
    vm.runInNewContext(script, context);
    assert.equal(context.window.VAMPS_SERVER_URL, new URL(malicious).href);
    for (const serverUrl of ['https://example.test', 'javascript:alert(1)', 'not a URL', 'wss://name:secret@example.test', 'wss://example.test/#fragment']) {
        assert.throws(() => buildStatic({ outputDir: output, serverUrl }), /VAMPS_SERVER_URL/);
        assert.equal(fs.readFileSync(path.join(output, 'index.html'), 'utf8'), html);
    }
    assert.throws(() => buildStatic({ outputDir: projectRoot, serverUrl: '' }), /Static output/);
    assert.throws(() => buildStatic({ outputDir: path.join(projectRoot, 'js'), serverUrl: '' }), /Static output/);
});
