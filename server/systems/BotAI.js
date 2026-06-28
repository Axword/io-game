import { rng, norm } from '../../shared/utils/math.js';
import { ZONES } from '../../shared/config/constants.js';

export const PVP_DMG_MULTIPLIER = 0.35;
export const PLAYER_DMG_TO_BOT = 0.35;

const PVP_AGGRO_RANGE = { defensive: 150, neutral: 320, aggressive: 700 };
const ZONE_LEVEL_STEP = { defensive: 7, neutral: 6, aggressive: 5 };
const UPGRADE_RARITY_VALUE = { common: 1, enhanced: 2, rare: 3, legendary: 4 };

export class BotAI {
    constructor(bot) {
        this.bot = bot;
        this.state = 'explore';
        this.stateTimer = 0;
        this.decisionTimer = 0;
        this.decisionInterval = 0.18;

        this.mobStyle = this._roll(['defensive', 'neutral', 'aggressive']);
        this.pvpStyle = this._roll(['defensive', 'neutral', 'aggressive']);

        this.zoneLevelStep = ZONE_LEVEL_STEP[this.mobStyle];
        this.pvpAggroRange = PVP_AGGRO_RANGE[this.pvpStyle];

        this.destination = null;
        this.destinationTimer = 0;

        this.kiteDir = Math.random() < 0.5 ? 1 : -1;
        this.kiteDirTimer = 0;

        this.fleeTimer = 0;
        this.pvpFleeTimer = 0;
        this.pvpTarget = null;
        this.pvpEngaged = false;
        this.pvpDecisionCD = 0;

        this.lastX = bot.x;
        this.lastY = bot.y;
        this.stuckTimer = 0;

        this.nearMonsters = [];
        this.nearOrbs = [];
        this.nearPlayers = [];
        this.cacheTimer = 0;
        this.CACHE_RATE = 0.12;

        this.combatStyle = this._determineCombatStyle();

        this.totalKills = 0;
        this.totalDeaths = 0;
        this.survivalTime = 0;
        this.pvpKills = 0;
    }

    _roll(opts) { return opts[Math.floor(Math.random() * opts.length)]; }

    decide(monsters, xpOrbs, dt, allPlayers = []) {
        this.survivalTime += dt;
        this.stateTimer += dt;

        this._updateCache(monsters, xpOrbs, allPlayers, dt);

        this.kiteDirTimer += dt;
        if (this.kiteDirTimer > 2.0 + Math.random() * 2) {
            this.kiteDir *= -1;
            this.kiteDirTimer = 0;
        }

        const moved = Math.hypot(this.bot.x - this.lastX, this.bot.y - this.lastY);
        this.stuckTimer = moved < 2 ? this.stuckTimer + dt : 0;
        this.lastX = this.bot.x;
        this.lastY = this.bot.y;

        if (this.stuckTimer > 1.5) {
            this.stuckTimer = 0;
            this.destination = null;
            const a = Math.random() * Math.PI * 2;
            return { move: { x: Math.cos(a), y: Math.sin(a) } };
        }

        if (this.pvpDecisionCD > 0) this.pvpDecisionCD -= dt;
        if (this.pvpFleeTimer > 0) this.pvpFleeTimer -= dt;
        if (this.fleeTimer > 0) this.fleeTimer -= dt;

        this.decisionTimer -= dt;
        if (this.decisionTimer <= 0) {
            this.decisionTimer = this.decisionInterval;
            this._selectState();
        }

        if (this.state !== 'flee' && this.state !== 'pvp_flee' && this.state !== 'retreat') {
            const veryClose = this._countInRange(this.nearMonsters, 65);
            if (veryClose >= 2) {
                const av = this._avoidance(160, 2.5);
                if (Math.hypot(av.x, av.y) > 0.3) {
                    return { move: this._norm(av.x, av.y) };
                }
            }
        }

        return this._executeState(dt);
    }

