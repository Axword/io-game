import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { createStaticServer } from '../scripts/serve.mjs';
import { steer, chooseUpgrade } from './harness.mjs';

const server = await createStaticServer(0);
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync('output/playwright', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const errors = [];
const failedAssets = [];
const priorReport = process.env.QA_BROWSER_MODE === 'multiplayer' && fs.existsSync('output/playwright/report.json') ? JSON.parse(fs.readFileSync('output/playwright/report.json')) : {};
delete priorReport.serverStartupError;
const report = { ...priorReport, inventory: ['solo start', 'class selection', 'keyboard movement', 'chest choice and inventory', 'boss telegraph and combat', 'victory', 'mobile menu and upgrade fit', 'restart cleanup', 'legacy entry redirect', 'two real multiplayer clients'], errors, failedAssets };
try {
  if (process.env.QA_BROWSER_MODE !== 'multiplayer') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).origin === base) failedAssets.push({ url: response.url(), status: response.status() }); });
  await page.goto(base);
  await page.locator('#player-name').fill('QA tester');
  await page.locator('#btn-offline').click();
  await page.locator('.cls-card').first().waitFor();
  await page.screenshot({ path: 'output/playwright/classes-desktop.png' });
  assert.equal(await page.locator('.cls-card').count(), 10);
  await page.locator('[data-class-id="pyromancer"]').click();
  await page.waitForFunction(() => window.gameInstance?.state === 'playing');
  const position = await page.evaluate(() => ({ x: gameInstance.player.x, y: gameInstance.player.y }));
  await page.keyboard.down('d');
  await page.waitForTimeout(800);
  await page.keyboard.up('d');
  const moved = await page.evaluate(() => ({ x: gameInstance.player.x, y: gameInstance.player.y }));
  assert.ok(moved.x - position.x > 40, 'normal keyboard movement changes player position');
  await page.waitForTimeout(1200);
  report.render = await page.evaluate(() => ({ calls: gameInstance.renderer.renderer.info.render.calls, geometries: gameInstance.renderer.renderer.info.memory.geometries, textures: gameInstance.renderer.renderer.info.memory.textures }));
  await page.screenshot({ path: 'output/playwright/combat-desktop.png' });
  // Stage a reachable pickup, then let the production loop and normal click handle it.
  await page.evaluate(() => gameInstance.lootSystem.spawn(gameInstance.player.x, gameInstance.player.y));
  await page.locator('#s-upgrade').waitFor({ state: 'visible' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'output/playwright/chest-desktop.png' });
  await page.locator('.up-card').first().click();
  await page.waitForFunction(() => gameInstance.runStats.chestsOpened === 1 && gameInstance.state === 'playing');
  report.chestItems = await page.evaluate(() => gameInstance.player.items);
  // Native frame timing sample with regular input and rendering.
  report.frames = await page.evaluate(() => new Promise(resolve => {
    const values = []; let previous;
    const frame = time => { if (previous !== undefined) values.push(time - previous); previous = time; if (values.length < 90) requestAnimationFrame(frame); else { values.sort((a,b) => a-b); resolve({ medianMs: values[45], p95Ms: values[85] }); } };
    requestAnimationFrame(frame);
  }));
  await page.goto(`${base}/io-circle-game/index.html`);
  await page.waitForURL(base + '/index.html');
  await context.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto(base);
  await mobile.locator('#player-name').fill('QA mobile');
  await mobile.locator('#btn-offline').click();
  await mobile.screenshot({ path: 'output/playwright/classes-mobile.png', fullPage: true });
  const menuOverflow = await mobile.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  assert.ok(menuOverflow.scroll <= menuOverflow.width, 'mobile class menu has no horizontal page overflow');
  await mobile.locator('[data-class-id="pyromancer"]').click();
  await mobile.waitForFunction(() => gameInstance.state === 'playing');
  await mobile.evaluate(() => gameInstance.lootSystem.spawn(gameInstance.player.x, gameInstance.player.y));
  await mobile.locator('#s-upgrade').waitFor({ state: 'visible' });
  await mobile.waitForTimeout(400);
  await mobile.screenshot({ path: 'output/playwright/chest-mobile.png', fullPage: true });
  await mobile.locator('.up-card').first().click();
  await mobile.waitForFunction(() => gameInstance.runStats.chestsOpened === 1);
  await mobileContext.close();

  // The full browser run uses production Game.update in fixed 1/30s steps.
  // Only input keys and offered upgrade selections are controlled; rendering is
  // sampled separately above so acceleration does not pretend to measure FPS.
  const fullContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await fullContext.addInitScript(() => {
    window.requestAnimationFrame = callback => { (window.__qaFrames ||= []).push(callback); return window.__qaFrames.length; };
    let seed = 47;
    Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  });
  const full = await fullContext.newPage();
  full.on('pageerror', error => errors.push(error.message));
  await full.goto(base);
  await full.locator('#player-name').fill('QA full run');
  await full.locator('#btn-offline').click();
  await full.locator('[data-class-id="pyromancer"]').click();
  await full.waitForFunction(() => gameInstance.state === 'playing');
  await full.evaluate(({ steerSource, upgradeSource }) => {
    window.__qaSteer = new Function(`return (${steerSource})`)();
    window.__qaChoose = new Function(`return (${upgradeSource})`)();
    window.__qaMemory = {};
    window.__qaSteps = 0;
    window.__qaBossShot = false;
    window.__qaWorlds = [0];
    window.__qaPeak = { geometries: 0, textures: 0, calls: 0 };
  }, { steerSource: steer.toString(), upgradeSource: chooseUpgrade.toString() });
  for (let chunk = 0; chunk < 200; chunk++) {
    const state = await full.evaluate(() => {
      const game = gameInstance;
      for (let i = 0; i < 300; i++) {
        if (['dead', 'victory'].includes(game.state)) break;
        if (game.state === 'upgrade') { game.applyUpgrade(__qaChoose(game.upgradeCards || game.upgradeSystem.generateUpgradeCards(game.player), game.player)); continue; }
        if (game.state === 'loot') { game.applyLoot(game.lootCards.find(c => ['heart','armor','ember','hourglass','fang'].includes(c.itemId)) || game.lootCards[0]); continue; }
        const portal = game.getPortalState();
        __qaMemory.portalGoal = game.worldId < 2 && !portal.locked;
        if (__qaMemory.portalGoal && portal.near && game.travelWorld(portal.targetWorldId)) {
          __qaWorlds.push(game.worldId); __qaMemory.last = null; continue;
        }
        if (__qaSteps++ % 3 === 0) __qaSteer(game, __qaMemory);
        game.update(1 / 30);
        if (!__qaBossShot && game.bosses.length && game.bullets.some(b => b.wtype === 'fireball')) break;
      }
      game.hud._lastHudAt = -1000;
      game.hud._lastStatsAt = -1000;
      game.hud.update(game.player, window.arenaApp ? window.arenaApp.game.spawnSystem.zones : game.spawnSystem.zones);
      game.renderer.render();
      const info = game.renderer.renderer.info;
      __qaPeak.geometries = Math.max(__qaPeak.geometries, info.memory.geometries);
      __qaPeak.textures = Math.max(__qaPeak.textures, info.memory.textures);
      __qaPeak.calls = Math.max(__qaPeak.calls, info.render.calls);
      return { state: game.state, time: game.gameTime, worldId: game.worldId, worldTime: game.worldTime, bosses: game.bosses.length, stats: game.runStats, hp: game.player.hp };
    });
    if (state.bosses && !report.bossScreenshot) {
      await full.screenshot({ path: 'output/playwright/boss-combat.png' });
      await full.evaluate(() => { __qaBossShot = true; });
      report.bossScreenshot = true;
    }
    if (state.worldId && !report[`world${state.worldId}Screenshot`]) {
      await full.screenshot({ path: `output/playwright/world-${state.worldId}-combat.png` });
      report[`world${state.worldId}Screenshot`] = true;
    }
    if (state.state === 'victory' || state.state === 'dead' || state.time > 1800) break;
  }
  report.fullRun = await full.evaluate(() => ({ state: gameInstance.state, time: gameInstance.gameTime, worldTime: gameInstance.worldTime, worldId: gameInstance.worldId, visitedWorlds: __qaWorlds, worldBossesDefeated: gameInstance.worldBossesDefeated, stats: gameInstance.runStats, level: gameInstance.player.level, hp: gameInstance.player.hp, peaks: __qaPeak, activeSceneObjects: gameInstance.scene.children.length }));
  assert.equal(report.fullRun.state, 'victory', 'full browser run wins without stat edits');
  assert.equal(report.fullRun.worldId, 2);
  assert.deepEqual(report.fullRun.visitedWorlds, [0, 1, 2]);
  assert.equal(report.fullRun.worldBossesDefeated, 3);
  assert.ok(report.fullRun.worldTime >= 480);
  await full.evaluate(() => { const callback = __qaFrames.shift(); if (callback) callback(performance.now()); });
  await full.locator('#s-death').waitFor({ state: 'visible' });
  assert.match(await full.locator('#s-death .s-title').innerText(), /ZWYCIĘSTWO/);
  await full.screenshot({ path: 'output/playwright/victory-desktop.png' });
  await full.evaluate(async () => {
    await gameInstance.start('pyromancer', 'offline', 'QA restart', { solo: true, bots: false });
    gameInstance.renderer.render();
  });
  report.restart = await full.evaluate(() => ({ stats: gameInstance.runStats, items: gameInstance.player.items, bosses: gameInstance.bosses.length, chests: gameInstance.lootSystem.chests.length, memory: gameInstance.renderer.renderer.info.memory }));
  assert.deepEqual(report.restart.items, {});
  assert.equal(report.restart.bosses, 0);
  await fullContext.close();
  }

  const multiplayerPort = 43187;
  const multiplayerBase = `http://127.0.0.1:${multiplayerPort}`;
  const multiplayerServer = spawn(process.execPath, ['server/server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(multiplayerPort) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const serverLogs = [];
  multiplayerServer.stderr.on('data', data => serverLogs.push(String(data)));
  let startup = '';
  multiplayerServer.stdout.on('data', data => { startup += String(data); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 250; attempt++) {
      try { ready = (await fetch(multiplayerBase + '/health')).ok; } catch (error) { report.serverStartupError = error.cause?.message || error.message; }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, `multiplayer server starts: ${startup} ${serverLogs.join('')} ${report.serverStartupError || ''}`);
    delete report.serverStartupError;
    const onlineContexts = await Promise.all([1,2].map(() => browser.newContext({ viewport: { width: 1280, height: 800 } })));
    const onlinePages = await Promise.all(onlineContexts.map(c => c.newPage()));
    for (const [i, tab] of onlinePages.entries()) {
      tab.on('pageerror', error => errors.push(error.message));
      await tab.goto(multiplayerBase);
      await tab.locator('#player-name').fill(`QA online ${i}`);
      if (i === 0) await tab.locator('#btn-quick-join').click();
      else {
        const room = await onlinePages[0].evaluate(() => gameInstance.serverRoomId);
        await tab.locator('#btn-join-code').click();
        await tab.locator('#room-code-input').fill(room);
        await tab.locator('#btn-code-join').click();
      }
      await tab.locator('[data-class-id="archer"]').click();
      await tab.waitForFunction(() => gameInstance.onlineMode && gameInstance.state === 'playing');
    }
    await onlinePages[0].waitForFunction(() => gameInstance.onlinePlayerMap.size === 1);
    await onlinePages[1].waitForFunction(() => gameInstance.onlinePlayerMap.size === 1);
    const otherX = await onlinePages[1].evaluate(() => [...gameInstance.onlinePlayerMap.values()][0].x);
    await onlinePages[0].keyboard.down('d');
    await onlinePages[0].waitForTimeout(1000);
    await onlinePages[0].keyboard.up('d');
    const changedX = await onlinePages[1].evaluate(() => [...gameInstance.onlinePlayerMap.values()][0].x);
    assert.ok(changedX - otherX > 30, 'second browser sees first player moving');
    const startMemory = await Promise.all(onlinePages.map(tab => tab.evaluate(() => ({ ...gameInstance.renderer.renderer.info.memory }))));
    const startTime = performance.now();
    while (performance.now() - startTime < Number(process.env.QA_BROWSER_ONLINE_SECONDS || 30) * 1000) {
      for (const tab of onlinePages) {
        if (await tab.locator('#s-upgrade').isVisible()) await tab.locator('.up-card').first().click();
        const respawn = tab.getByRole('button', { name: 'WZNÓW GRĘ' });
        if (await respawn.isVisible()) await respawn.click();
      }
      await onlinePages[0].keyboard.down('w');
      await onlinePages[1].keyboard.down('a');
      await onlinePages[0].waitForTimeout(700);
      await onlinePages[0].keyboard.up('w');
      await onlinePages[1].keyboard.up('a');
      await onlinePages[0].keyboard.down('s');
      await onlinePages[1].keyboard.down('d');
      await onlinePages[0].waitForTimeout(700);
      await onlinePages[0].keyboard.up('s');
      await onlinePages[1].keyboard.up('d');
    }
    for (const tab of onlinePages) {
      for (let attempt = 0; attempt < 30; attempt++) {
        if (await tab.locator('#s-upgrade').isVisible()) await tab.locator('.up-card').first().click();
        const respawn = tab.getByRole('button', { name: 'WZNÓW GRĘ' });
        if (await respawn.isVisible()) await respawn.click();
        if (await tab.evaluate(() => gameInstance.state === 'playing')) break;
        await tab.waitForTimeout(100);
      }
      await tab.waitForFunction(() => gameInstance.state === 'playing', null, { timeout: 5000 });
    }
    report.multiplayerBrowsers = await Promise.all(onlinePages.map((tab,i) => tab.evaluate(({ startMemory }) => ({ state: gameInstance.state, time: gameInstance.gameTime, otherPlayers: gameInstance.onlinePlayerMap.size, weapon: gameInstance.player.weapons[0]?.type, renderCalls: gameInstance.renderer.renderer.info.render.calls, memoryStart: startMemory, memoryEnd: { ...gameInstance.renderer.renderer.info.memory } }), { startMemory: startMemory[i] })));
    for (const state of report.multiplayerBrowsers) {
      assert.equal(state.state, 'playing', 'client remains playable after natural deaths and normal respawn');
      assert.equal(state.otherPlayers, 1);
      assert.equal(state.weapon, 'bow', 'omitted equipment keeps the existing weapon visible');
      assert.ok(state.time >= 25, 'both live browser clients receive progress over time');
    }
    await onlinePages[0].screenshot({ path: 'output/playwright/multiplayer-desktop.png' });
    for (const onlineContext of onlineContexts) await onlineContext.close();
    assert.deepEqual(serverLogs, [], 'server has no errors during browser multiplayer test');
  } finally { multiplayerServer.kill(); }
  assert.deepEqual(errors, [], 'browser runtime has no JavaScript exceptions');
  assert.deepEqual(failedAssets, [], 'all local assets load');
} finally {
  fs.writeFileSync('output/playwright/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
}
