import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { chromium, webkit } from 'playwright';
import { createStaticServer } from '../scripts/serve.mjs';

const output = 'output/playwright';
fs.mkdirSync(output, { recursive: true });
const report = { devices: [], multiplayer: null, errors: [], fixture: 'XP is granted through real solo pickups and the authoritative multiplayer addXp/handleLevelUp path. Inventory qualities are staged with the production applyItem function. Native clicks/taps exercise the UI. Enemy probes call the same shared production behavior in each world. These fixtures do not measure balance.' };
const server = await createStaticServer(0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const safari = await webkit.launch({ headless: true });
let child, activePage;

async function fit(page, selector) {
    const box = await page.locator(selector).boundingBox();
    const viewport = page.viewportSize();
    assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
        `${selector} fits ${JSON.stringify({ box, viewport })}`);
}

async function openSolo(page) {
    await page.goto(base);
    await page.locator('#player-name').fill('Progression QA');
    await page.locator('#btn-offline').click();
    await page.locator('[data-class-id="pyromancer"]').click();
    await page.waitForFunction(() => gameInstance.state === 'playing');
}

async function grantSolo(page, count) {
    await page.evaluate(async count => {
        const { XpOrb } = await import('/js/entities/XpOrb.js');
        const { xpNeededForLevel } = await import('/shared/systems/worldRules.js');
        const p = gameInstance.player;
        let amount = -p.xp;
        for (let level = p.level; level < p.level + count; level++) amount += xpNeededForLevel(level);
        gameInstance.xpOrbs.push(new XpOrb(p.x, p.y, amount, gameInstance.scene));
    }, count);
}

async function offerSnapshot(page) {
    return page.evaluate(() => ({
        cards: JSON.stringify(gameInstance.upgradeCards?.map(({ itemRef, ...card }) => card)),
        offerId: gameInstance.upgradeOfferId,
        keys: [...document.querySelectorAll('.up-card')].map(card => card.dataset.upgradeKey)
    }));
}

async function chooseQueuedWeaponUpgrade(page, touch, previousExpected, tapCard) {
    const choice = await page.evaluate(() => {
        const g = gameInstance;
        const index = g.upgradeCards.findIndex(card => card.type === 'weaponUpgrade');
        if (index < 0) throw new Error('Expected an offered weapon upgrade');
        const card = g.upgradeCards[index];
        const stat = g.upgradeSystem.getStatName(card.upgradeId, card.itemTypeId);
        const weapon = g.player.weapons.find(weapon => weapon?.type === card.itemTypeId);
        const before = weapon.upgrades[stat] ?? (card.upgradeType.isAdditive ? 0 : 1);
        const value = card.upgradeType.isAdditive ? before + card.value : before * (1 + card.value / 100);
        return { index, type: card.itemTypeId, stat, value, pending: g.pendingUpgrades, offerId: g.upgradeOfferId };
    });
    const expected = { ...previousExpected, [`${choice.type}:${choice.stat}`]: choice.value };
    report.lastChoice = { ...choice, expected };
    if (tapCard) await tapCard(choice.index);
    else if (touch) await page.locator('.up-card').nth(choice.index).tap();
    else await page.locator('.up-card').nth(choice.index).click();
    await page.waitForFunction(({ expected, remaining }) => {
        const g = gameInstance;
        if (g.pendingUpgrades !== remaining) return false;
        return Object.entries(expected).every(([key, value]) => {
            const [type, stat] = key.split(':');
            const actual = g.player.weapons.find(weapon => weapon?.type === type)?.upgrades[stat];
            return Number.isFinite(actual) && Math.abs(actual - value) < 1e-8;
        });
    }, { expected, remaining: choice.pending - 1 }, { timeout: 5000 });
    if (choice.pending > 1) {
        await page.locator('.up-card').first().waitFor({ state: 'visible' });
        if (choice.offerId != null) await page.waitForFunction(offerId => gameInstance.upgradeOfferId !== offerId, choice.offerId);
    }
    return expected;
}