    _selectState() {
        const hpPct = this.bot.hp / this.bot.maxHp;
        const immediateN = this._countInRange(this.nearMonsters, 110);
        const nearXp = this._xpValue();

        if (this.fleeTimer > 0) return;
        if (this.pvpFleeTimer > 0) { this.state = 'pvp_flee'; return; }

        const pvpT = this._findPvpTarget();
        if (pvpT && this.pvpDecisionCD <= 0) {
            const dec = this._decidePvp(hpPct, immediateN);
            if (dec === 'fight') {
                this.pvpTarget = pvpT;
                this.pvpEngaged = true;
                this.state = 'pvp_fight';
                return;
            } else if (dec === 'flee') {
                this.pvpEngaged = false;
                this.pvpTarget = null;
                this.pvpFleeTimer = 2 + Math.random();
                this.state = 'pvp_flee';
                this.pvpDecisionCD = 3;
                return;
            }
            this.pvpDecisionCD = 4;
        }
        if (this.pvpEngaged) {
            if (!pvpT || pvpT.hp <= 0) { this.pvpEngaged = false; this.pvpTarget = null; }
            else { this.state = 'pvp_fight'; return; }
        }

        const fleeHpLow = this.mobStyle === 'aggressive' ? 0.12 : this.mobStyle === 'neutral' ? 0.17 : 0.22;
        const fleeHpMid = this.mobStyle === 'aggressive' ? 0.25 : this.mobStyle === 'neutral' ? 0.30 : 0.38;
        const fleeMobsMid = this.mobStyle === 'aggressive' ? 5 : this.mobStyle === 'neutral' ? 3 : 2;

        if (hpPct < fleeHpLow && immediateN > 0) {
            this.state = 'flee';
            this.fleeTimer = 1.2 + Math.random() * 0.8;
            return;
        }
        if (hpPct < fleeHpMid && immediateN > fleeMobsMid) {
            this.state = 'flee';
            this.fleeTimer = 0.8 + Math.random() * 0.5;
            return;
        }

        const centerDist = Math.hypot(this.bot.x, this.bot.y);
        const curZone = this._getCurrentZone(centerDist);
        const allowedZone = this._getAllowedZone();
        if (curZone < allowedZone) { this.state = 'retreat'; return; }

        if (hpPct < 0.45 && immediateN === 0) { this.state = 'heal'; return; }
        if (nearXp > 20 && hpPct > 0.5 && immediateN < 3) { this.state = 'collect'; return; }

        const wr = this._getWeaponRange();
        if (this._countInRange(this.nearMonsters, wr + 60) > 0 && hpPct > 0.3) {
            this.state = 'combat';
            return;
        }

        if (nearXp > 5 && hpPct > 0.4) { this.state = 'collect'; return; }
        this.state = 'explore';
    }

    _decidePvp(hpPct, nearN) {
        if (this.pvpStyle === 'defensive') {
            return (hpPct > 0.8 && nearN === 0 && Math.random() < 0.2) ? 'fight' : 'flee';
        }
        if (this.pvpStyle === 'neutral') {
            if (hpPct < 0.4) return 'flee';
            return Math.random() < 0.5 ? 'fight' : 'flee';
        }
        if (hpPct < 0.2) return 'flee';
        return Math.random() < 0.85 ? 'fight' : 'ignore';
    }

    _executeState(dt) {
        switch (this.state) {
            case 'flee': return this._flee();
            case 'retreat': return this._retreat();
            case 'heal': return this._heal();
            case 'combat': return this._combat();
            case 'collect': return this._collect();
            case 'pvp_fight': return this._pvpFight(dt);
            case 'pvp_flee': return this._pvpFlee();
            default: return this._explore(dt);
        }
    }

    _flee() {
        let fx = 0, fy = 0;
        for (const m of this.nearMonsters) {
            if (m.dist > 450) break;
            const w = Math.pow((450 - m.dist) / 450, 1.5);
            fx += (this.bot.x - m.e.x) / (m.dist || 1) * w * m.threat;
            fy += (this.bot.y - m.e.y) / (m.dist || 1) * w * m.threat;
        }
        const cd = Math.hypot(this.bot.x, this.bot.y);
        if (cd > 500) {
            fx -= this.bot.x / cd * 0.3;
            fy -= this.bot.y / cd * 0.3;
        }
        return { move: this._norm(fx, fy) };
    }

