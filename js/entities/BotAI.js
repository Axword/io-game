
import { rng, norm } from '../utils/math.js';

/**
 * System AI dla botów w vampire-survivor IO
 * 
 * Kluczowe zasady przetrwania:
 * 1. Nie wchodź w strefę za trudną na twój poziom
 * 2. Uciekaj ZANIM HP spadnie za nisko
 * 3. Zbieraj XP agresywnie - poziom = siła
 * 4. Walcz tylko gdy to opłacalne
 * 5. Zawsze się ruszaj - stanie = śmierć
 */
export class BotAI {
    constructor(bot) {
        this.bot = bot;

        // ─── Stan ────────────────────────────────────────────
        this.state = 'explore';
        this.stateTimer = 0;
        this.decisionTimer = 0;
        this.decisionInterval = 0.15; // Co ile sekund podejmujemy decyzję

        // ─── Osobowość (różnicuje boty) ──────────────────────
        this.personality = {
            aggression:     rng(0.3, 1.0),
            caution:        rng(0.3, 1.0),
            greed:          rng(0.4, 0.9),
            exploration:    rng(0.3, 0.7),
        };

        // ─── Styl walki (zależy od broni) ────────────────────
        this.combatStyle = this.determineCombatStyle();

        // ─── Cel ruchu ───────────────────────────────────────
        this.destination = null;
        this.destinationTimer = 0;

        // ─── Kiting ──────────────────────────────────────────
        this.kiteDir = Math.random() < 0.5 ? 1 : -1;
        this.kiteDirTimer = 0;

        // ─── Ucieczka ────────────────────────────────────────
        this.fleeTimer = 0;
        this.minFleeDuration = 1.5;

        // ─── Stuck detection ─────────────────────────────────
        this.lastX = bot.x;
        this.lastY = bot.y;
        this.stuckTimer = 0;

        // ─── Cache (optymalizacja) ───────────────────────────
        this.nearMonsters = [];
        this.nearOrbs = [];
        this.cacheTimer = 0;

        // ─── Pamięć zagrożeń ─────────────────────────────────
        this.dangerZones = []; // [{x, y, expireTime}]
        this.lastDamageTime = 0;

        // ─── Statystyki ──────────────────────────────────────
        this.totalKills = 0;
        this.totalDeaths = 0;
        this.survivalTime = 0;
    }

    // ═══════════════════════════════════════════════════════
    //  GŁÓWNA PĘTLA DECYZYJNA
    // ═══════════════════════════════════════════════════════

    decide(monsters, xpOrbs, dt = 0.016) {
        this.survivalTime += dt;
        this.stateTimer += dt;

        // Aktualizuj cache co 100ms
        this.updateCache(monsters, xpOrbs, dt);

        // Aktualizuj kiting
        this.kiteDirTimer += dt;
        if (this.kiteDirTimer > 2.5 + Math.random() * 2) {
            this.kiteDir *= -1;
            this.kiteDirTimer = 0;
        }

        // Stuck detection
        this.checkStuck(dt);
        if (this.stuckTimer > 1.2) {
            this.stuckTimer = 0;
            this.destination = null;
            const angle = Math.random() * Math.PI * 2;
            return { move: { x: Math.cos(angle), y: Math.sin(angle) } };
        }

        // Aktualizuj pamięć
        this.updateMemory(dt);

        // Podejmij decyzję (nie co klatkę, dla stabilności)
        this.decisionTimer -= dt;
        if (this.decisionTimer <= 0) {
            this.decisionTimer = this.decisionInterval;
            this.selectState(monsters, xpOrbs);
        }

        // Wykonaj wybrany stan
        return this.executeState(dt, monsters, xpOrbs);
    }

    // ═══════════════════════════════════════════════════════
    //  SELEKCJA STANU (priorytetowa)
    // ═══════════════════════════════════════════════════════

