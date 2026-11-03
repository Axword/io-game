import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium, webkit } from 'playwright';
import { createStaticServer } from '../scripts/serve.mjs';

fs.mkdirSync('output/playwright', { recursive: true });
const server = await createStaticServer(0);
const base = `http://127.0.0.1:${server.address().port}`;
const report = { cases: [], multiplayer: null, errors: [], fixture: 'Inventory and an authoritative chest spawn are staged for interaction checks; movement, hover, focus, taps and loot selection use normal browser controls. This does not measure game balance.' };
const fixtures = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'phone-small', width: 320, height: 568, touch: true },
    { name: 'phone-portrait', width: 390, height: 844, touch: true },
    { name: 'phone-landscape', width: 844, height: 390, touch: true },
    { name: 'ipad-portrait', width: 768, height: 1024, touch: true },
    { name: 'ipad-landscape', width: 1024, height: 768, touch: true }
];
async function fit(page, selector) {
    const box = await page.locator(selector).boundingBox();
    const viewport = page.viewportSize();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
        `${selector} fits ${JSON.stringify({ box, viewport })}`);
    return box;
}
async function inspect(page, selector, touch) {
    if (touch) await page.locator(selector).tap(); else await page.locator(selector).hover();
    await page.locator('#equipment-tooltip').waitFor({ state: 'visible' });
    await fit(page, '#equipment-tooltip');
}
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
let safari, child, activePage;
try {
    safari = await webkit.launch({ headless: true });
    for (const [engine, runtime, devices] of [['chromium', browser, fixtures], ['webkit', safari, [fixtures[2], fixtures[4]]]]) {
        for (const fixture of devices.filter(device => !process.env.QA_DEVICE || device.name === process.env.QA_DEVICE)) {
            const context = await runtime.newContext({ viewport: fixture, isMobile: !!fixture.touch, hasTouch: !!fixture.touch, deviceScaleFactor: 1 });
            const page = await context.newPage();
            activePage = page;
            page.on('pageerror', error => report.errors.push(`${engine}/${fixture.name}: ${error.message}`));
            await page.goto(base);
            await page.locator('#player-name').fill('Equipment QA');
            await page.locator('#btn-offline').click();
            await page.locator('[data-class-id="pyromancer"]').click();
            await page.waitForFunction(() => gameInstance.state === 'playing');
            await page.evaluate(async () => {
                const { applyBookStatsDelta } = await import('/shared/systems/bookStats.js');
                const { applyItem } = await import('/shared/systems/items.js');
                const p = gameInstance.player;
                gameInstance.paused = true;
                p.weapons = ['laser', 'aura', 'bow', 'fireball'].map(type => p.makeWeaponInstance(type));
                p.books = ['vitality', 'speed', 'regeneration', 'revival', 'cooldown'].map(type => p.makeBookInstance(type));
                for (const book of p.books) applyBookStatsDelta(p, book);
                for (const itemId of ['magnet', 'clover', 'armor', 'ember', 'hourglass', 'heart', 'prism', 'fang']) applyItem(p, { itemId, stacks: 2 });
                gameInstance.hud._lastHudAt = -1000;
                gameInstance.hud.update(p, gameInstance.spawnSystem.zones);
            });
            await inspect(page, '#ws0', fixture.touch);
            assert.match(await page.locator('#equipment-tooltip').innerText(), /Laser/);
            assert.match(await page.locator('#equipment-tooltip').innerText(), /wiąz|wiązk/);
            const before = await page.locator('#equipment-tooltip').innerText();
            await page.evaluate(() => { gameInstance.player.weapons[0].upgrades.dmg = 1.5; });
            await page.waitForFunction(previous => document.getElementById('equipment-tooltip').innerText !== previous, before);
            if (engine === 'chromium' && ['desktop', 'phone-small', 'phone-landscape'].includes(fixture.name)) await page.screenshot({ path: `output/playwright/equipment-${fixture.name}-weapon.png` });
            if (fixture.touch) {
                await page.locator('#ws0').tap();
                await page.locator('#equipment-tooltip').waitFor({ state: 'hidden' });
            } else {
                await page.keyboard.press('Escape');
                assert.equal(await page.locator('#equipment-tooltip').isVisible(), false);
                assert.equal(await page.locator('#s-room-menu').isVisible(), false, 'first Escape only dismisses the tooltip');
                await page.keyboard.press('Escape');
                await page.locator('#s-room-menu').waitFor({ state: 'visible' });
                await page.keyboard.press('Escape');
                await page.locator('#s-room-menu').waitFor({ state: 'hidden' });
                await page.locator('#bs0').focus();
                await page.keyboard.press('Enter');
                await page.locator('#equipment-tooltip').waitFor({ state: 'visible' });
                await page.keyboard.press('Escape');
            }
            await inspect(page, '#bs0', fixture.touch);
            assert.match(await page.locator('#equipment-tooltip').innerText(), /Żywotności/);
            assert.match(await page.locator('#equipment-tooltip').innerText(), /HP/);
            await inspect(page, '[data-equipment-kind="item"][data-equipment-id="magnet"]', fixture.touch);
            assert.match(await page.locator('#equipment-tooltip').innerText(), /Magnes/);
            assert.match(await page.locator('#equipment-tooltip').innerText(), /Łączna premia|2\/5/);
            if (fixture.touch) {
                const stick = await page.locator('#touch-stick').boundingBox();
                const tooltip = await page.locator('#equipment-tooltip').boundingBox();
                const area = Math.max(0, Math.min(stick.x + stick.width, tooltip.x + tooltip.width) - Math.max(stick.x, tooltip.x)) *
                    Math.max(0, Math.min(stick.y + stick.height, tooltip.y + tooltip.height) - Math.max(stick.y, tooltip.y));
                assert.equal(area, 0, 'item description leaves joystick accessible');
            }
            if (fixture.touch) await page.touchscreen.tap(fixture.width * .9, fixture.height * .55);
            else await page.locator('#gc').click({ position: { x: fixture.width * .9, y: fixture.height * .55 } });
            await page.locator('#equipment-tooltip').waitFor({ state: 'hidden' });
            await page.evaluate(() => { gameInstance.paused = false; gameInstance.lootSystem.spawn(gameInstance.player.x, gameInstance.player.y); });
            await page.waitForFunction(() => gameInstance.state === 'loot-opening');
            assert.equal(await page.locator('#equipment-reward').isVisible(), false, 'description does not obscure the opening');
            await page.waitForFunction(() => gameInstance.state === 'loot');
            const selectedName = await page.locator('.up-card .up-name').first().innerText();
            if (fixture.touch) await page.locator('.up-card').first().tap();
            else await page.locator('.up-card').first().click();
            await page.locator('#equipment-reward').waitFor({ state: 'visible' });
            assert.ok((await page.locator('#equipment-reward').innerText()).includes(selectedName));
            assert.match(await page.locator('#equipment-reward').innerText(), /premia|leczenie|życi/i);
            await fit(page, '#equipment-reward');
            if (fixture.touch) {
                await page.setViewportSize({ width: fixture.height, height: fixture.width });
                await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                await page.locator('#equipment-reward').waitFor({ state: 'visible' });
                await fit(page, '#equipment-reward');
                await page.setViewportSize({ width: fixture.width, height: fixture.height });
                await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                await page.locator('#equipment-reward').waitFor({ state: 'visible' });
                await fit(page, '#equipment-reward');
            }
            if (engine === 'chromium' && ['desktop', 'phone-small', 'phone-portrait'].includes(fixture.name)) await page.screenshot({ path: `output/playwright/equipment-${fixture.name}-reward.png` });
            await page.keyboard.press('Escape');
            await page.locator('#s-room-menu').waitFor({ state: 'visible' });
            assert.equal(await page.locator('#equipment-reward').isVisible(), false, 'reward yields to a modal menu');
            await page.keyboard.press('Escape');
            await page.locator('#s-room-menu').waitFor({ state: 'hidden' });
            await page.locator('#equipment-reward').waitFor({ state: 'visible' });
            await page.evaluate(() => gameInstance.clearWorldActors());
            assert.equal(await page.locator('#equipment-reward').isVisible(), false, 'travel cleanup clears the notice');
            assert.equal(await page.locator('#equipment-tooltip').count(), 1);
            assert.equal(await page.locator('#equipment-reward').count(), 1);
            report.cases.push({ engine, name: fixture.name, weaponHoverOrTap: true, bookDescription: true, cumulativeItemDescription: true,
                liveUpgradeValues: true, rewardAfterChoice: true, rewardRotationFit: !!fixture.touch, modalPriority: true, cleanup: true, fits: true });
            await context.close();
        }
    }

    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const source = `await import('./server/server.js'); const {gameCache}=await import('./server/gameCache.js'); process.on('message',message=>{ if(message.type==='chest'){const room=gameCache.getAllRooms().find(room=>room.id===message.room);const p=room?.players.get(message.player);if(p)room.getWorldState(p.worldId).spawnChest(p.x,p.y,true);}});`;
    child = spawn(process.execPath, ['--input-type=module', '-e', source], { cwd: process.cwd(), windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let logs = '';
    child.stderr.on('data', data => { logs += data; }); child.stdout.on('data', () => {});
    let ready = false;
    for (let i = 0; i < 250; i++) {
        try { ready = (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) })).ok; } catch {}
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(`multiplayer: ${error.message}`));
    await page.goto(`http://127.0.0.1:${port}`);
    await page.locator('#player-name').fill('Online equipment');
    await page.locator('#btn-create-room').click(); await page.locator('#btn-config-create').click();
    await page.locator('[data-class-id="archer"]').click();
    await page.waitForFunction(() => gameInstance.onlineMode && gameInstance.state === 'playing');
    const identity = await page.evaluate(() => ({ room: gameInstance.serverRoomId, player: arenaApp.wsClient.playerId }));
    child.send({ type: 'chest', ...identity });
    await page.waitForFunction(() => gameInstance.lootSystem.openings.length > 0);
    assert.equal(await page.locator('#equipment-reward').isVisible(), false);
    await page.locator('#equipment-reward').waitFor({ state: 'visible' });
    assert.match(await page.locator('#equipment-reward').innerText(), /Zdobyta premia/);
    await fit(page, '#equipment-reward');
    await page.locator('[data-equipment-kind="item"]').first().tap();
    await page.locator('#equipment-tooltip').waitFor({ state: 'visible' });
    assert.match(await page.locator('#equipment-tooltip').innerText(), /Łączna premia/);
    await fit(page, '#equipment-tooltip');
    report.multiplayer = { authoritativeChest: true, animationBeforeDescription: true, rewardDescription: true, itemTap: true };
    await context.close();
    assert.deepEqual(report.errors, []);
} catch (error) {
    if (activePage && !activePage.isClosed()) {
        report.failure = await activePage.evaluate(() => ({ state: gameInstance?.state, hp: gameInstance?.player?.hp,
            anchor: arenaApp.hud.equipmentInfo.anchor?.outerHTML, rewardRemaining: arenaApp.hud.equipmentInfo.rewardRemaining,
            reward: document.getElementById('equipment-reward')?.outerHTML, screens: [...document.querySelectorAll('.screen')].map(e => ({ id: e.id, display: e.style.display })) }));
        await activePage.screenshot({ path: 'output/playwright/equipment-failure.png' });
    }
    throw error;
} finally {
    child?.kill();
    await safari?.close(); await browser.close(); server.close();
    fs.writeFileSync('output/playwright/equipment-report.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
}
