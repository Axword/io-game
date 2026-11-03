import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { createStaticServer } from '../scripts/serve.mjs';

const output = 'output/playwright';
fs.mkdirSync(output, { recursive: true });
const server = await createStaticServer(0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const report = { devices: [], errors: [], multiplayer: null, fixture: 'Solo grants XP through a real pickup; multiplayer grants XP through the normal authoritative addXp/handleLevelUp path over child-process IPC. Movement and selections use native browser input.' };
const boxes = page => page.locator('.up-card').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
}));
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
const position = page => page.evaluate(() => ({ x: gameInstance.player.x, y: gameInstance.player.y, time: gameInstance.worldTime }));
const movedDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
let onlineServer;
try {
    for (const fixture of [
        { name: 'desktop', width: 1440, height: 900 },
        { name: 'phone-small', width: 320, height: 568, touch: true },
        { name: 'phone-portrait', width: 390, height: 844, touch: true },
        { name: 'phone-landscape', width: 844, height: 390, touch: true },
        { name: 'ipad-portrait', width: 768, height: 1024, touch: true },
        { name: 'ipad-landscape', width: 1024, height: 768, touch: true }
    ]) {
        const context = await browser.newContext({ viewport: fixture, isMobile: !!fixture.touch, hasTouch: !!fixture.touch, deviceScaleFactor: 1 });
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(`${fixture.name}: ${error.message}`));
        await page.goto(base);
        await page.locator('#player-name').fill('Level QA');
        const lobby = await page.locator('.lobby-actions button').evaluateAll(elements => elements.map(el => {
            const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
        }));
        assert.equal(lobby.length, 2);
        assert.ok(lobby[0].right <= lobby[1].x && Math.abs(lobby[0].y - lobby[1].y) < 1, 'solo left and room right share one row');
        assert.ok(lobby[0].x >= 0 && lobby[1].right <= fixture.width, 'lobby actions fit viewport');
        await page.locator('#btn-offline').click();
        await page.locator('[data-class-id="pyromancer"]').click();
        await page.waitForFunction(() => gameInstance.state === 'playing');
        let cdp, heldPoint;
        const start = await position(page);
        const direction = Math.abs(start.x) >= Math.abs(start.y) ? { x: -Math.sign(start.x), y: 0 } : { x: 0, y: -Math.sign(start.y) };
        const key = direction.x ? direction.x > 0 ? 'd' : 'a' : direction.y > 0 ? 'w' : 's';
        if (fixture.touch) {
            cdp = await context.newCDPSession(page);
            const stick = await page.locator('#touch-stick').boundingBox();
            const center = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2, id: 1 };
            heldPoint = { ...center, x: center.x + direction.x * stick.width * .34, y: center.y - direction.y * stick.height * .34 };
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [heldPoint] });
        } else await page.keyboard.down(key);
        await page.evaluate(async () => {
            const { XpOrb } = await import('/js/entities/XpOrb.js');
            const p = gameInstance.player;
            gameInstance.xpOrbs.push(new XpOrb(p.x, p.y, p.xpNeeded, gameInstance.scene));
        });
        await page.waitForFunction(() => gameInstance.state === 'upgrade');
        await page.locator('#s-upgrade.upgrade-nonmodal').waitFor({ state: 'visible' });
        const before = await position(page);
        await page.waitForTimeout(450);
        const after = await position(page);
        assert.ok(movedDistance(before, after) > 30, `${fixture.name}: held movement continues through level-up`);
        assert.ok(after.time > before.time, 'world simulation continues during level-up');
        assert.equal(await page.locator('#hp-wrap').evaluate(el => getComputedStyle(el).visibility), 'visible');
        const cards = await boxes(page);
        assert.equal(cards.length, 3);
        for (const card of cards) assert.ok(card.x >= -1 && card.y >= -1 && card.right <= fixture.width + 1 && card.bottom <= fixture.height + 1 && card.width >= 44 && card.height >= 44, `card fits: ${JSON.stringify({ fixture, card })}`);
        if (fixture.touch && fixture.height > fixture.width) {
            const playerArea = { x: fixture.width / 2 - 22, right: fixture.width / 2 + 22, y: fixture.height / 2 - 22, bottom: fixture.height / 2 + 22 };
            assert.ok(cards.every(card => overlap(card, playerArea) === 0), `portrait level-up leaves the player visible: ${JSON.stringify({ fixture, cards })}`);
        }
        await page.screenshot({ path: `${output}/${fixture.name}-live-levelup.png` });
        if (fixture.touch) {
            assert.ok(await page.locator('#touch-controls').isVisible(), 'level-up preserves the joystick');
            const rect = await page.locator('#touch-stick').boundingBox();
            const stick = { ...rect, right: rect.x + rect.width, bottom: rect.y + rect.height };
            assert.ok(cards.every(card => overlap(card, stick) === 0), 'cards leave the stick clear');
            const cardPoint = { x: cards[0].x + cards[0].width / 2, y: cards[0].y + cards[0].height / 2, id: 2 };
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [heldPoint, cardPoint] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [cardPoint] });
            await page.waitForFunction(() => gameInstance.state === 'playing');
            assert.ok(await page.evaluate(() => Math.hypot(...Object.values(arenaApp.inputManager.getMovementVector()))) > 0, 'second-thumb selection keeps the first thumb moving');
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
            await page.locator('.up-card').first().click();
            await page.waitForFunction(() => gameInstance.state === 'playing');
            assert.ok(await page.evaluate(() => Math.hypot(...Object.values(arenaApp.inputManager.getMovementVector()))) > 0, 'selecting a card preserves held movement');
            await page.keyboard.up(key);
        }
        await page.waitForTimeout(50);
        assert.deepEqual(await page.evaluate(() => arenaApp.inputManager.getMovementVector()), { x: 0, y: 0 });
        await page.evaluate(() => gameInstance.lootSystem.spawn(gameInstance.player.x, gameInstance.player.y));
        await page.waitForFunction(() => gameInstance.state === 'loot-opening');
        await page.waitForTimeout(280);
        assert.equal(await page.locator('#s-upgrade').isVisible(), false, 'opening animation precedes reward cards');
        const opening = await page.evaluate(() => ({ count: gameInstance.lootSystem.openings.length, lid: gameInstance.lootSystem.openings[0]?.chest.lid.rotation.x, reward: gameInstance.lootSystem.openings[0]?.reward.scale.x }));
        assert.equal(opening.count, 1);
        assert.ok(opening.lid < -.2 && opening.reward > 0, 'lid opens and reward rises before choice');
        await page.screenshot({ path: `${output}/${fixture.name}-chest-opening.png` });
        await page.waitForFunction(() => gameInstance.state === 'loot');
        await page.locator('.up-card').first().click();
        await page.waitForFunction(() => gameInstance.state === 'playing');
        report.devices.push({ name: fixture.name, lobbySides: true, movementDuringLevelUp: true, worldContinues: true, cardsFit: true, secondThumbSelection: !!fixture.touch, chestAnimationBeforeChoice: true });
        await context.close();
    }

    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const childCode = `await import('./server/server.js'); const {gameCache}=await import('./server/gameCache.js'); process.on('message', message=>{if(message.type==='level'){const room=gameCache.getAllRooms().find(room=>room.id===message.room);const p=room?.players.get(message.player);if(p){const levels=p.addXp(p.xpNeeded); room.handleLevelUp(p,levels); process.send({type:'granted'});}}});`;
    onlineServer = spawn(process.execPath, ['--input-type=module', '-e', childCode], { cwd: process.cwd(), windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let logs = '';
    onlineServer.stderr.on('data', data => { logs += data; });
    onlineServer.stdout.on('data', () => {});
    const onlineBase = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 200; i++) {
        try { ready = (await fetch(`${onlineBase}/health`, { signal: AbortSignal.timeout(500) })).ok; } catch {}
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, logs);
    const contexts = await Promise.all([1, 2].map(() => browser.newContext({ viewport: { width: 1280, height: 800 } })));
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    for (const [index, page] of pages.entries()) {
        page.on('pageerror', error => report.errors.push(`online ${index}: ${error.message}`));
        await page.goto(onlineBase);
        await page.locator('#player-name').fill(`Online QA ${index}`);
        if (index === 0) {
            await page.locator('#btn-create-room').click();
            await page.locator('#btn-config-create').click();
        } else {
            const room = await pages[0].evaluate(() => gameInstance.serverRoomId);
            await page.locator('#btn-join-code').click();
            await page.locator('#room-code-input').fill(room);
            await page.locator('#btn-code-join').click();
        }
        await page.locator('[data-class-id="archer"]').click();
        await page.waitForFunction(() => gameInstance.onlineMode && gameInstance.state === 'playing');
    }
    const controller = pages[0], observer = pages[1];
    await observer.waitForFunction(() => gameInstance.onlinePlayerMap.size === 1);
    const identity = await controller.evaluate(() => ({ room: gameInstance.serverRoomId, player: arenaApp.wsClient.playerId }));
    const start = await position(controller);
    const key = Math.abs(start.x) >= Math.abs(start.y) ? start.x > 0 ? 'a' : 'd' : start.y > 0 ? 's' : 'w';
    await controller.keyboard.down(key);
    onlineServer.send({ type: 'level', ...identity });
    await controller.waitForFunction(() => gameInstance.state === 'upgrade');
    const remoteBefore = await observer.evaluate(() => { const p = [...gameInstance.onlinePlayerMap.values()][0]; return { x: p.x, y: p.y }; });
    await controller.waitForTimeout(550);
    const remoteAfter = await observer.evaluate(() => { const p = [...gameInstance.onlinePlayerMap.values()][0]; return { x: p.x, y: p.y }; });
    assert.ok(movedDistance(remoteBefore, remoteAfter) > 30, 'second client observes server-authoritative movement during real level-up');
    await controller.locator('.up-card').first().click();
    await controller.waitForFunction(() => gameInstance.state === 'playing' && gameInstance.pendingUpgrades === 0);
    await controller.keyboard.up(key);
    assert.equal(await controller.locator('#s-upgrade').isVisible(), false);
    report.multiplayer = { authoritativeXpGrant: true, heldMovementDuringLevelUp: true, secondBrowserObservesMovement: true, offeredCardSelection: true };
    for (const context of contexts) await context.close();
    assert.deepEqual(report.errors, []);
} finally {
    onlineServer?.kill();
    fs.writeFileSync(`${output}/levelup-report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    server.close();
}
