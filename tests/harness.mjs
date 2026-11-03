import * as THREE from 'three';

export function seededRandom(seed = 1) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function element() {
  return {
    style: {}, children: [], dataset: {}, clientWidth: 1280, clientHeight: 800,
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild(child) { this.children.push(child); }, remove() {}, addEventListener() {}, removeEventListener() {},
    querySelector() { return element(); }, querySelectorAll() { return []; },
    setAttribute() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 800 }; },
    getContext() { return new Proxy({}, { get(target, key) { return target[key] ?? (() => {}); }, set(target, key, value) { target[key] = value; return true; } }); }
  };
}

export async function makeGame(seed = 1) {
  globalThis.THREE = THREE;
  const elements = new Map();
  globalThis.window = { innerWidth: 1280, innerHeight: 800, addEventListener() {}, removeEventListener() {} };
  globalThis.document = {
    body: element(), createElement: element,
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    querySelectorAll() { return []; },
    querySelector() { return element(); }
  };
  globalThis.localStorage = { getItem() { return null; }, setItem() {} };
  const rafQueue = [];
  let virtualNow = 0;
  Date.now = () => virtualNow;
  globalThis.requestAnimationFrame = callback => { rafQueue.push(callback); return rafQueue.length; };
  Math.random = seededRandom(seed);
  const { Game } = await import('../js/core/Game.js');
  const { InputManager } = await import('../js/core/InputManager.js');
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-720, 720, 450, -450, -100, 100);
  const renderer = { getScene: () => scene, getCamera: () => camera, renderer: { domElement: element(), info: { memory: {} } } };
  const input = new InputManager();
  const hud = new Proxy({}, { get: () => () => {} });
  const game = new Game(renderer, input, hud, { speed: 0, hp: 0, luck: 0 }, null);
  game.advanceVisualClock = dt => {
    virtualNow += dt * 1000;
    for (const callback of rafQueue.splice(0)) callback(virtualNow);
  };
  return game;
}

export function chooseUpgrade(cards, player) {
  function score(card) {
    if (card.type === 'newWeapon') {
      const scores = { bow: 120, fireball: 115, lightning: 108, poison: 85, sword: 90, meteor: 105, knife: 110, axe: 88, aura: 65, laser: 80 };
      return (scores[card.weaponType] || 70) + (player.weapons.filter(Boolean).length === 1 ? 30 : 0);
    }
    if (card.type === 'newBook') return ({ regeneration: 112, damage: 95, cooldown: 98, vitality: 92, revival: 110, speed: 85, magnet: 83, critical: 75, area: 70, luck: 55 })[card.bookType] || 60;
    const damage = ({ damage: 84, attackSpeed: 85, projectileCount: 100, range: 75, projectileSize: 65, bookPower: 65, chain: 95, pierce: 55, projectileSpeed: 45, duration: 55, explosion: 60, critChance: 55, critDamage: 50 })[card.upgradeId] || 40;
    return damage + (card.rarId || 0) * 7;
  }
  return [...cards].sort((a, b) => score(b) - score(a))[0];
}