    _retreat() {
        const allowedZone = this._getAllowedZone();
        const targetRadius = this._zoneOuter(allowedZone);
        const cd = Math.hypot(this.bot.x, this.bot.y);
        if (cd <= targetRadius + 200) {
            this.state = 'explore';
            return this._explore(0.016);
        }
        let mx = -this.bot.x / cd, my = -this.bot.y / cd;
        const av = this._avoidance(200, 0.5);
        return { move: this._norm(mx + av.x, my + av.y) };
    }

    _heal() {
        if (this.bot.hp / this.bot.maxHp > 0.72) {
            this.state = 'explore';
            return this._explore(0.016);
        }
        let mx = 0, my = 0;
        const cd = Math.hypot(this.bot.x, this.bot.y);
        if (cd > 200) {
            mx = -this.bot.x / cd;
            my = -this.bot.y / cd;
        }
        const av = this._avoidance(280, 0.7);
        const orb = this._bestOrb(200);
        if (orb) {
            mx += (orb.e.x - this.bot.x) / (orb.dist || 1) * 0.25;
            my += (orb.e.y - this.bot.y) / (orb.dist || 1) * 0.25;
        }
        return { move: this._norm(mx + av.x, my + av.y) };
    }

    _combat() {
        const t = this._bestMonsterTarget();
        if (!t) { this.state = 'explore'; return this._explore(0.016); }
        switch (this.combatStyle) {
            case 'aura': return this._aura(t);
            case 'ranged': return this._ranged(t);
            case 'assassin': return this._assassin(t);
            default: return this._melee(t);
        }
    }

    _aura(t) {
        let bx = t.e.x, by = t.e.y, best = 0;
        const ar = this._getWeaponRange();
        for (const m of this.nearMonsters.slice(0, 10)) {
            let d = 0;
            for (const o of this.nearMonsters) {
                if (Math.hypot(o.e.x - m.e.x, o.e.y - m.e.y) < ar) d++;
            }
            if (d > best) { best = d; bx = m.e.x; by = m.e.y; }
        }
        if (this.bot.hp / this.bot.maxHp < 0.45 && this._countInRange(this.nearMonsters, 85) > 3) {
            return this._flee();
        }
        const av = this._avoidance(90, 1.2);
        return { move: this._norm(bx - this.bot.x + av.x, by - this.bot.y + av.y) };
    }

    _ranged(t) {
        const ideal = this._getWeaponRange() * 0.72;
        const { e, dist } = t;
        let mx, my;
        if (dist < ideal - 50) {
            const away = Math.atan2(this.bot.y - e.y, this.bot.x - e.x);
            const perp = away + Math.PI / 2 * this.kiteDir;
            mx = Math.cos(away) * 0.85 + Math.cos(perp) * 0.15;
            my = Math.sin(away) * 0.85 + Math.sin(perp) * 0.15;
        } else if (dist > ideal + 100) {
            mx = e.x - this.bot.x;
            my = e.y - this.bot.y;
        } else {
            const a = Math.atan2(e.y - this.bot.y, e.x - this.bot.x) + Math.PI / 2 * this.kiteDir;
            mx = Math.cos(a);
            my = Math.sin(a);
        }
        const av = this._avoidance(150, 0.4);
        return { move: this._norm(mx + av.x, my + av.y) };
    }

    _melee(t) {
        const { e, dist } = t;
        const wr = this._getWeaponRange();
        if (dist > wr + 15) return { move: this._norm(e.x - this.bot.x, e.y - this.bot.y) };
        const a = Math.atan2(e.y - this.bot.y, e.x - this.bot.x) + Math.PI / 2 * this.kiteDir;
        let mx = Math.cos(a) * 0.6 + (e.x - this.bot.x) / (dist || 1) * 0.4;
        let my = Math.sin(a) * 0.6 + (e.y - this.bot.y) / (dist || 1) * 0.4;
        const av = this._avoidance(100, 0.5);
        return { move: this._norm(mx + av.x, my + av.y) };
    }

