import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, webkit } from 'playwright';
import { createStaticServer } from '../scripts/serve.mjs';

fs.mkdirSync('output/playwright', { recursive: true });
const server = await createStaticServer(0);
const url = `http://127.0.0.1:${server.address().port}`;
const previous = process.env.QA_DEVICE && fs.existsSync('output/playwright/mobile-report.json') ? JSON.parse(fs.readFileSync('output/playwright/mobile-report.json')) : {};
const report = { devices: (previous.devices || []).filter(device => device.name !== process.env.QA_DEVICE || device.engine !== 'chromium'), errors: [], missingAssets: [], notes: ['Viewports and touch input are emulated; these are not measurements from physical phones or iPads.', 'Portal unlock state is staged for interaction checks; campaign balance is covered by separate full simulation tests.'] };
const fixtures = [
    { name: 'phone-portrait', width: 390, height: 844 },
    { name: 'phone-landscape', width: 844, height: 390 },
    { name: 'ipad-portrait', width: 768, height: 1024 },
    { name: 'ipad-landscape', width: 1024, height: 768 },
    { name: 'phone-small', width: 320, height: 568 }
];
const visibleRect = async (page, selector) => page.locator(selector).evaluate(element => {
    const r = element.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom, visible: getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none', viewport: { width: innerWidth, height: innerHeight } };
});
const assertFit = (box, label) => {
    assert.ok(box.visible, `${label} is visible`);
    assert.ok(box.x >= -1 && box.y >= -1 && box.right <= box.viewport.width + 1 && box.bottom <= box.viewport.height + 1, `${label} stays in the viewport: ${JSON.stringify(box)}`);
};
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));