async function assertAggroWorlds(page) {
    const results = await page.evaluate(async () => {
        const { configureWorldEnemy, updateWorldEnemy } = await import('/shared/systems/enemyBehavior.js');
        const { enemyById } = await import('/shared/config/worlds.js');
        const { resetZoneAggro } = await import('/shared/systems/zoneAggro.js');
        const worlds = [];
        for (const worldId of [0, 1, 2]) {
            const p = { hp: 100, x: 2150, y: 0, worldId };
            const innocent = { hp: 100, x: 2100, y: 0, worldId };
            const enemy = configureWorldEnemy({ x: 1700, y: 0, isElite: false }, enemyById(null, worldId), worldId, 0, { zoneId: 2 });
            for (let i = 0; i < 120; i++) updateWorldEnemy(enemy, 1 / 60, [p, innocent]);
            const untouched = enemy.state === 'wandering' && enemy.currentTarget == null && Math.hypot(enemy.x, enemy.y) < enemy.spawnZoneMax;
            p.x = 1750;
            updateWorldEnemy(enemy, 1 / 60, [p, innocent]);
            p.x = 2300;
            for (let i = 0; i < 480; i++) updateWorldEnemy(enemy, 1 / 60, [p, innocent]);
            const pursued = enemy.state === 'attacking' && enemy.currentTarget === p && Math.hypot(enemy.x, enemy.y) > enemy.spawnZoneMax;
            resetZoneAggro(p);
            updateWorldEnemy(enemy, 1 / 60, [p, innocent]);
            const reset = ['wandering', 'returning'].includes(enemy.state) && enemy.currentTarget == null;
            worlds.push({ worldId, untouched, pursued, reset });
        }
        return worlds;
    });
    for (const world of results) assert.ok(world.untouched && world.pursued && world.reset, JSON.stringify(world));
    return results;
}

async function checkRarities(page, touch, name) {
    const tiers = await page.evaluate(async () => {
        const { ITEM_RARITIES, ITEMS } = await import('/shared/config/items.js');
        const { applyItem } = await import('/shared/systems/items.js');
        const p = gameInstance.player;
        gameInstance.paused = true;
        const ids = ['magnet', 'clover', 'armor', 'ember', 'hourglass'];
        ITEM_RARITIES.forEach((tier, index) => applyItem(p, { type: 'item', itemId: ids[index], itemRarity: tier.key, stacks: 1 }));
        gameInstance.hud._lastHudAt = -1000;
        gameInstance.hud.update(p, gameInstance.spawnSystem.zones);
        return ITEM_RARITIES.map((tier, index) => ({ ...tier, itemId: ids[index], itemName: ITEMS[ids[index]].name }));
    });
    const colors = [];
    for (const tier of tiers) {
        const selector = `[data-equipment-kind="item"][data-equipment-id="${tier.itemId}"]`;
        if (touch) await page.locator(selector).tap(); else await page.locator(selector).hover();
        await page.locator('#equipment-tooltip').waitFor({ state: 'visible' });
        const text = await page.locator('#equipment-tooltip').innerText();
        assert.ok(text.includes(tier.itemName) && text.toLocaleUpperCase('pl').includes(tier.name), `${tier.key}: ${text}`);
        await fit(page, '#equipment-tooltip');
        colors.push(await page.locator(selector).evaluate(el => getComputedStyle(el).borderColor));
        if (tier.key === 'legendary') await page.screenshot({ path: `${output}/progression-${name}-legendary.png` });
    }
    assert.equal(new Set(colors).size, 5, 'each item quality has its own visible color');
    if (touch) await page.touchscreen.tap(page.viewportSize().width * .9, page.viewportSize().height * .55);
    else await page.keyboard.press('Escape');
    await page.evaluate(async () => {
        const { ITEM_RARITIES, ITEMS } = await import('/shared/config/items.js');
        const { applyItem } = await import('/shared/systems/items.js');
        const p = gameInstance.player;
        p.items = {}; p.itemRarities = {};
        for (const itemId of Object.keys(ITEMS)) for (const rarity of ITEM_RARITIES) applyItem(p, { type: 'item', itemId, itemRarity: rarity.key, stacks: 1 });
        gameInstance.hud._lastHudAt = -1000;
        gameInstance.hud.update(p, gameInstance.spawnSystem.zones);
    });
    for (const itemId of ['magnet', 'heart', 'fang']) {
        const selector = `[data-equipment-kind="item"][data-equipment-id="${itemId}"]`;
        if (touch) await page.locator(selector).tap(); else await page.locator(selector).hover();
        await page.locator('#equipment-tooltip').waitFor({ state: 'visible' });
        await fit(page, '#equipment-tooltip');
        assert.equal(await page.locator('#equipment-tooltip').evaluate(el => el.scrollHeight <= el.clientHeight + 1), true, 'five-quality description is not clipped');
        const box = await page.locator('#equipment-tooltip').boundingBox();
        const viewport = page.viewportSize();
        const player = { left: viewport.width / 2 - 22, right: viewport.width / 2 + 22, top: viewport.height / 2 - 22, bottom: viewport.height / 2 + 22 };
        const playerOverlap = Math.max(0, Math.min(box.x + box.width, player.right) - Math.max(box.x, player.left)) *
            Math.max(0, Math.min(box.y + box.height, player.bottom) - Math.max(box.y, player.top));
        assert.equal(playerOverlap, 0, `${name}/${itemId}: mixed-quality panel leaves the player clear`);
        const text = (await page.locator('#equipment-tooltip').innerText()).toLocaleUpperCase('pl');
        for (const tier of tiers) assert.ok(text.includes(tier.name));
    }
    await page.screenshot({ path: `${output}/progression-${name}-full-mixed-inventory.png` });
    return { distinctQualityColors: true, allQualityDescriptions: true, fullMixedInventoryFits: true, playerCenterClear: true, fits: true };
}