// The controller only changes the same movement keys consumed by the player.
// It reads nearby threats and pickups; it never changes health, damage, speed,
// positions, enemy health, timers, random offers or inventory.
export function steer(game, memory = {}) {
  const p = game.player;
  const alive = [...game.monsters, ...game.bosses].filter(e => e.hp > 0);
  const nearby = alive.filter(e => Math.hypot(e.x - p.x, e.y - p.y) < 650);
  const hostile = game.bullets.filter(b => (b.owner === 'boss' || b.owner === 'monster') && b.life > 0 && Math.hypot(b.x - p.x, b.y - p.y) < 400);
  const boss = game.bosses.find(e => e.hp > 0);
  const chests = game.chests || game.lootSystem?.chests || [];
  const world = game.worldMap?.world || { bounds: 2800, obstacles: [] };
  const segmentDistance = (point, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, squared = dx * dx + dy * dy;
    const t = squared ? Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / squared)) : 0;
    return Math.hypot(point.x - ax - t * dx, point.y - ay - t * dy);
  };
  let goal = null;
  let bestGoal = Infinity;
  for (const chest of chests) {
    if (chest.opened || chest.life <= 0) continue;
    const d = Math.hypot(chest.x - p.x, chest.y - p.y);
    if (d / 2 < bestGoal) { goal = chest; bestGoal = d / 2; }
  }
  for (const orb of game.xpOrbs) {
    if (orb.life <= 0) continue;
    const d = Math.hypot(orb.x - p.x, orb.y - p.y);
    const value = d / Math.max(1, Math.sqrt(orb.val || 1));
    if (value < bestGoal) { goal = orb; bestGoal = value; }
  }
  if (!goal && nearby.length) goal = nearby[0];
  if (!goal) goal = { x: Math.cos(game.gameTime * 0.025) * 1800, y: Math.sin(game.gameTime * 0.025) * 1800 };
  if (memory.portalGoal) {
    const clear = (ax, ay, bx, by) => world.obstacles.every(obstacle => {
      const minimum = obstacle.r + 30;
      const start = Math.hypot(obstacle.x - ax, obstacle.y - ay);
      return segmentDistance(obstacle, ax, ay, bx, by) >= minimum ||
        (start < minimum && Math.hypot(obstacle.x - bx, obstacle.y - by) > start + 1);
    });
    const buildRoute = () => {
      const spacing = 120;
      const start = { gx: Math.round(p.x / spacing), gy: Math.round(p.y / spacing), x: p.x, y: p.y, g: 0, parent: null };
      const queue = [start], visited = new Map([[`${start.gx},${start.gy}`, start]]);
      while (queue.length) {
        queue.sort((a, b) => (a.g + Math.hypot(a.x, a.y)) - (b.g + Math.hypot(b.x, b.y)));
        const node = queue.shift();
        if (clear(node.x, node.y, 0, 0)) {
          const route = [{ x: 0, y: 0 }];
          for (let current = node; current.parent; current = current.parent) route.unshift({ x: current.x, y: current.y });
          return route;
        }
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const gx = node.gx + dx, gy = node.gy + dy, x = gx * spacing, y = gy * spacing;
          if (Math.abs(x) > world.bounds - 120 || Math.abs(y) > world.bounds - 120 || !clear(node.x, node.y, x, y)) continue;
          const key = `${gx},${gy}`, g = node.g + Math.hypot(x - node.x, y - node.y);
          if (visited.has(key) && visited.get(key).g <= g) continue;
          const next = { gx, gy, x, y, g, parent: node };
          visited.set(key, next); queue.push(next);
        }
      }
      return [{ x: 0, y: 0 }];
    };
    if (!memory.route || memory.routeWorld !== game.worldId) {
      memory.route = buildRoute(); memory.routeWorld = game.worldId;
    }
    while (memory.route.length > 1 && (Math.hypot(memory.route[0].x - p.x, memory.route[0].y - p.y) < 65 || clear(p.x, p.y, memory.route[1].x, memory.route[1].y))) memory.route.shift();
    goal = memory.route[0];
  } else memory.route = null;
  // Navigate around the visible scenery instead of pushing into a circular wall.
  const obstruction = !memory.portalGoal && world.obstacles.find(obstacle =>
    Math.hypot(obstacle.x - p.x, obstacle.y - p.y) < obstacle.r + 170 &&
    Math.hypot(goal.x - p.x, goal.y - p.y) > 80 &&
    segmentDistance(obstacle, p.x, p.y, goal.x, goal.y) < obstacle.r + 35);
  if (obstruction) {
    const angle = Math.atan2(p.y - obstruction.y, p.x - obstruction.x);
    const targetAngle = Math.atan2(goal.y - obstruction.y, goal.x - obstruction.x);
    const difference = Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle));
    const tangent = angle + Math.sign(difference || 1) * .75;
    goal = { x: obstruction.x + Math.cos(tangent) * (obstruction.r + 75), y: obstruction.y + Math.sin(tangent) * (obstruction.r + 75) };
  }
  const meleeOnly = p.weapons.filter(Boolean).every(w => w.type === 'aura' || w.type === 'sword' || w.type === 'poison');
  const speed = p.getFinalMoveSpeed() * 150;
  const headings = [[0, 0], ...Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)])];
  let best = headings[0], bestScore = -Infinity;
  const orbitSign = (memory.sign ??= 1);
  for (const [dx, dy] of headings) {
    const x = p.x + dx * speed * 0.55, y = p.y + dy * speed * 0.55;
    let score = -Math.hypot(goal.x - x, goal.y - y) * (memory.portalGoal ? .65 : .22);
    if (!dx && !dy) score -= 6;
    for (const obstacle of world.obstacles) {
      const d = segmentDistance(obstacle, p.x, p.y, x, y);
      if (d < obstacle.r + 28) score -= 2200;
    }
    for (const enemy of nearby) {
      const safe = enemy.sz * .8 + (enemy.isBoss ? 25 : 21);
      const d = Math.hypot(enemy.x - x, enemy.y - y);
      if (d < safe) score -= 1600 + (safe - d) * 20;
      else if (d < safe + (meleeOnly ? 14 : 65)) score -= (safe + (meleeOnly ? 14 : 65) - d) * (enemy.isBoss ? 2.4 : 1.4);
      const warning = enemy.telegraph || enemy.attackState;
      if (warning && warning.remaining > 0 && Number.isFinite(warning.angle) && !['ringcaster','shockwave','meteor','shield'].includes(warning.type || warning.ability)) {
        const length = warning.distance || 350;
        const d = segmentDistance({ x, y }, enemy.x, enemy.y, enemy.x + Math.cos(warning.angle) * length, enemy.y + Math.sin(warning.angle) * length);
        if (d < (enemy.behavior === 'charger' ? enemy.sz : 18) + 28) score -= 220;
      }
    }
    for (const b of hostile) {
      const d = Math.hypot(b.x + b.vx * 60 * 0.3 - x, b.y + b.vy * 60 * 0.3 - y);
      if (d < 45 + (b.sz || 1) * 5) score -= 650;
    }
    if (boss && !memory.portalGoal) {
      const d = Math.hypot(boss.x - x, boss.y - y);
      const ideal = meleeOnly ? Math.max(85, boss.sz * .8 + 27) : 230;
      score -= Math.abs(d - ideal) * 1.2;
      const bx = p.x - boss.x, by = p.y - boss.y;
      const len = Math.hypot(bx, by) || 1;
      score += (dx * -by / len + dy * bx / len) * orbitSign * 12;
    }
    if (Math.abs(x) > world.bounds - 120 || Math.abs(y) > world.bounds - 120) score -= 1000;
    if (memory.last && dx === memory.last[0] && dy === memory.last[1]) score += 5;
    if (score > bestScore) { bestScore = score; best = [dx, dy]; }
  }
  memory.last = best;
  const [dx, dy] = best;
  game.inputManager.keys = { KeyW: dy > 0.3, KeyS: dy < -0.3, KeyA: dx < -0.3, KeyD: dx > 0.3 };
  return game.inputManager.keys;
}