    selectState(monsters, xpOrbs) {
        const hpPct = this.bot.getHealthPercent();
        const centerDist = Math.hypot(this.bot.x, this.bot.y);
        const currentZone = this.getZone(centerDist);
        const recZone = this.getRecommendedZone();
        const immediateCount = this.countMonstersInRange(120);
        const nearCount = this.nearMonsters.length;
        const weaponReady = this.isWeaponReady();
        const nearXpValue = this.getNearXpValue();
        const p = this.personality;

        // Kontynuuj ucieczkę jeśli timer aktywny
        if (this.fleeTimer > 0) return;

        // ── 1. KRYTYCZNA UCIECZKA (HP < 20%) ────────────────
        if (hpPct < 0.2 && immediateCount > 0) {
            this.setState('flee');
            this.fleeTimer = this.minFleeDuration + Math.random();
            return;
        }

        // ── 2. UCIECZKA (niskie HP + zagrożenie) ────────────
        if (hpPct < 0.35 * (0.5 + p.caution) && immediateCount > 2) {
            this.setState('flee');
            this.fleeTimer = 1.0 + Math.random();
            return;
        }

        // ── 3. ZŁA STREFA - wracaj ──────────────────────────
        if (currentZone > recZone + 1) {
            this.setState('retreat');
            return;
        }

        // ── 4. LECZENIE (niskie HP, mało wrogów) ────────────
        if (hpPct < 0.45 * (0.5 + p.caution) && immediateCount === 0) {
            this.setState('heal');
            return;
        }

        // ── 5. ZBIERANIE XP (dużo orbów w pobliżu) ─────────
        if (nearXpValue > 20 && hpPct > 0.5 && immediateCount < 3) {
            this.setState('collect');
            return;
        }

        // ── 6. WALKA (wrogowie w zasięgu broni) ─────────────
        const weaponRange = this.getWeaponRange();
        const inRangeCount = this.countMonstersInRange(weaponRange + 50);

        if (inRangeCount > 0 && hpPct > 0.3) {
            // Aura/melee: walcz jeśli nie za dużo wrogów
            if (this.combatStyle === 'aura' || this.combatStyle === 'melee') {
                if (immediateCount < 6 || hpPct > 0.6) {
                    this.setState('combat');
                    return;
                }
            }
            // Ranged: walcz prawie zawsze
            else {
                this.setState('combat');
                return;
            }
        }

        // ── 7. ZBIERANIE XP (trochę orbów) ──────────────────
        if (nearXpValue > 5 && hpPct > 0.4) {
            this.setState('collect');
            return;
        }

        // ── 8. EKSPLORACJA ───────────────────────────────────
        this.setState('explore');
    }

    setState(newState) {
        if (this.state !== newState) {
            this.state = newState;
            this.stateTimer = 0;
            if (newState !== 'combat') {
                // Reset destination przy zmianie stanu (nie w combat)
                this.destination = null;
            }
        }
    }

    // ═══════════════════════════════════════════════════════
    //  WYKONANIE STANÓW
    // ═══════════════════════════════════════════════════════

    executeState(dt, monsters, xpOrbs) {
        // Dekrementuj timer ucieczki
        if (this.fleeTimer > 0) this.fleeTimer -= dt;

        switch (this.state) {
            case 'flee':     return this.executeFlee();
            case 'retreat':  return this.executeRetreat();
            case 'heal':     return this.executeHeal();
            case 'combat':   return this.executeCombat(dt);
            case 'collect':  return this.executeCollect();
            case 'explore':  return this.executeExplore(dt);
            default:         return this.executeExplore(dt);
        }
    }

    // ─── UCIECZKA ────────────────────────────────────────────

    executeFlee() {
        let fx = 0, fy = 0;

        // Uciekaj od wszystkich bliskich wrogów (ważone dystansem)
        for (const m of this.nearMonsters) {
            if (m.dist > 400) break;
            const weight = (400 - m.dist) / 400;
            const dx = this.bot.x - m.monster.x;
            const dy = this.bot.y - m.monster.y;
            const d = m.dist || 1;
            fx += (dx / d) * weight * m.threat;
            fy += (dy / d) * weight * m.threat;
        }

        // Komponent do centrum (bezpieczeństwo)
        const cd = Math.hypot(this.bot.x, this.bot.y);
        if (cd > 500) {
            fx += (-this.bot.x / cd) * 0.4;
            fy += (-this.bot.y / cd) * 0.4;
        }

        // Unikaj krawędzi
        this.addEdgeAvoidance(fx, fy);

        return { move: this.normalizeMove(fx, fy) };
    }