    _assassin(t) {
        const { e, dist } = t;
        const ready = this.bot.weapons?.[0]?.timer <= 0;
        const av = this._avoidance(110, 0.4);
        if (ready && dist > 80) return { move: this._norm(e.x - this.bot.x + av.x, e.y - this.bot.y + av.y) };
        if (!ready && dist < 130) return { move: this._norm(this.bot.x - e.x + av.x, this.bot.y - e.y + av.y) };
        const a = Math.atan2(e.y - this.bot.y, e.x - this.bot.x) + Math.PI / 2 * this.kiteDir;
        return { move: this._norm(Math.cos(a) + av.x, Math.sin(a) + av.y) };
    }

    _pvpFight(dt) {
        if (!this.pvpTarget || this.pvpTarget.hp <= 0) {
            this.pvpEngaged = false;
            this.pvpTarget = null;
            this.state = 'explore';
            return this._explore(dt);
        }
        const t = this.pvpTarget;
        const dist = Math.hypot(t.x - this.bot.x, t.y - this.bot.y);
        if (dist > this.pvpAggroRange * 2.5) {
            this.pvpEngaged = false;
            this.pvpTarget = null;
            this.pvpDecisionCD = 5;
            this.state = 'explore';
            return this._explore(dt);
        }
        const wr = this._getWeaponRange();
        if (dist > wr + 40) return { move: this._norm(t.x - this.bot.x, t.y - this.bot.y), pvpTarget: t };
        const a = Math.atan2(t.y - this.bot.y, t.x - this.bot.x) + Math.PI / 2 * this.kiteDir;
        let mx = Math.cos(a) + (t.x - this.bot.x) / (dist || 1) * 0.2;
        let my = Math.sin(a) + (t.y - this.bot.y) / (dist || 1) * 0.2;
        return { move: this._norm(mx, my), pvpTarget: t };
    }

    _pvpFlee() {
        let fx = 0, fy = 0;
        if (this.pvpTarget?.hp > 0) {
            const dx = this.bot.x - this.pvpTarget.x;
            const dy = this.bot.y - this.pvpTarget.y;
            const d = Math.hypot(dx, dy) || 1;
            fx += dx / d * 1.5;
            fy += dy / d * 1.5;
        }
        for (const p of this.nearPlayers) {
            if (p.e === this.pvpTarget || p.dist > 300) break;
            const w = (300 - p.dist) / 300;
            fx += (this.bot.x - p.e.x) / (p.dist || 1) * w;
            fy += (this.bot.y - p.e.y) / (p.dist || 1) * w;
        }
        const av = this._avoidance(200, 0.35);
        if (this.pvpFleeTimer <= 0) { this.pvpTarget = null; this.pvpEngaged = false; }
        return { move: this._norm(fx + av.x, fy + av.y) };
    }

    _collect() {
        const b = this._bestOrb(500);
        if (!b) { this.state = 'explore'; return this._explore(0.016); }
        const av = this._avoidance(150, 0.3);
        return { move: this._norm(b.e.x - this.bot.x + av.x, b.e.y - this.bot.y + av.y) };
    }

    _explore(dt) {
        this.destinationTimer += dt;
        if (!this.destination || this.destinationTimer > 8 || this._reachedDest()) {
            this._pickDest();
            this.destinationTimer = 0;
        }
        let mx = this.destination.x - this.bot.x;
        let my = this.destination.y - this.bot.y;
        const d = Math.hypot(mx, my);
        if (d > 1) { mx /= d; my /= d; }
        const orb = this._bestOrb(200);
        if (orb) {
            mx = mx * 0.6 + (orb.e.x - this.bot.x) / (orb.dist || 1) * 0.4;
            my = my * 0.6 + (orb.e.y - this.bot.y) / (orb.dist || 1) * 0.4;
        }
        const av = this._avoidance(120, 0.25);
        return { move: this._norm(mx + av.x, my + av.y) };
    }

