import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameRoom } from '../server/gameRoom.js';
import { xpNeededForLevel } from '../shared/systems/worldRules.js';
import { getWorld } from '../shared/config/worlds.js';
import { seededRandom } from './harness.mjs';
import { networkLoad } from './multiplayer-load.mjs';

const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))] || 0;
const classIds = ['warrior', 'archer', 'mage', 'berserker', 'pyromancer', 'assassin', 'necromancer', 'druid'];
const requestedClients = Number(process.env.QA_WORLD_CLIENTS || 8);
const clientCount = Number.isInteger(requestedClients) ? Math.max(2, Math.min(12, requestedClients)) : 8;
const classes = Array.from({ length: clientCount }, (_, index) => classIds[index % classIds.length]);
const targetWorlds = clientCount === 8 ? [0, 0, 0, 1, 1, 1, 2, 2] : classes.map((_, index) => index % 3);
const stageLevels = targetWorlds.map(worldId => [18, 40, 70][worldId]);

function prepareLoadBuild(room, player, level, worldId) {
    let xp = 0;
    for (let current = 1; current < level; current++) xp += xpNeededForLevel(current);
    const levels = player.addXp(xp);
    room.handleLevelUp(player, levels);
    while (player.pendingUpgrades > 0) {
        const card = player.upgradeCards.find(card => card.type === 'newWeapon') ||
            player.upgradeCards.find(card => ['damage', 'attackSpeed', 'projectileCount'].includes(card.upgradeId)) || player.upgradeCards[0];
        room.applyUpgradeChoice(player.id, card.upgradeKey);
    }
    player.x = player.y = 0;
    if (worldId !== player.worldId) {
        player.portalReadyAt = 0;
        assert.equal(room.travelWorld(player.id, worldId), true, 'stress setup travels through server authority');
    }
    player.x = 320;
    player.y = -320;
}

function multiWorldSoak() {
    Math.random = seededRandom(827);
    const room = new GameRoom('THREEWORLDLOAD', { bots: false, maxPlayers: clientCount });
    let bytes = 0, snapshots = 0;
    const worlds = [0, 1, 2].map(id => ({ id, peakMonsters: 0, peakBullets: 0, peakOrbs: 0, peakBosses: 0, snapshots: 0 }));
    const players = classes.map((classId, i) => room.addPlayer({
        id: `world-load-${i}`, readyState: 1, bufferedAmount: 0,
        send(raw) {
            const message = JSON.parse(raw);
            if (message.type !== 'gameState') return;
            snapshots++; bytes += Buffer.byteLength(raw);
            const worldId = message.data.worldId;
            worlds[worldId].snapshots++;
            assert.ok(message.data.players.every(player => player.worldId === worldId), 'snapshot cannot mix actors from different worlds');
        }
    }, `LoadWorld${i}`, classId));
    for (let i = 0; i < players.length; i++) prepareLoadBuild(room, players[i], stageLevels[i], targetWorlds[i]);
    room.start();
    const timings = [];
    let respawns = 0;
    const duration = Number(process.env.QA_WORLD_SOAK_SECONDS || 300);
    for (let tick = 0; tick < duration * 20; tick++) {
        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            if (player.hp <= 0) {
                room.respawnPlayer(player.id);
                prepareLoadBuild(room, player, stageLevels[i], targetWorlds[i]);
                respawns++;
            }
            if (player.pendingUpgrades && player.upgradeCards?.length) room.applyUpgradeChoice(player.id, player.upgradeCards[0].upgradeKey);
            const phase = tick / 160 + i * .4;
            room.queueInput(player.id, { keys: {}, moveX: Math.cos(phase), moveY: Math.sin(phase), mouseX: player.x, mouseY: player.y });
        }
        const start = performance.now();
        room.update(.05);
        timings.push(performance.now() - start);
        let totalMonsters = 0;
        for (const world of worlds) {
            const arena = room.getWorldState(world.id);
            totalMonsters += arena.monsters.length;
            world.peakMonsters = Math.max(world.peakMonsters, arena.monsters.length);
            world.peakBullets = Math.max(world.peakBullets, arena.bullets.length);
            world.peakOrbs = Math.max(world.peakOrbs, arena.xpOrbs.length);
            world.peakBosses = Math.max(world.peakBosses, arena.bosses.length);
            assert.ok(arena.monsters.every(monster => monster.worldId === world.id), 'world owns only its enemy roster');
        }
        assert.ok(totalMonsters <= 360, 'aggregate room population stays bounded despite three worlds');
        assert.ok(players.every(player => Number.isFinite(player.hp + player.x + player.y) &&
            Math.abs(player.x) <= getWorld(player.worldId).bounds && Math.abs(player.y) <= getWorld(player.worldId).bounds));
    }
    const result = {
        seconds: duration, clients: players.length, distribution: [0, 1, 2].map(id => targetWorlds.filter(world => world === id).length),
        setup: 'Stress fixture uses authoritative XP API to stage levels 18/40/70 and normal offered upgrades. It measures load, not campaign balance; no HP or damage fields are patched.',
        p50TickMs: percentile(timings, .5), p95TickMs: percentile(timings, .95), p99TickMs: percentile(timings, .99),
        maxTickMs: Math.max(...timings), bytes, snapshots, KiBpsPerClient: bytes / 1024 / players.length / duration, respawns, worlds
    };
    assert.ok(result.p95TickMs < 45, 'three-world simulation fits the 50ms tick budget');
    assert.ok(worlds.every(world => world.snapshots > duration * 10), 'every occupied world keeps sending snapshots');
    return result;
}

process.env.QA_NETWORK_SECONDS ||= '30';
process.env.QA_CLIENTS ||= String(clientCount);
fs.mkdirSync('output/test-results', { recursive: true });
const report = { soak: multiWorldSoak(), network: [] };
const reportPath = `output/test-results/worlds-multiplayer-load${clientCount === 8 ? '' : '-' + clientCount}.json`;
if (process.env.QA_WORLD_SKIP_NETWORK === '1' && fs.existsSync(reportPath)) {
    const previous = JSON.parse(fs.readFileSync(reportPath));
    report.network = previous.network || [];
    report.networkNote = 'The retained 30s real-socket test covers initial room load before the first boss at 90s. The 300s simulation above was rerun after boss-health balancing.';
}
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (process.env.QA_WORLD_SKIP_NETWORK !== '1') report.network = await networkLoad();
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