    // ─── ODWRÓT (zła strefa) ─────────────────────────────────

    executeRetreat() {
        const recZone = this.getRecommendedZone();
        const targetRadius = this.getZoneRadius(recZone);

        // Kierunek do odpowiedniej strefy (w stronę centrum, ale nie za daleko)
        const cd = Math.hypot(this.bot.x, this.bot.y);

        if (cd <= targetRadius + 200) {
            // Już w dobrej strefie
            this.setState('explore');
            return this.executeExplore(0.016);
        }

        // Idź w stronę centrum
        let mx = -this.bot.x / cd;
        let my = -this.bot.y / cd;

        // Unikaj wrogów po drodze
        const avoidance = this.getMonsterAvoidance(200, 0.4);
        mx += avoidance.x;
        my += avoidance.y;

        return { move: this.normalizeMove(mx, my) };
    }

    // ─── LECZENIE ────────────────────────────────────────────

    executeHeal() {
        const cd = Math.hypot(this.bot.x, this.bot.y);
        const hpPct = this.bot.getHealthPercent();

        // Jeśli HP jest OK, przejdź dalej
        if (hpPct > 0.7) {
            this.setState('explore');
            return this.executeExplore(0.016);
        }

        // Idź do centrum
        let mx = 0, my = 0;
        if (cd > 200) {
            mx = -this.bot.x / cd;
            my = -this.bot.y / cd;
        }

        // Silne unikanie wrogów podczas leczenia
        const avoidance = this.getMonsterAvoidance(250, 0.6);
        mx += avoidance.x;
        my += avoidance.y;

        // Zbieraj XP po drodze (magnez)
        const nearOrb = this.findBestOrb(200);
        if (nearOrb) {
            const dx = nearOrb.orb.x - this.bot.x;
            const dy = nearOrb.orb.y - this.bot.y;
            const d = nearOrb.dist || 1;
            mx += (dx / d) * 0.2;
            my += (dy / d) * 0.2;
        }

        return { move: this.normalizeMove(mx, my) };
    }

    // ─── WALKA ───────────────────────────────────────────────

    executeCombat(dt) {
        // Znajdź najlepszy cel
        const target = this.selectCombatTarget();
        if (!target) {
            this.setState('explore');
            return this.executeExplore(0.016);
        }

        const monster = target.monster;
        const dist = target.dist;

        switch (this.combatStyle) {
            case 'aura':     return this.combatAura(monster, dist);
            case 'ranged':   return this.combatRanged(monster, dist);
            case 'melee':    return this.combatMelee(monster, dist);
            case 'assassin': return this.combatAssassin(monster, dist);
            default:         return this.combatRanged(monster, dist);
        }
    }

    combatAura(monster, dist) {
        // Aura: wchodź w grupy wrogów, ale nie za głęboko
        // Znajdź punkt z najgęstszą grupą potworów
        let bestX = monster.x, bestY = monster.y;
        let maxDensity = 0;

        const auraRange = this.getWeaponRange();

        for (const m of this.nearMonsters.slice(0, 10)) {
            let density = 0;
            for (const other of this.nearMonsters) {
                if (Math.hypot(other.monster.x - m.monster.x, other.monster.y - m.monster.y) < auraRange) {
                    density++;
                }
            }
            if (density > maxDensity) {
                maxDensity = density;
                bestX = m.monster.x;
                bestY = m.monster.y;
            }
        }

        // Nie wchodź za głęboko jeśli niskie HP
        const hpPct = this.bot.getHealthPercent();
        if (hpPct < 0.4 && this.countMonstersInRange(100) > 3) {
            return this.executeFlee();
        }

        const dx = bestX - this.bot.x;
        const dy = bestY - this.bot.y;
        return { move: this.normalizeMove(dx, dy) };
    }