const pendingIpc = new Map();
let sequence = 0;
function request(payload) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pendingIpc.delete(id); reject(new Error(`IPC timeout: ${payload.type}`)); }, 10000);
        pendingIpc.set(id, value => { clearTimeout(timer); resolve(value); });
        child.send({ ...payload, requestId: id });
    });
}

try {
    for (const fixture of [
        { name: 'desktop', width: 1440, height: 900 },
        { name: 'phone-small', width: 320, height: 568, touch: true },
        { name: 'phone-landscape', width: 844, height: 390, touch: true },
        { name: 'ipad', width: 768, height: 1024, touch: true },
        { name: 'webkit-phone', width: 390, height: 844, touch: true, engine: 'webkit' }
    ].filter(fixture => !process.env.QA_DEVICE || fixture.name === process.env.QA_DEVICE)) {
        const runtime = fixture.engine === 'webkit' ? safari : browser;
        const context = await runtime.newContext({ viewport: fixture, isMobile: !!fixture.touch, hasTouch: !!fixture.touch, deviceScaleFactor: 1 });
        const page = await context.newPage(); activePage = page;
        await page.addInitScript(() => {
            window.upgradeEventTrace = [];
            for (const type of ['pointerdown', 'pointerup', 'click']) document.addEventListener(type, event => {
                const card = event.target.closest?.('.up-card');
                if (!card) return;
                window.upgradeEventTrace.push({ type, pointerType: event.pointerType, detail: event.detail, touchGenerated: event.sourceCapabilities?.firesTouchEvents,
                    key: card.dataset.upgradeKey, pending: window.gameInstance?.pendingUpgrades });
                if (window.upgradeEventTrace.length > 80) window.upgradeEventTrace.shift();
            }, true);
        });
        page.on('pageerror', error => report.errors.push(`${fixture.name}: ${error.message}`));
        await openSolo(page);
        await grantSolo(page, 3);
        await page.waitForFunction(() => gameInstance.state === 'upgrade' && gameInstance.pendingUpgrades === 3);
        await page.locator('.up-card').first().waitFor({ state: 'visible' });
        const before = await offerSnapshot(page);
        await grantSolo(page, 1);
        await page.waitForFunction(() => gameInstance.pendingUpgrades === 4);
        assert.deepEqual(await offerSnapshot(page), before, 'extra XP keeps the open solo offer');
        let expected = {};
        await page.evaluate(() => { window.oldUpgradeButton = document.querySelector('.up-card'); });
        expected = await chooseQueuedWeaponUpgrade(page, fixture.touch, expected);
        await page.evaluate(() => window.oldUpgradeButton.click());
        assert.equal(await page.evaluate(() => gameInstance.pendingUpgrades), 3, 'a delayed old-card click does not consume the new offer');
        assert.equal(await page.evaluate(() => arenaApp.upgradeScreen.selectionPending), false, 'a delayed old-card click does not lock the new offer');
        for (let i = 0; i < 3; i++) expected = await chooseQueuedWeaponUpgrade(page, fixture.touch, expected);
        await page.waitForFunction(() => gameInstance.state === 'playing');
        assert.equal(await page.locator('#s-upgrade').isVisible(), false);
        let heldStickChoices = false;
        if (fixture.touch && fixture.engine !== 'webkit') {
            await grantSolo(page, 2);
            await page.waitForFunction(() => gameInstance.state === 'upgrade' && gameInstance.pendingUpgrades === 2);
            const cdp = await context.newCDPSession(page);
            const stick = await page.locator('#touch-stick').boundingBox();
            const p = await page.evaluate(() => ({ x: gameInstance.player.x, y: gameInstance.player.y }));
            const direction = Math.abs(p.x) > Math.abs(p.y) ? { x: -Math.sign(p.x), y: 0 } : { x: 0, y: Math.sign(p.y) };
            const center = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2, id: 1 };
            const held = { ...center, x: center.x + direction.x * stick.width * .3, y: center.y + direction.y * stick.height * .3 };
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [center] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [held] });
            const tapCard = async index => {
                const rect = await page.locator('.up-card').nth(index).boundingBox();
                const card = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, id: 2 };
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [held, card] });
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [card] });
            };
            expected = await chooseQueuedWeaponUpgrade(page, true, expected, tapCard);
            expected = await chooseQueuedWeaponUpgrade(page, true, expected, tapCard);
            assert.ok(await page.evaluate(() => Math.hypot(...Object.values(arenaApp.inputManager.getMovementVector()))) > 0, 'second-thumb queued choices preserve held movement');
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            heldStickChoices = true;
        }
        const worlds = fixture.name === 'desktop' ? await assertAggroWorlds(page) : undefined;
        const rarities = await checkRarities(page, fixture.touch, fixture.name);
        report.devices.push({ name: fixture.name, fourQueuedChoices: true, openOfferSurvivesExtraXp: true, earlierModifiersPersist: true, heldStickChoices, worlds, rarities });
        await context.close();
    }

    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const source = `
        await import('./server/server.js');
        const { gameCache } = await import('./server/gameCache.js');
        const { applyItem } = await import('./shared/systems/items.js');
        process.on('message', message => {
            const room = gameCache.getAllRooms().find(room => room.id === message.room);
            const player = room?.players.get(message.player);
            if (!player) return process.send({ requestId: message.requestId, error: 'missing player' });
            if (message.type === 'levels') {
                let levelUps = 0;
                for (let i = 0; i < message.count; i++) levelUps += player.addXp(player.xpNeeded - player.xp);
                room.handleLevelUp(player, levelUps);
            } else if (message.type === 'items') {
                applyItem(player, { type: 'item', itemId: 'armor', itemRarity: 'common', stacks: 1 });
                applyItem(player, { type: 'item', itemId: 'armor', itemRarity: 'legendary', stacks: 1 });
                player.equipmentRevision = (player.equipmentRevision || 0) + 1;
            } else if (message.type === 'chest') {
                room.getWorldState(player.worldId).spawnChest(player.x, player.y, true);
            }
            process.send({ requestId: message.requestId, pending: player.pendingUpgrades, offerId: player.upgradeOfferId, weapons: player.toState().weapons, itemRarities: player.itemRarities, armor: player.armor });
        });`;
    child = spawn(process.execPath, ['--input-type=module', '-e', source], { cwd: process.cwd(), windowsHide: true, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.on('message', response => { const resolve = pendingIpc.get(response.requestId); if (resolve) { pendingIpc.delete(response.requestId); resolve(response); } });
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
    const page = await context.newPage(); activePage = page;
    const collectedRewards = [];
    page.on('websocket', socket => socket.on('framereceived', frame => {
        try {
            const message = JSON.parse(String(frame.payload));
            if (message.type === 'itemCollected') collectedRewards.push(message.data);
        } catch {}
    }));
    page.on('pageerror', error => report.errors.push(`multiplayer: ${error.message}`));
    await page.goto(`http://127.0.0.1:${port}`);
    await page.locator('#player-name').fill('Online progression');
    await page.locator('#btn-create-room').click(); await page.locator('#btn-config-create').click();
    await page.locator('[data-class-id="pyromancer"]').click();
    await page.waitForFunction(() => gameInstance.onlineMode && gameInstance.state === 'playing');
    const identity = await page.evaluate(() => ({ room: gameInstance.serverRoomId, player: arenaApp.wsClient.playerId }));
    await request({ type: 'levels', count: 3, ...identity });
    await page.waitForFunction(() => gameInstance.state === 'upgrade' && gameInstance.pendingUpgrades === 3);
    await page.locator('.up-card').first().waitFor({ state: 'visible' });
    const before = await offerSnapshot(page);
    await request({ type: 'levels', count: 1, ...identity });
    await page.waitForFunction(() => gameInstance.pendingUpgrades === 4);
    assert.deepEqual(await offerSnapshot(page), before, 'extra XP does not replace the online offer or reset its UI');
    let expected = {};
    for (let i = 0; i < 4; i++) expected = await chooseQueuedWeaponUpgrade(page, true, expected);
    await page.waitForFunction(() => gameInstance.state === 'playing' && gameInstance.pendingUpgrades === 0);
    const authoritative = await request({ type: 'inspect', ...identity });
    for (const [key, value] of Object.entries(expected)) {
        const [type, stat] = key.split(':');
        assert.ok(Math.abs(authoritative.weapons.find(weapon => weapon?.type === type).upgrades[stat] - value) < 1e-8);
    }
    const acquired = await request({ type: 'items', ...identity });
    assert.equal(acquired.armor, 21, 'common + legendary armor = original 7 + 14');
    await page.waitForFunction(() => gameInstance.player.items?.armor === 2 && gameInstance.player.itemRarities?.armor?.[4] === 1);
    await page.locator('[data-equipment-kind="item"][data-equipment-id="armor"]').tap();
    await page.locator('#equipment-tooltip').waitFor({ state: 'visible' });
    const itemText = await page.locator('#equipment-tooltip').innerText();
    assert.match(itemText, /21%/);
    assert.match(itemText.toLocaleUpperCase('pl'), /ZWYKŁY/);
    assert.match(itemText.toLocaleUpperCase('pl'), /LEGENDARNY/);
    await fit(page, '#equipment-tooltip');
    await page.screenshot({ path: `${output}/progression-multiplayer-mixed-quality.png` });
    await page.touchscreen.tap(350, 450);
    await request({ type: 'chest', ...identity });
    await page.waitForFunction(() => gameInstance.lootSystem.openings.length > 0);
    await page.locator('#equipment-reward').waitFor({ state: 'visible' });
    assert.equal(collectedRewards.length, 1);
    assert.ok(['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(collectedRewards[0].itemRarity));
    assert.equal(await page.locator('#equipment-reward').getAttribute('data-item-rarity'), collectedRewards[0].itemRarity);
    await fit(page, '#equipment-reward');
    report.multiplayer = { fourQueuedChoices: true, openOfferAndIdSurviveExtraXp: true, authoritativeModifiersPersist: true, mixedQualitySnapshot: true, mixedQualityTooltip: true, chestQualityEventAndReward: true };
    await context.close();
    assert.deepEqual(report.errors, []);
} catch (error) {
    report.error = error.stack;
    if (activePage && !activePage.isClosed()) {
        report.failure = await activePage.evaluate(() => ({ state: gameInstance?.state, pending: gameInstance?.pendingUpgrades, hp: gameInstance?.player?.hp,
            offerId: gameInstance?.upgradeOfferId, cards: gameInstance?.upgradeCards, weapons: gameInstance?.player?.weapons,
            eventTrace: window.upgradeEventTrace,
            tooltip: document.getElementById('equipment-tooltip')?.innerText }));
        await activePage.screenshot({ path: `${output}/progression-fixes-failure.png` });
    }
    throw error;
} finally {
    child?.kill(); await safari.close(); await browser.close(); server.close();
    fs.writeFileSync(`${output}/progression-fixes-report.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
}