    _findPvpTarget() {
        for (const p of this.nearPlayers) {
            if (p.e === this.bot || p.e.hp <= 0) continue;
            if (p.dist > this.pvpAggroRange) break;
            return p.e;
        }
        return null;
    }

    selectBestUpgrade(cards) {
        if (!cards?.length) return null;
        let best = [], bestScore = -1;
        for (const c of cards) {
            let score = c.type === 'newWeapon' ? 3 : c.type === 'newBook' ? 2.5
                : (UPGRADE_RARITY_VALUE[{ 0: 'common', 1: 'enhanced', 2: 'rare', 3: 'legendary' }[c.rarId]] ?? 1);
            if (score > bestScore) { bestScore = score; best = [c]; }
            else if (score === bestScore) best.push(c);
        }
        return best[Math.floor(Math.random() * best.length)];
    }

    _updateCache(monsters, xpOrbs, allPlayers, dt) {
        this.cacheTimer -= dt;
        if (this.cacheTimer > 0) return;
        this.cacheTimer = this.CACHE_RATE;

        const bx = this.bot.x, by = this.bot.y;

        this.nearMonsters = [];
        for (let i = 0; i < monsters.length; i++) {
            const m = monsters[i];
            if (m.hp <= 0) continue;
            const dist = Math.hypot(m.x - bx, m.y - by);
            if (dist < 750) this.nearMonsters.push({ e: m, dist, threat: this._threat(m, dist) });
        }
        this.nearMonsters.sort((a, b) => a.dist - b.dist);
        if (this.nearMonsters.length > 18) this.nearMonsters.length = 18;

        this.nearOrbs = [];
        for (let i = 0; i < xpOrbs.length; i++) {
            const o = xpOrbs[i];
            if (o.life <= 0) continue;
            const dist = Math.hypot(o.x - bx, o.y - by);
            if (dist < 450) this.nearOrbs.push({ e: o, dist, val: o.val || 1 });
        }
        this.nearOrbs.sort((a, b) => (b.val / (b.dist + 30)) - (a.val / (a.dist + 30)));
        if (this.nearOrbs.length > 10) this.nearOrbs.length = 10;

        this.nearPlayers = [];
        const aggroR = this.pvpAggroRange * 1.5;
        for (let i = 0; i < allPlayers.length; i++) {
            const p = allPlayers[i];
            if (!p || p === this.bot || p.hp <= 0) continue;
            const dist = Math.hypot(p.x - bx, p.y - by);
            if (dist < aggroR) this.nearPlayers.push({ e: p, dist });
        }
        this.nearPlayers.sort((a, b) => a.dist - b.dist);
        if (this.nearPlayers.length > 5) this.nearPlayers.length = 5;
    }

    _threat(m, dist) {
        let t = ((m.hp || 10) / 15) * ((m.dmg || 5) / 8);
        if (dist < 90) t *= 2.8;
        else if (dist < 180) t *= 1.6;
        if (m.isBoss) t *= 4;
        if (m.isElite) t *= 2;
        return t;
    }

    _countInRange(arr, range) {
        let c = 0;
        for (const x of arr) { if (x.dist > range) break; c++; }
        return c;
    }

    _xpValue() {
        let t = 0;
        for (const o of this.nearOrbs) t += o.val * (1 - o.dist / 450);
        return t;
    }

    _bestOrb(maxR) {
        for (const o of this.nearOrbs) { if (o.dist <= maxR) return o; }
        return null;
    }

