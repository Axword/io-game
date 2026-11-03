import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { createStaticServer } from '../scripts/serve.mjs';

const server = await createStaticServer(0);
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync('output/playwright', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const report = { worlds: [], errors: [], missingAssets: [], fixture: 'Map selection, positions and overview camera are staged for visual checks; gameplay balance is tested separately.' };
try {
    for (const mobile of [false, true]) {
        const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(error.message));
        page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(base)) report.missingAssets.push(response.url()); });
        await page.goto(base);
        await page.locator('#player-name').fill('Zone QA');
        await page.locator('#btn-offline').click();
        await page.locator('[data-class-id="archer"]').click();
        await page.waitForFunction(() => gameInstance.state === 'playing');
        for (const worldId of [0, 1, 2]) {
            const result = await page.evaluate(async ({ worldId, mobile }) => {
                const { getWorldZones, getWorldZone } = await import('/shared/systems/worldRules.js');
                const game = gameInstance;
                game.paused = true;
                game.clearWorldActors();
                game.worldId = game.player.worldId = worldId;
                game.spawnBackground();
                const zones = getWorldZones(worldId);
                const boundaryRadius = zones[1].maxR - 1;
                game.player.x = mobile ? boundaryRadius : 0;
                game.player.y = mobile ? 170 : 0;
                // A small angle keeps the screenshot away from obstacle clusters.
                if (mobile) { game.player.x = Math.sqrt(boundaryRadius ** 2 - game.player.y ** 2); }
                game.player.updatePosition(3, 2.9);
                const camera = game.camera;
                const aspect = innerWidth / innerHeight;
                const halfHeight = mobile ? 450 : 2980;
                camera.left = -halfHeight * aspect;
                camera.right = halfHeight * aspect;
                camera.top = halfHeight; camera.bottom = -halfHeight;
                camera.position.set(game.player.x, game.player.y, 10);
                camera.updateProjectionMatrix();
                game.hud._lastHudAt = game.hud._lastMapAt = -1000;
                game.hud.update(game.player, game.spawnSystem.zones);
                game.hud.updateMinimap(game.player, [], [], 0, []);
                game.renderer.render();
                const colors = [];
                if (!mobile) {
                    const renderer = game.renderer.renderer;
                    const gl = renderer.getContext();
                    for (const zone of zones) {
                        const radius = zone.id === 1 ? 2500 : (zone.minR + zone.maxR) / 2;
                        const angle = .17;
                        const point = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, -14.8).project(camera);
                        const pixel = new Uint8Array(4);
                        gl.readPixels(Math.floor((point.x + 1) * .5 * renderer.domElement.width), Math.floor((point.y + 1) * .5 * renderer.domElement.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
                        colors.push(Array.from(pixel).slice(0, 3).join(','));
                    }
                }
                return { worldId, mobile, zone: getWorldZone(game.player.x, game.player.y, worldId).id, borders: game.worldMap.zoneBorders.map(border => border.radius), colors,
                    hud: document.getElementById('world-label').textContent, zoneBadge: document.getElementById('zone-txt').textContent,
                    drawCalls: game.renderer.renderer.info.render.calls };
            }, { worldId, mobile });
            assert.equal(result.borders.length, 2);
            for (const [index, radius] of [2800 * 2 / 3, 2800 / 3].entries()) assert.ok(Math.abs(result.borders[index] - radius) < .0001);
            if (!mobile) assert.equal(new Set(result.colors).size, 3, 'all three zones produce distinct pixels in the rendered map');
            else { assert.equal(result.zone, 2); assert.match(result.hud, /STREFA 2\/3/); }
            await page.screenshot({ path: `output/playwright/zones-world-${worldId}-${mobile ? 'phone-boundary' : 'overview'}.png` });
            report.worlds.push(result);
        }
        await context.close();
    }
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.missingAssets, []);
} finally {
    fs.writeFileSync('output/playwright/zones-report.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close(); server.close();
}