    combatRanged(monster, dist) {
        const idealDist = this.getWeaponRange() * 0.65;
        let mx, my;

        if (dist < idealDist - 60) {
            // Za blisko - cofaj się
            mx = this.bot.x - monster.x;
            my = this.bot.y - monster.y;
        } else if (dist > idealDist + 80) {
            // Za daleko - podejdź
            mx = monster.x - this.bot.x;
            my = monster.y - this.bot.y;
        } else {
            // Idealny dystans - krąż (kiting)
            const angle = Math.atan2(monster.y - this.bot.y, monster.x - this.bot.x);
            const perpAngle = angle + (Math.PI / 2) * this.kiteDir;
            mx = Math.cos(perpAngle);
            my = Math.sin(perpAngle);
        }

        // Unikaj innych wrogów
        const avoidance = this.getMonsterAvoidance(130, 0.35);
        mx += avoidance.x;
        my += avoidance.y;

        return { move: this.normalizeMove(mx, my) };
    }

    combatMelee(monster, dist) {
        const attackRange = this.getWeaponRange();

        if (dist > attackRange + 30) {
            // Podejdź
            return { move: this.normalizeMove(monster.x - this.bot.x, monster.y - this.bot.y) };
        }

        // W zasięgu - krąż
        const angle = Math.atan2(monster.y - this.bot.y, monster.x - this.bot.x);
        const perpAngle = angle + (Math.PI / 2) * this.kiteDir;

        let mx = Math.cos(perpAngle);
        let my = Math.sin(perpAngle);

        // Lekkie przyciąganie do celu (żeby nie oddalać się za bardzo)
        mx += (monster.x - this.bot.x) / (dist || 1) * 0.15;
        my += (monster.y - this.bot.y) / (dist || 1) * 0.15;

        return { move: this.normalizeMove(mx, my) };
    }

    combatAssassin(monster, dist) {
        const weaponReady = this.isWeaponReady();

        if (weaponReady && dist > 80) {
            // Broń gotowa - szybko podejdź
            return { move: this.normalizeMove(monster.x - this.bot.x, monster.y - this.bot.y) };
        }

        if (!weaponReady && dist < 130) {
            // Broń na cooldown - wycofaj się
            return { move: this.normalizeMove(this.bot.x - monster.x, this.bot.y - monster.y) };
        }

        // Krąż czekając na cooldown
        const angle = Math.atan2(monster.y - this.bot.y, monster.x - this.bot.x);
        const perpAngle = angle + (Math.PI / 2) * this.kiteDir;
        return { move: { x: Math.cos(perpAngle), y: Math.sin(perpAngle) } };
    }

    // ─── ZBIERANIE XP ────────────────────────────────────────

    executeCollect() {
        // Znajdź najlepszy orb (wartość/dystans)
        const best = this.findBestOrb(500);

        if (!best) {
            this.setState('explore');
            return this.executeExplore(0.016);
        }

        let mx = best.orb.x - this.bot.x;
        let my = best.orb.y - this.bot.y;

        // Lekkie unikanie wrogów
        const avoidance = this.getMonsterAvoidance(150, 0.25);
        mx += avoidance.x;
        my += avoidance.y;

        return { move: this.normalizeMove(mx, my) };
    }

    // ─── EKSPLORACJA ─────────────────────────────────────────

    executeExplore(dt) {
        // Cel: poruszaj się po mapie w odpowiedniej strefie
        this.destinationTimer += dt;

        if (!this.destination || this.destinationTimer > 8 || this.reachedDest()) {
            this.pickDestination();
            this.destinationTimer = 0;
        }

        let mx = this.destination.x - this.bot.x;
        let my = this.destination.y - this.bot.y;
        const dist = Math.hypot(mx, my);

        if (dist > 1) {
            mx /= dist;
            my /= dist;
        }

        // Zbieraj XP po drodze
        const nearOrb = this.findBestOrb(200);
        if (nearOrb) {
            const dx = nearOrb.orb.x - this.bot.x;
            const dy = nearOrb.orb.y - this.bot.y;
            const d = nearOrb.dist || 1;
            mx = mx * 0.6 + (dx / d) * 0.4;
            my = my * 0.6 + (dy / d) * 0.4;
        }

        // Lekkie unikanie wrogów
        const avoidance = this.getMonsterAvoidance(120, 0.2);
        mx += avoidance.x;
        my += avoidance.y;

        return { move: this.normalizeMove(mx, my) };
    }