export async function runSolo({ classId = 'pyromancer', seed = 1, maxTime = 720, dt = 1 / 30 } = {}) {
  const game = await makeGame(seed);
  await game.start(classId, 'offline', `QA-${classId}`, { difficulty: 'medium', solo: true, bots: false, campaign: false });
  const memory = {};
  const peaks = { monsters: 0, bullets: 0, orbs: 0, scene: 0 };
  const frames = [];
  let updates = 0;
  for (let step = 0; step < maxTime / dt + 1000; step++) {
    if (game.state === 'victory' || game.state === 'dead' || game.gameTime >= maxTime) break;
    if (game.state === 'upgrade') {
      const cards = game.upgradeCards || game.upgradeSystem.generateUpgradeCards(game.player);
      game.applyUpgrade(chooseUpgrade(cards, game.player));
      continue;
    }
    if (game.state === 'loot') {
      const cards = game.lootCards;
      if (!cards?.length) throw new Error('Loot state has no choices');
      const chosen = cards.find(c => ['heart', 'armor', 'ember', 'hourglass', 'fang'].includes(c.itemId || c.id)) || cards[0];
      game.applyLoot(chosen);
      continue;
    }
    if (step % 3 === 0) steer(game, memory);
    const before = performance.now();
    game.update(dt);
    game.advanceVisualClock(dt);
    frames.push(performance.now() - before);
    updates++;
    if (!Number.isFinite(game.player.x + game.player.y + game.player.hp)) throw new Error('Non-finite player state');
    for (const [name, value] of Object.entries({ monsters: game.monsters.length, bullets: game.bullets.length, orbs: game.xpOrbs.length, scene: game.scene.children.length })) peaks[name] = Math.max(peaks[name], value);
  }
  frames.sort((a, b) => a - b);
  const result = { classId, seed, state: game.state, time: +game.gameTime.toFixed(2), level: game.player.level, hp: +game.player.hp.toFixed(1), maxHp: +game.player.maxHp.toFixed(1), kills: game.player.killedMonsters, damage: Math.round(game.player.totalDmg), stats: game.runStats, items: game.player.items, bossesRemaining: game.bosses.map(b => ({ id: b.bossData?.id, hp: Math.round(b.hp) })), peaks, updateMs: { median: +frames[Math.floor(frames.length * .5)].toFixed(3), p95: +frames[Math.floor(frames.length * .95)].toFixed(3), max: +frames.at(-1).toFixed(3) }, updates };
  game.cleanup();
  return result;
}