    _bestMonsterTarget() {
        if (!this.nearMonsters.length) return null;
        const wr = this._getWeaponRange() + 120;
        const inR = this.nearMonsters.filter(m => m.dist < wr);
        if (!inR.length) return this.nearMonsters[0];
        const almostDead = inR.find(m => m.e.hp > 0 && m.e.hp <= (m.e.maxHp || 999) * 0.25);
        if (almostDead) return almostDead;
        const boss = inR.find(m => m.e.isBoss);
        if (boss) return boss;
        let best = inR[0];
        for (const m of inR) {
            if ((m.e.hp / (m.e.maxHp || 1)) < (best.e.hp / (best.e.maxHp || 1))) best = m;
        }
        return best;
    }

    _avoidance(range, strength) {
        let ax = 0, ay = 0;
        for (const m of this.nearMonsters) {
            if (m.dist > range) break;
            const w = Math.pow((range - m.dist) / range, 2);
            const closeMult = m.dist < 80 ? 3.0 : m.dist < 130 ? 1.6 : 1.0;
            ax += (this.bot.x - m.e.x) / (m.dist || 1) * w * closeMult;
            ay += (this.bot.y - m.e.y) / (m.dist || 1) * w * closeMult;
        }
        return { x: ax * strength, y: ay * strength };
    }

    _determineCombatStyle() {
        const w = this.bot.weapons?.[0];
        if (!w) return 'melee';
        const map = {
            aura: 'aura', poison: 'aura',
            bow: 'ranged', crossbow: 'ranged', lightning: 'ranged',
            fireball: 'ranged', laser: 'ranged', meteor: 'ranged', mine: 'ranged',
            sword: 'melee', axe: 'melee',
            knife: 'assassin'
        };
        return map[w.type] || 'melee';
    }

    _getWeaponRange() {
        const w = this.bot.weapons?.[0];
        if (!w) return 150;
        return {
            aura: 150, bow: 420, crossbow: 380, lightning: 380,
            fireball: 320, laser: 400, meteor: 350,
            sword: 130, axe: 140, knife: 110,
            poison: 140, mine: 100
        }[w.type] || 200;
    }

    _pickDest() {
        const zone = this._getAllowedZone();
        const inner = this._zoneInner(zone);
        const outer = this._zoneOuter(zone);
        const angle = Math.random() * Math.PI * 2;
        const dist = inner + Math.random() * (outer - inner);
        this.destination = { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
    }

    _reachedDest() {
        if (!this.destination) return true;
        return Math.hypot(this.destination.x - this.bot.x, this.destination.y - this.bot.y) < 150;
    }

    _norm(x, y) {
        const l = Math.hypot(x, y);
        return l < 0.001 ? { x: 0, y: 0 } : { x: x / l, y: y / l };
    }

    _getAllowedZone() {
        const lvl = this.bot.level || 1;
        const step = this.zoneLevelStep;
        if (lvl >= step * 3) return 4;
        if (lvl >= step * 2) return 3;
        if (lvl >= step * 1) return 2;
        return 1;
    }

    _zoneInner(zone) {
        return { 1: 6000, 2: 4500, 3: 3000, 4: 1500, 5: 0 }[zone] ?? 6000;
    }

    _zoneOuter(zone) {
        return { 1: 10000, 2: 6000, 3: 4500, 4: 3000, 5: 1500 }[zone] ?? 10000;
    }

    _getCurrentZone(centerDist) {
        if (centerDist >= 6000) return 1;
        if (centerDist >= 4500) return 2;
        if (centerDist >= 3000) return 3;
        if (centerDist >= 1500) return 4;
        return 5;
    }

    onDamageTaken(amount, source) {
        const hpPct = this.bot.hp / this.bot.maxHp;
        if (hpPct < 0.25 && this.state !== 'flee') {
            this.state = 'flee';
            this.fleeTimer = 1.8;
        }
    }

    onKill(victim) { this.totalKills++; }
    onDeath() { this.totalDeaths++; this.pvpEngaged = false; this.pvpTarget = null; }
    onXpGained() {}
    getPvpTarget() { return this.pvpTarget; }
    getMobStyleLabel() { return this.mobStyle; }
    getPvpStyleLabel() { return this.pvpStyle; }
}
