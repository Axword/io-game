import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, webkit } from 'playwright';
import { createStaticServer } from '../scripts/serve.mjs';

fs.mkdirSync('output/playwright', { recursive: true });
const server = await createStaticServer(0);
const base = `http://127.0.0.1:${server.address().port}`;
const report = { cases: [], errors: [], missingAssets: [], notes: ['Browser viewports and touch are emulated. Return-to-lobby state is staged to verify menu visibility independently of gameplay state.'] };
const fixtures = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'phone-small', width: 320, height: 568, touch: true },
    { name: 'phone-portrait', width: 390, height: 844, touch: true },
    { name: 'phone-landscape', width: 844, height: 390, touch: true },
    { name: 'ipad-portrait', width: 768, height: 1024, touch: true },
    { name: 'ipad-landscape', width: 1024, height: 768, touch: true }
];
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
let safari;
try {
    safari = await webkit.launch({ headless: true });
    for (const [engine, runtime, list] of [['chromium', browser, fixtures], ['webkit', safari, [fixtures[2], fixtures[4]]]]) {
        for (const fixture of list) {
            const context = await runtime.newContext({ viewport: fixture, isMobile: !!fixture.touch, hasTouch: !!fixture.touch, deviceScaleFactor: 1 });
            const page = await context.newPage();
            page.on('pageerror', error => report.errors.push(`${engine} ${fixture.name}: ${error.message}`));
            page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(base)) report.missingAssets.push(response.url()); });
            await page.goto(base);
            await page.locator('#s-lobby').waitFor({ state: 'visible' });
            assert.equal(await page.title(), 'Vamps.io');
            assert.equal(await page.locator('#s-lobby .s-title').textContent(), 'VAMPS.IO');
            assert.equal(await page.locator('#perm-disp, #perm-disp-lobby').count(), 0, 'permanent summary rows were removed');
            assert.equal(await page.locator('#menu-backdrop').getAttribute('aria-hidden'), 'true');
            await page.waitForFunction(() => arenaApp.menuBackdrop.frames > 1);
            const initial = await page.evaluate(() => ({ frame: arenaApp.menuBackdrop.frames, image: document.getElementById('menu-backdrop').toDataURL(), render: arenaApp.renderer.renderer.info.render.frame }));
            await page.waitForTimeout(200);
            const animated = await page.evaluate(() => ({ frame: arenaApp.menuBackdrop.frames, image: document.getElementById('menu-backdrop').toDataURL(), width: arenaApp.menuBackdrop.canvas.width, render: arenaApp.renderer.renderer.info.render.frame }));
            assert.ok(animated.frame > initial.frame && animated.image !== initial.image, 'menu draws changing gameplay preview');
            assert.equal(animated.render, initial.render, 'menu preview does not also render the WebGL scene');
            assert.ok(animated.width <= 900, 'preview rendering width stays bounded');
            assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('menu-backdrop')).pointerEvents), 'none');
            const buttons = await page.locator('.lobby-actions button').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }));
            assert.ok(buttons[0].right <= buttons[1].x && Math.abs(buttons[0].y - buttons[1].y) < 1 && buttons[0].x >= 0 && buttons[1].right <= fixture.width, 'solo left and room right fit one row');
            if (engine === 'chromium' && ['desktop', 'phone-small', 'phone-portrait'].includes(fixture.name)) await page.screenshot({ path: `output/playwright/vamps-${fixture.name}-menu.png` });
            await page.locator('#player-name').fill('Vamps QA');
            await page.locator('#btn-create-room').click();
            await page.locator('#s-room-config').waitFor({ state: 'visible' });
            assert.equal(await page.locator('#menu-backdrop').isVisible(), true);
            await page.locator('#btn-config-back').click();
            await page.locator('#btn-join-code').click();
            await page.locator('#s-join-code').waitFor({ state: 'visible' });
            assert.equal(await page.locator('#menu-backdrop').isVisible(), true);
            await page.locator('#btn-code-back').click();
            await page.locator('#btn-offline').click();
            await page.locator('#s-menu').waitFor({ state: 'visible' });
            assert.equal(await page.locator('#s-menu .s-title').textContent(), 'VAMPS.IO');
            assert.equal(await page.locator('.cls-card').count(), 10);
            assert.equal(await page.evaluate(() => /Permanentne:/.test(document.body.innerText)), false);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'menus do not create horizontal overflow');
            if (engine === 'chromium' && ['desktop', 'phone-portrait'].includes(fixture.name)) await page.screenshot({ path: `output/playwright/vamps-${fixture.name}-classes.png` });
            await page.locator('[data-class-id="pyromancer"]').click();
            await page.waitForFunction(() => gameInstance.state === 'playing' && arenaApp.menuBackdrop.canvas.hidden);
            const stoppedAt = await page.evaluate(() => ({ frame: arenaApp.menuBackdrop.frames, time: arenaApp.menuBackdrop.time }));
            await page.waitForTimeout(250);
            assert.deepEqual(await page.evaluate(() => ({ frame: arenaApp.menuBackdrop.frames, time: arenaApp.menuBackdrop.time })), stoppedAt, 'preview stops entirely during gameplay');
            await page.evaluate(() => { gameInstance.state = 'death_screen'; arenaApp.onPlayAgain(); });
            await page.waitForFunction(() => !arenaApp.menuBackdrop.canvas.hidden && arenaApp.menuBackdrop.frames > 2);
            const returnedAt = await page.evaluate(() => arenaApp.menuBackdrop.frames);
            await page.waitForTimeout(150);
            assert.ok(await page.evaluate(() => arenaApp.menuBackdrop.frames) > returnedAt, 'returning to lobby resumes preview even if game state remains death_screen');
            report.cases.push({ engine, name: fixture.name, brand: true, noPermanentSummary: true, animatedMenu: true, noSecondWebGLDraw: true, stopsInGame: true, resumesInLobby: true, responsiveActions: true });
            await context.close();
        }
    }

    const reducedContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
    const reduced = await reducedContext.newPage();
    await reduced.goto(base);
    await reduced.waitForFunction(() => arenaApp.menuBackdrop.frames === 1);
    const before = await reduced.evaluate(() => ({ frame: arenaApp.menuBackdrop.frames, time: arenaApp.menuBackdrop.time }));
    await reduced.waitForTimeout(250);
    assert.deepEqual(await reduced.evaluate(() => ({ frame: arenaApp.menuBackdrop.frames, time: arenaApp.menuBackdrop.time })), before, 'reduced motion draws one static preview');
    report.reducedMotion = true;
    await reducedContext.close();
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.missingAssets, []);
} finally {
    fs.writeFileSync('output/playwright/menu-report.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await safari?.close();
    await browser.close();
    server.close();
}