export async function runCampaign({ classId = 'pyromancer', seed = 11, maxTime = 1800, dt = 1 / 30, waitForBosses = false } = {}) {
  const game = await makeGame(seed);
  await game.start(classId, 'offline', `QA-campaign-${classId}`, { difficulty: 'medium', solo: true, bots: false });
  const memory = {};
  const peaks = { monsters: 0, bullets: 0, orbs: 0, scene: 0 };
  const frames = [];
  const archetypes = {};
  const archetypeKills = {};
  const encounters = {};
  const bossFights = [];
  const fightMap = new Map();
  const stages = [{ worldId: game.worldId, enteredAt: 0, level: game.player.level, hp: game.player.hp, kills: 0, minimumHpRatio: 1 }];
  const unlocks = {};
  let updates = 0;
  for (let step = 0; step < maxTime / dt + 4000; step++) {
    if (['victory', 'dead'].includes(game.state) || game.gameTime >= maxTime) break;
    if (game.state === 'upgrade') {
      game.applyUpgrade(chooseUpgrade(game.upgradeCards || game.upgradeSystem.generateUpgradeCards(game.player), game.player));
      continue;
    }
    if (game.state === 'loot') {
      const chosen = game.lootCards.find(card => ['heart', 'armor', 'ember', 'hourglass', 'fang'].includes(card.itemId)) || game.lootCards[0];
      game.applyLoot(chosen);
      continue;
    }
    const portal = game.getPortalState();
    if (!portal.locked && game.worldId < 2 && unlocks[portal.targetWorldId] === undefined) unlocks[portal.targetWorldId] = +game.gameTime.toFixed(2);
    memory.portalGoal = game.worldId < 2 && !portal.locked && (!waitForBosses || (game.worldTime >= 480 && game.worldBossesDefeated >= 3));
    if (memory.portalGoal && portal.near) {
      const previous = game.worldId;
      const defeated = game.worldBossesDefeated;
      if (game.travelWorld(portal.targetWorldId)) {
        stages.at(-1).exitedAt = +game.gameTime.toFixed(2);
        stages.at(-1).exitLevel = game.player.level;
        stages.at(-1).bossesDefeated = defeated;
        stages.push({ worldId: game.worldId, enteredAt: +game.gameTime.toFixed(2), level: game.player.level, hp: +game.player.hp.toFixed(1), kills: game.player.killedMonsters, previous, minimumHpRatio: game.player.hp / game.player.maxHp });
        memory.last = null;
        continue;
      }
    }
    if (step % 3 === 0) steer(game, memory);
    for (const monster of game.monsters) {
      if (monster.archetypeId) (archetypes[game.worldId] ??= {})[monster.archetypeId] = true;
    }
    for (const boss of game.bosses) {
      (encounters[game.worldId] ??= {})[boss.encounterId] = true;
      if (!fightMap.has(boss)) {
        const fight = { worldId: game.worldId, encounterId: boss.encounterId, hp: boss.maxHp, startedAt: game.gameTime, warnings: 0 };
        fightMap.set(boss, fight); bossFights.push(fight);
      }
      fightMap.get(boss).warnings = Math.max(fightMap.get(boss).warnings, boss.abilityIndex || 0);
    }
    const beforeMonsters = [...game.monsters];
    const beforeBosses = [...game.bosses];
    const before = performance.now();
    game.update(dt);
    game.advanceVisualClock(dt);
    frames.push(performance.now() - before);
    updates++;
    stages.at(-1).minimumHpRatio = Math.min(stages.at(-1).minimumHpRatio, +(game.player.hp / game.player.maxHp).toFixed(3));
    for (const monster of beforeMonsters) if (monster.hp <= 0 && !monster.isDespawning && monster.archetypeId) {
      const kills = archetypeKills[monster.worldId] ??= {};
      kills[monster.archetypeId] = (kills[monster.archetypeId] || 0) + 1;
    }
    for (const boss of beforeBosses) if (boss.hp <= 0 && fightMap.has(boss)) {
      const fight = fightMap.get(boss);
      fight.duration = +(game.gameTime - fight.startedAt).toFixed(2);
      fight.warnings = Math.max(fight.warnings, boss.abilityIndex || 0);
      fight.killed = true;
    }
    if (!Number.isFinite(game.player.x + game.player.y + game.player.hp)) throw new Error('Non-finite campaign player state');
    for (const [key, value] of Object.entries({ monsters: game.monsters.length, bullets: game.bullets.length, orbs: game.xpOrbs.length, scene: game.scene.children.length })) peaks[key] = Math.max(peaks[key], value);
  }
  frames.sort((a, b) => a - b);
  stages.at(-1).finishedAt = +game.gameTime.toFixed(2);
  stages.at(-1).exitLevel = game.player.level;
  stages.at(-1).bossesDefeated = game.worldBossesDefeated;
  const result = { classId, seed, state: game.state, time: +game.gameTime.toFixed(2), worldTime: +game.worldTime.toFixed(2), worldId: game.worldId, level: game.player.level,
    hp: +game.player.hp.toFixed(1), maxHp: +game.player.maxHp.toFixed(1), kills: game.player.killedMonsters, stats: { ...game.runStats },
    waitForBosses, unlocks, stages, archetypes, archetypeKills, encounters, bossFights, peaks, position: { x: Math.round(game.player.x), y: Math.round(game.player.y) },
    bossesRemaining: game.bosses.map(boss => ({ id: boss.encounterId, hp: Math.round(boss.hp) })),
    updateMs: { median: +frames[Math.floor(frames.length * .5)].toFixed(3), p95: +frames[Math.floor(frames.length * .95)].toFixed(3), max: +frames.at(-1).toFixed(3) }, updates };
  game.cleanup();
  return result;
}