    // ═══════════════════════════════════════════════════════
    //  HELPERY
    // ═══════════════════════════════════════════════════════

    updateCache(monsters, xpOrbs, dt) {
        this.cacheTimer -= dt;
        if (this.cacheTimer > 0) return;
        this.cacheTimer = 0.1;

        // Cache potworów
        this.nearMonsters = [];
        for (const m of monsters) {
            if (m.hp <= 0) continue;
            const dist = Math.hypot(m.x - this.bot.x, m.y - this.bot.y);
            if (dist < 800) {
                this.nearMonsters.push({
                    monster: m,
                    dist,
                    threat: this.calcThreat(m, dist)
                });
            }
        }
        this.nearMonsters.sort((a, b) => a.dist - b.dist);
        if (this.nearMonsters.length > 20) this.nearMonsters.length = 20;

        // Cache orbów
        this.nearOrbs = [];
        for (const o of xpOrbs) {
            if (o.life <= 0) continue;
            const dist = Math.hypot(o.x - this.bot.x, o.y - this.bot.y);
            if (dist < 500) {
                this.nearOrbs.push({ orb: o, dist, value: o.val || 1 });
            }
        }
        this.nearOrbs.sort((a, b) => (b.value / (b.dist + 30)) - (a.value / (a.dist + 30)));
        if (this.nearOrbs.length > 15) this.nearOrbs.length = 15;
    }

    checkStuck(dt) {
        const moved = Math.hypot(this.bot.x - this.lastX, this.bot.y - this.lastY);
        this.stuckTimer = moved < 3 ? this.stuckTimer + dt : 0;
        this.lastX = this.bot.x;
        this.lastY = this.bot.y;
    }

    updateMemory(dt) {
        const now = Date.now();
        this.dangerZones = this.dangerZones.filter(z => z.expireTime > now);
    }

    calcThreat(monster, dist) {
        let threat = 1;
        const hp = monster.hp || 10;
        const dmg = monster.dmg || 5;
        threat *= (hp / 15);
        threat *= (dmg / 8);
        if (dist < 100) threat *= 2.5;
        else if (dist < 200) threat *= 1.5;
        if (monster.isBoss) threat *= 4;
        if (monster.isElite) threat *= 2;
        return threat;
    }

    countMonstersInRange(range) {
        let count = 0;
        for (const m of this.nearMonsters) {
            if (m.dist > range) break;
            count++;
        }
        return count;
    }

    getNearXpValue() {
        let total = 0;
        for (const o of this.nearOrbs) {
            total += o.value * (1 - o.dist / 500);
        }
        return total;
    }

    findBestOrb(maxRange) {
        for (const o of this.nearOrbs) {
            if (o.dist <= maxRange) return o;
        }
        return null;
    }

    selectCombatTarget() {
        if (this.nearMonsters.length === 0) return null;

        // Priorytet:
        // 1. Niskie HP (łatwy kill = XP)
        // 2. Boss/elite (dużo XP)
        // 3. Najbliższy w zasięgu broni

        const range = this.getWeaponRange() + 100;
        const inRange = this.nearMonsters.filter(m => m.dist < range);

        if (inRange.length === 0) return this.nearMonsters[0];

        // Szukaj łatwego killa
        const lowHp = inRange.find(m => m.monster.hp < 20);
        if (lowHp) return lowHp;

        // Boss
        const boss = inRange.find(m => m.monster.isBoss);
        if (boss) return boss;

        // Najbliższy
        return inRange[0];
    }

    getMonsterAvoidance(range, strength) {
        let ax = 0, ay = 0;
        for (const m of this.nearMonsters) {
            if (m.dist > range) break;
            const weight = (range - m.dist) / range;
            ax += (this.bot.x - m.monster.x) / (m.dist || 1) * weight;
            ay += (this.bot.y - m.monster.y) / (m.dist || 1) * weight;
        }
        return { x: ax * strength, y: ay * strength };
    }