let chromiumBrowser;
try {
    chromiumBrowser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
    for (const fixture of fixtures.filter(fixture => !process.env.QA_DEVICE || fixture.name === process.env.QA_DEVICE)) {
        const context = await chromiumBrowser.newContext({ viewport: fixture, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(`${fixture.name}: ${error.message}`));
        page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(url)) report.missingAssets.push(response.url()); });
        await page.goto(url);
        await page.locator('#player-name').fill('Touch QA');
        assertFit(await visibleRect(page, '#btn-offline'), `${fixture.name} solo start`);
        await page.locator('#btn-offline').tap();
        await page.screenshot({ path: `output/playwright/${fixture.name}-classes.png` });
        assert.equal(await page.locator('.cls-card').count(), 10);
        await page.locator('[data-class-id="pyromancer"]').tap();
        await page.waitForFunction(() => gameInstance.state === 'playing' && !document.getElementById('touch-controls').hidden);
        const stick = await visibleRect(page, '#touch-stick');
        const menu = await visibleRect(page, '#touch-menu');
        const hp = await visibleRect(page, '#hp-wrap');
        const items = await visibleRect(page, '#w-slots');
        [stick, menu, hp, items].forEach((box, i) => assertFit(box, `${fixture.name} control ${i}`));
        assert.equal(overlap(stick, hp), 0, 'joystick does not cover health');
        assert.equal(overlap(stick, items), 0, 'joystick does not cover equipment');
        assert.ok(menu.width >= 44 && menu.height >= 44, 'menu has a sufficient touch target');
        const cdp = await context.newCDPSession(page);
        const center = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2, id: 1 };
        const top = { ...center, y: center.y - stick.height * .34 };
        const start = await page.evaluate(() => ({ x: gameInstance.player.x, y: gameInstance.player.y }));
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [top] });
        await page.waitForTimeout(900);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const moved = await page.evaluate(() => ({ x: gameInstance.player.x, y: gameInstance.player.y, movement: arenaApp.inputManager.getMovementVector() }));
        assert.ok(moved.y > start.y + 60, 'native touch joystick moves the player');
        assert.deepEqual(moved.movement, { x: 0, y: 0 }, 'touch release stops movement');
        // Start/movement are exercised at the real edge spawn. Portal UI uses a
        // local position fixture; earned campaign travel is tested separately.
        await page.evaluate(() => { gameInstance.player.x = 0; gameInstance.player.y = -180; gameInstance.player.updatePosition(); });
        const portalStick = await visibleRect(page, '#touch-stick');
        const portalCenter = { x: portalStick.x + portalStick.width / 2, y: portalStick.y + portalStick.height / 2, id: 9 };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [portalCenter] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...portalCenter, y: portalCenter.y - portalStick.height * .34 }] });
        await page.waitForTimeout(900);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(() => !document.getElementById('touch-portal').hidden);
        assert.equal(await page.locator('#touch-portal').isDisabled(), true, 'locked portal is visibly disabled');
        const portal = await visibleRect(page, '#touch-portal');
        assertFit(portal, `${fixture.name} portal`);
        assert.equal(overlap(portal, stick), 0, 'portal and joystick do not overlap');
        assert.ok(portal.width >= 44 && portal.height >= 44);
        await page.screenshot({ path: `output/playwright/${fixture.name}-game.png` });

        // Two native touch points: move with one thumb while opening the menu with the other.
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [top] });
        const pausePoint = { x: menu.x + menu.width / 2, y: menu.y + menu.height / 2, id: 2 };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [top, pausePoint] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [top] });
        await page.locator('#s-room-menu').waitFor({ state: 'visible' });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const pausedAt = await page.evaluate(() => gameInstance.worldTime);
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => gameInstance.worldTime), pausedAt, 'solo menu pauses simulation');
        assert.deepEqual(await page.evaluate(() => arenaApp.inputManager.getMovementVector()), { x: 0, y: 0 }, 'menu clears held movement');
        assertFit(await visibleRect(page, '#btn-resume'), `${fixture.name} resume`);
        await page.locator('#btn-resume').tap();
        await page.waitForFunction(() => !arenaApp.roomMenuScreen.isVisible);

        // Staged level unlock; the portal is activated by a real touch, preserving the equipment.
        await page.evaluate(() => { gameInstance.unlockedWorlds = [0,1,2]; gameInstance.player.level = 60; gameInstance.player.maxLevelReached = 60; });
        await page.waitForFunction(() => !document.getElementById('touch-portal').disabled);
        const weaponBefore = await page.evaluate(() => gameInstance.player.weapons[0].type);
        await page.locator('#touch-portal').tap();
        await page.waitForFunction(() => gameInstance.worldId === 1);
        assert.equal(await page.evaluate(() => gameInstance.player.weapons[0].type), weaponBefore);
        assert.deepEqual(await page.evaluate(() => arenaApp.inputManager.getMovementVector()), { x: 0, y: 0 });

        // Travel through the second real portal and inspect the darkest world
        // with a full inventory, where crowding/contrast problems are clearest.
        await page.evaluate(() => { gameInstance.player.x = 0; gameInstance.player.y = -180; gameInstance.player.updatePosition(); });
        const secondStick = await visibleRect(page, '#touch-stick');
        const secondCenter = { x: secondStick.x + secondStick.width / 2, y: secondStick.y + secondStick.height / 2, id: 4 };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [secondCenter] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...secondCenter, y: secondCenter.y - secondStick.height * .34 }] });
        await page.waitForTimeout(900);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(() => !document.getElementById('touch-portal').hidden && !document.getElementById('touch-portal').disabled);
        await page.locator('#touch-portal').tap();
        await page.waitForFunction(() => gameInstance.worldId === 2);
        await page.evaluate(() => {
            const player = gameInstance.player;
            player.weapons = ['fireball','bow','sword','lightning'].map(type => player.makeWeaponInstance(type));
            player.books = ['vitality','speed','cooldown','magnet','critical'].map(type => player.makeBookInstance(type));
            player.items = Object.fromEntries(['magnet','clover','armor','ember','hourglass','heart','prism','fang'].map(id => [id, 5]));
        });
        await page.waitForTimeout(350);
        const equipment = await visibleRect(page, '#b-slots');
        const fullItems = await visibleRect(page, '#item-slots');
        assertFit(equipment, `${fixture.name} full books`);
        assertFit(fullItems, `${fixture.name} full items`);
        assert.equal(overlap(equipment, fullItems), 0, 'full books and items do not overlap');
        await page.screenshot({ path: `output/playwright/${fixture.name}-world3-full-inventory.png` });

        // A second viewport change with a held finger must release the joystick.
        const currentStick = await visibleRect(page, '#touch-stick');
        const currentCenter = { x: currentStick.x + currentStick.width / 2, y: currentStick.y + currentStick.height / 2, id: 3 };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [currentCenter] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...currentCenter, x: currentCenter.x + currentStick.width * .3 }] });
        await page.setViewportSize({ width: fixture.height, height: fixture.width });
        await page.waitForTimeout(150);
        assert.deepEqual(await page.evaluate(() => arenaApp.inputManager.getMovementVector()), { x: 0, y: 0 }, 'rotation stops held input');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await page.setViewportSize({ width: fixture.width, height: fixture.height });

        await page.evaluate(() => gameInstance.lootSystem.spawn(gameInstance.player.x, gameInstance.player.y));
        await page.locator('#s-upgrade').waitFor({ state: 'visible' });
        await page.waitForTimeout(350);
        assert.equal(await page.locator('#touch-controls').isVisible(), false, 'controls yield to loot cards');
        const cards = await page.locator('.up-card').evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom, visible:true, viewport:{width:innerWidth,height:innerHeight} }; }));
        cards.forEach((box, i) => { assertFit(box, `${fixture.name} loot card ${i}`); assert.ok(box.width >= 44 && box.height >= 44); });
        await page.screenshot({ path: `output/playwright/${fixture.name}-loot.png` });
        await page.locator('.up-card').first().tap();
        await page.waitForFunction(() => gameInstance.state === 'playing');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow, false, 'no horizontal overflow');
        report.devices.push({ ...fixture, engine: 'chromium', nativeTouchMovement: true, menuPause: true, portalTravel: true, worldsReached: [0,1,2], fullInventoryFit: true, rotationRelease: true, lootTouch: true, controlsFit: true });
        await context.close();
    }

    if (process.env.QA_SKIP_WEBKIT !== '1') {
        const safari = await webkit.launch({ headless: true });
        try {
            for (const fixture of [fixtures[0], fixtures[2]]) {
                const context = await safari.newContext({ viewport: fixture, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
                const page = await context.newPage();
                page.on('pageerror', error => report.errors.push(`webkit ${fixture.name}: ${error.message}`));
                await page.goto(url);
                await page.locator('#player-name').fill('Safari QA');
                await page.locator('#btn-offline').tap();
                await page.locator('[data-class-id="pyromancer"]').tap();
                await page.waitForFunction(() => gameInstance.state === 'playing' && !document.getElementById('touch-controls').hidden);
                assertFit(await visibleRect(page, '#touch-stick'), `WebKit ${fixture.name} joystick`);
                await page.locator('#touch-menu').tap();
                await page.locator('#s-room-menu').waitFor({ state: 'visible' });
                await page.locator('#btn-resume').tap();
                await page.evaluate(() => gameInstance.lootSystem.spawn(gameInstance.player.x, gameInstance.player.y));
                await page.locator('#s-upgrade').waitFor({ state: 'visible' });
                await page.locator('.up-card').first().tap();
                await page.waitForFunction(() => gameInstance.state === 'playing');
                await page.screenshot({ path: `output/playwright/webkit-${fixture.name}.png` });
                report.devices.push({ ...fixture, engine: 'webkit', launch: true, menuTouch: true, lootTouch: true, controlsFit: true });
                await context.close();
            }
        } finally { await safari.close(); }
    }
    const desktop = await chromiumBrowser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await desktop.newPage();
    await page.goto(url);
    await page.locator('#player-name').fill('Desktop QA');
    await page.locator('#btn-offline').click();
    await page.locator('[data-class-id="pyromancer"]').click();
    await page.waitForFunction(() => gameInstance.state === 'playing');
    assert.equal(await page.locator('#touch-controls').isVisible(), false, 'desktop does not show touch-only controls');
    await page.keyboard.press('Escape');
    await page.locator('#s-room-menu').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.locator('#s-room-menu').waitFor({ state: 'hidden' });
    await desktop.close();
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.missingAssets, []);
} finally {
    fs.writeFileSync('output/playwright/mobile-report.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await chromiumBrowser?.close();
    server.close();
}