    addEdgeAvoidance(fx, fy) {
        const HALF = 6000;
        const EDGE = 500;
        if (this.bot.x > HALF - EDGE) fx -= 2;
        if (this.bot.x < -HALF + EDGE) fx += 2;
        if (this.bot.y > HALF - EDGE) fy -= 2;
        if (this.bot.y < -HALF + EDGE) fy += 2;
    }

    determineCombatStyle() {
        const weapon = this.bot.weapons?.[0];
        if (!weapon) return 'melee';

        const map = {
            aura: 'aura',
            bow: 'ranged', crossbow: 'ranged', lightning: 'ranged',
            fireball: 'ranged', laser: 'ranged', meteor: 'ranged',
            sword: 'melee', axe: 'melee',
            knife: 'assassin',
            poison: 'aura', mine: 'ranged',
        };
        return map[weapon.type] || 'melee';
    }

    getWeaponRange() {
        const weapon = this.bot.weapons?.[0];
        if (!weapon) return 150;

        const ranges = {
            aura: 150, bow: 420, crossbow: 380, lightning: 380,
            fireball: 320, laser: 400, meteor: 350,
            sword: 130, axe: 140, knife: 100,
            poison: 140, mine: 100,
        };
        return ranges[weapon.type] || 200;
    }

    isWeaponReady() {
        const w = this.bot.weapons?.[0];
        return w ? w.timer <= 0 : false;
    }

    pickDestination() {
        const level = this.bot.level || 1;
        const recZone = this.getRecommendedZone();
        const targetRadius = this.getZoneRadius(recZone);

        // Losowy punkt w odpowiedniej strefie
        const angle = Math.random() * Math.PI * 2;
        const dist = targetRadius * (0.3 + Math.random() * 0.6);

        this.destination = {
            x: Math.cos(angle) * dist,
            y: Math.sin(angle) * dist
        };
    }

    reachedDest() {
        if (!this.destination) return true;
        return Math.hypot(this.destination.x - this.bot.x, this.destination.y - this.bot.y) < 150;
    }

    normalizeMove(x, y) {
        const len = Math.hypot(x, y);
        if (len === 0) return { x: 0, y: 0 };
        return { x: x / len, y: y / len };
    }

    getRecommendedZone() {
        const level = this.bot.level || 1;
        if (level < 3) return 0;
        if (level < 6) return 1;
        if (level < 9) return 2;
        if (level < 13) return 3;
        return 4;
    }

    getZoneRadius(zone) {
        return [1200, 2500, 4000, 5500, 6000][Math.min(zone, 4)];
    }

    getZone(centerDist) {
        if (centerDist < 1500) return 0;
        if (centerDist < 3000) return 1;
        if (centerDist < 4500) return 2;
        if (centerDist < 6000) return 3;
        return 4;
    }

    // ═══════════════════════════════════════════════════════
    //  CALLBACKI
    // ═══════════════════════════════════════════════════════

    onDamageTaken(amount, source) {
        this.lastDamageTime = Date.now();

        if (source) {
            this.dangerZones.push({
                x: source.x || this.bot.x,
                y: source.y || this.bot.y,
                expireTime: Date.now() + 5000
            });
        }

        // Automatyczna ucieczka przy dużych obrażeniach
        const hpPct = this.bot.getHealthPercent();
        if (hpPct < 0.25 && this.state !== 'flee') {
            this.setState('flee');
            this.fleeTimer = 2;
        }
    }

    onKill(victim) {
        this.totalKills++;
    }

    onDeath() {
        this.totalDeaths++;
        // Po śmierci: zwiększ ostrożność
        this.personality.caution = Math.min(1, this.personality.caution + 0.08);
        this.personality.aggression = Math.max(0.2, this.personality.aggression - 0.05);
        this.survivalTime = 0;
    }

    onXpGained(amount) {
        // Mogłoby wpływać na greed
    }
}