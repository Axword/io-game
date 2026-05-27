// server/systems/CollisionSystem.js
import { ServerBullet } from '../entities/Bullet.js';

export class ServerCollisionSystem {
    
    checkBulletCollisions(bullets, monsters, player, bots, bosses) {
        for (const b of bullets) {
            // ── Pociski wrogów trafiają graczy/boty ──────────
            if (b.owner === 'monster' || b.owner === 'boss') {
                this.checkEnemyBullet(b, player, bots);
                continue;
            }

            // ── Laser - specjalna kolizja prostokątna ───────
            if (b.wtype === 'laser') {
                this.checkLaserCollisions(b, monsters, bosses, player, bots);
                continue;
            }

            // ── Poison - kolizja obszarowa z lingerem ───────
            if (b.wtype === 'poison') {
                this.checkPoisonCollisions(b, monsters, bosses, player, bots);
                continue;
            }

            // ── Standardowe pociski trafiają potwory + boty AI ──
            // Zbuduj listę celów: potwory + żywi boty (z wyjątkiem strzelającego)
            const allTargets = this._getBulletTargets(b, monsters, bots);
            this.checkBulletVsMonsters(b, allTargets, player, bots);

            // ── Pociski trafiają bossów ─────────────────────
            if (bosses) {
                this.checkBulletVsBosses(b, bosses, player);
            }

            // ── Eksplozja (fireball/meteor) przy śmierci ────
            if (b.isExplosive && b.explosionRadius > 0 && b.life <= 0 && !b.hasExploded) {
                this.handleExplosion(b, monsters, bosses, player, bots);
            }
        }
    }

    // ─── Helper: zbuduj listę celów dla pocisku ─────────────
    _getBulletTargets(b, monsters, bots) {
        // Jeśli właściciel pocisku to bot lub gracz (nie potwór):
        // dolicz żywych botów jako potencjalne cele (PvP)
        if (!b.owner || b.owner === 'monster' || b.owner === 'boss') return monsters;
        if (!bots || bots.length === 0) return monsters;

        // Zreużyj tablicę (performance)
        if (!this._targetBuf) this._targetBuf = [];
        this._targetBuf.length = 0;
        for (const m of monsters) this._targetBuf.push(m);
        for (const bot of bots) {
            if (bot.hp > 0 && bot !== b.owner) this._targetBuf.push(bot);
        }
        return this._targetBuf;
    }

    // ─── Pociski wrogów vs gracze ────────────────────────────

    checkEnemyBullet(b, player, bots) {
        if (player && !b.hit.has(player)) {
            const dist = Math.hypot(b.x - player.x, b.y - player.y);
            if (dist < b.sz * 10 + 10) {
                player.takeDamage(b.dmg);
                b.hit.add(player);
                if (b.isMine) b.life = -1;
            }
        }

        for (const bot of bots) {
            if (!b.hit.has(bot)) {
                const dist = Math.hypot(b.x - bot.x, b.y - bot.y);
                if (dist < b.sz * 10 + 10) {
                    bot.takeDamage(b.dmg * 0.4); // boty dostają 40% obrażeń od mobów
                    b.hit.add(bot);
                    if (b.isMine) b.life = -1;
                }
            }
        }
    }

    // ─── Standardowe pociski vs potwory (i boty-AI gdy są w celach) ─

    checkBulletVsMonsters(b, monsters, player, bots) {
        for (const m of monsters) {
            if (m.hp <= 0) continue;
            if (b.hit.has(m)) continue;
            // Pomiń właściciela pocisku
            if (b.owner === m) continue;

            // isBot = Player entity (bot), sz jest undefined — używamy stałego rozmiaru 20
            const targetRadius = m.isBot ? 20 : (m.sz ?? 20);

            const hitR = b.wtype === 'sword'
                ? targetRadius * 0.75 + b.sz * 60
                : b.wtype === 'knife'
                ? targetRadius * 0.75 + b.sz * 7
                : targetRadius * 0.75 + b.sz * 3;
            const dist = Math.hypot(b.x - m.x, b.y - m.y);

            if (dist < hitR) {
                // Dla botów-AI: zastosuj mnożnik PvP (35%) i wywołaj ich takeDamage
                if (m.isBot) {
                    const pvpDmg = b.dmg * 0.35;
                    m.takeDamage(pvpDmg, b.owner);
                    b.hit.add(m);
                    if (m.botAI?.onDamageTaken) m.botAI.onDamageTaken(pvpDmg, b.owner);
                    if (!['sword', 'poison'].includes(b.wtype)) break;
                    continue;
                }

                // Oblicz obrażenia z krytem
                const finalDmg = this.calculateDamage(b, m);
                m.takeDamage(finalDmg, b.owner); // przekaż właściciela pocisku
                this.trackDamage(b, player, finalDmg);

                b.hit.add(m);

                // Bounce (noże, itp.)
                if (b.bounces > 0 && b.life > 0) {
                    this.handleBounce(b, m, monsters);
                }

                b.onHit();

                // Fireball/meteor - eksploduj przy trafieniu
                if (b.isExplosive && b.explosionRadius > 0 && !b.hasExploded) {
                    b.life = -1; // Wymusi eksplozję w następnej klatce
                }

                // Sword/poison nie przerywają po trafieniu (multi-hit)
                if (!['sword', 'poison'].includes(b.wtype)) {
                    break;
                }
            }
        }
    }

    // ─── Pociski vs bossy ────────────────────────────────────

    checkBulletVsBosses(b, bosses, player) {
        for (const boss of bosses) {
            if (boss.hp <= 0) continue;
            if (b.hit.has(boss)) continue;

            const hitR = boss.sz * 0.8 + (b.sz * 3);
            const dist = Math.hypot(b.x - boss.x, b.y - boss.y);

            if (dist < hitR) {
                const finalDmg = this.calculateDamage(b, boss);
                boss.takeDamage(finalDmg, b.owner);
                this.trackDamage(b, player, finalDmg);

                b.hit.add(boss);

                if (b.bounces > 0 && b.life > 0) {
                    // Bounce od bossa do pobliskich potworów
                    b.bounces--;
                }

                b.onHit();

                if (b.isExplosive && !b.hasExploded) {
                    b.life = -1;
                }

                break;
            }
        }
    }

    // ─── Laser - prostokątna kolizja ─────────────────────────

    checkLaserCollisions(b, monsters, bosses, player, bots = []) {
        if (!b.owner || typeof b.owner !== 'object') return;

        const ownerX = b.owner.x;
        const ownerY = b.owner.y;
        const angle = b.laserAngle || 0;
        const range = b.laserRange || 350;
        const halfWidth = (b.laserWidth || 18) / 2;

        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        // Sprawdź potwory
        for (const m of monsters) {
            if (m.hp <= 0 || b.hit.has(m)) continue;

            const dx = m.x - ownerX;
            const dy = m.y - ownerY;
            const localX = dx * cosA + dy * sinA;
            const localY = -dx * sinA + dy * cosA;

            if (localX > 0 && localX < range && Math.abs(localY) < halfWidth + (m.sz ?? 20) * 0.5) {
                const finalDmg = this.calculateDamage(b, m);
                m.takeDamage(finalDmg, b.owner);
                this.trackDamage(b, player, finalDmg);
                b.hit.add(m);
            }
        }

        // Laser trafia boty (PvP, 35%)
        if (bots && b.owner !== 'monster' && b.owner !== 'boss') {
            for (const bot of bots) {
                if (bot.hp <= 0 || bot === b.owner || b.hit.has(bot)) continue;
                const dx = bot.x - ownerX;
                const dy = bot.y - ownerY;
                const localX = dx * cosA + dy * sinA;
                const localY = -dx * sinA + dy * cosA;
                if (localX > 0 && localX < range && Math.abs(localY) < halfWidth + 20 * 0.5) {
                    const laserDmg = b.dmg * 0.35;
                    bot.takeDamage(laserDmg, b.owner);
                    if (bot.botAI?.onDamageTaken) bot.botAI.onDamageTaken(laserDmg, b.owner);
                    b.hit.add(bot);
                }
            }
        }

        // Sprawdź bossy
        if (bosses) {
            for (const boss of bosses) {
                if (boss.hp <= 0 || b.hit.has(boss)) continue;

                const dx = boss.x - ownerX;
                const dy = boss.y - ownerY;
                const localX = dx * cosA + dy * sinA;
                const localY = -dx * sinA + dy * cosA;

                if (localX > 0 && localX < range && Math.abs(localY) < halfWidth + boss.sz * 0.5) {
                    const finalDmg = this.calculateDamage(b, boss);
                    boss.takeDamage(finalDmg, b.owner);
                    this.trackDamage(b, player, finalDmg);
                    b.hit.add(boss);
                }
            }
        }
    }

    // ─── Trucizna - obszarowa z lingerem ─────────────────────

    checkPoisonCollisions(b, monsters, bosses, player, bots = []) {
        const poisonRange = b.sz * 120; // sz jest ustawiane jako range/120

        for (const m of monsters) {
            if (m.hp <= 0) continue;

            const dist = Math.hypot(m.x - b.x, m.y - b.y);

            if (dist < poisonRange) {
                // W chmurze trucizny
                if (!b.hit.has(m)) {
                    const finalDmg = this.calculateDamage(b, m);
                    m.takeDamage(finalDmg, b.owner);
                    this.trackDamage(b, player, finalDmg);
                    b.hit.add(m);
                }

                // Odśwież linger timer (entity jest w chmurze)
                if (b.lingerDmg > 0) {
                    b.refreshLingerTarget(m);
                }
            } else {
                // Wyszedł z chmury - dodaj do lingera jeśli był wcześniej
                if (b.lingerDmg > 0 && b.lingeredEntities && !b.lingeredEntities.has(m)) {
                    // Nie dodawaj lingera jeśli nigdy nie był w chmurze
                } else if (b.lingerDmg > 0 && b.hit.has(m)) {
                    // Był w chmurze wcześniej, teraz wyszedł - linger aktywny
                    b.addLingerTarget(m);
                }
            }
        }

        // Bossy w trucizny
        if (bosses) {
            for (const boss of bosses) {
                if (boss.hp <= 0) continue;

                const dist = Math.hypot(boss.x - b.x, boss.y - b.y);

                if (dist < poisonRange) {
                    if (!b.hit.has(boss)) {
                        const finalDmg = this.calculateDamage(b, boss);
                        boss.takeDamage(finalDmg, b.owner);
                        this.trackDamage(b, player, finalDmg);
                        b.hit.add(boss);
                    }

                    if (b.lingerDmg > 0) {
                        b.refreshLingerTarget(boss);
                    }
                }
            }
        }

        // Trucizna trafia boty (PvP, 35%)
        if (bots && b.owner && b.owner !== 'monster' && b.owner !== 'boss') {
            for (const bot of bots) {
                if (bot.hp <= 0 || bot === b.owner) continue;
                const dist = Math.hypot(bot.x - b.x, bot.y - b.y);
                if (dist < poisonRange) {
                    const poisonDmg = b.dmg * 0.35;
                    bot.takeDamage(poisonDmg, b.owner);
                    if (bot.botAI?.onDamageTaken) bot.botAI.onDamageTaken(poisonDmg, b.owner);
                }
            }
        }
    }

    // ─── Eksplozja (fireball/meteor) ─────────────────────────

    handleExplosion(b, monsters, bosses, player, bots = []) {
        b.hasExploded = true;
        const radius = b.explosionRadius;

        // Obrażenia potworom w zasięgu eksplozji
        for (const m of monsters) {
            if (m.hp <= 0) continue;

            const dist = Math.hypot(m.x - b.x, m.y - b.y);
            if (dist < radius) {
                const falloff = 1 - (dist / radius) * 0.5;
                const explosionDmg = b.dmg * falloff;
                m.takeDamage(explosionDmg, b.owner);
                this.trackDamage(b, player, explosionDmg);
            }
        }

        // Eksplozja trafia boty (PvP, 35%)
        if (bots && b.owner && b.owner !== 'monster' && b.owner !== 'boss') {
            for (const bot of bots) {
                if (bot.hp <= 0 || bot === b.owner) continue;
                const dist = Math.hypot(bot.x - b.x, bot.y - b.y);
                if (dist < radius) {
                    const falloff = 1 - (dist / radius) * 0.5;
                    const explosionDmg = b.dmg * falloff * 0.35;
                    bot.takeDamage(explosionDmg, b.owner);
                    if (bot.botAI?.onDamageTaken) bot.botAI.onDamageTaken(explosionDmg, b.owner);
                }
            }
        }

        // Obrażenia bossom
        if (bosses) {
            for (const boss of bosses) {
                if (boss.hp <= 0) continue;

                const dist = Math.hypot(boss.x - b.x, boss.y - b.y);
                if (dist < radius) {
                    const falloff = 1 - (dist / radius) * 0.5;
                    const explosionDmg = b.dmg * falloff;
                    boss.takeDamage(explosionDmg, b.owner);
                    this.trackDamage(b, player, explosionDmg);
                }
            }
        }

        // SFX eksplozji
        this.createExplosionFX(b);
    }

    // ─── SFX eksplozji ──────────────────────────────────────

    createExplosionFX(b) {
        if (!b.scene) return;

        const radius = b.explosionRadius;
        const col = b.wtype === 'meteor' ? 0xff6600 : 0xff3300;

        // Ring eksplozji
        const ringGeo = new THREE.RingGeometry(radius * 0.6, radius, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color: col, transparent: true, opacity: 0.6, side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(b.x, b.y, 2.5);
        b.scene.add(ring);

        // Wypełnienie
        const fillGeo = new THREE.CircleGeometry(radius * 0.7, 24);
        const fillMat = new THREE.MeshBasicMaterial({
            color: 0xffcc00, transparent: true, opacity: 0.35
        });
        const fill = new THREE.Mesh(fillGeo, fillMat);
        fill.position.set(b.x, b.y, 2.4);
        b.scene.add(fill);

        // Animacja zanikania
        const scene = b.scene;
        let fxLife = 0.35;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            fxLife = 0.35 - elapsed;

            if (fxLife <= 0) {
                scene.remove(ring);
                scene.remove(fill);
                return;
            }

            const t = 1 - (fxLife / 0.35);

            // Rozszerzanie
            const scale = 1 + t * 0.6;
            ring.scale.set(scale, scale, 1);
            fill.scale.set(scale, scale, 1);

            // Zanikanie
            ringMat.opacity = 0.6 * (1 - t);
            fillMat.opacity = 0.35 * (1 - t);

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    // ─── Bounce (noże) ───────────────────────────────────────

    handleBounce(b, hitMonster, monsters) {
    b.bounces = 0; // zużyj wszystkie bounce'y
    b.life = -1;   // zniszcz oryginalny nóż

    // Spawn 4 noży we wszystkich kierunkach
    const angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    const spd = Math.hypot(b.vx, b.vy);

    for (const angle of angles) {
        const newBullet = new b.constructor(
            hitMonster.x, hitMonster.y,
            Math.cos(angle) * spd,
            Math.sin(angle) * spd,
            Math.round(b.dmg * 1.2),
            b.owner,
            b.wtype,
            b.sz,
            0,        // bez bounce
            999999,   // piercing
            b.col,
            b.scene
        );
        newBullet.life = 0.05; // żyje 1 sekundę
        newBullet.hit.add(hitMonster); // nie trafi w tego samego
        b._spawnQueue = b._spawnQueue || [];
        b._spawnQueue.push(newBullet);
    }
}

    // ─── Oblicz obrażenia (z krytem) ─────────────────────────

    calculateDamage(b, target) {
        let dmg = b.dmg;

        // Krytyk z właściciela pocisku
        const owner = b.owner;
        if (owner && typeof owner === 'object') {
            const critChance = owner.critChance || 0;
            const critDamage = owner.critDamage || 200;

            if (critChance > 0 && Math.random() * 100 < critChance) {
                dmg *= (critDamage / 100);
            }
        }

        return dmg;
    }

    // ─── Zliczanie obrażeń ──────────────────────────────────

    trackDamage(b, player, dmg) {
        // Sprawdź czy pocisk należy do gracza
        const owner = b.owner;

        if (owner && typeof owner === 'object' && owner === player) {
            player.totalDmg = (player.totalDmg || 0) + dmg;
        }
        else if (owner === 'player' && player) {
            player.totalDmg = (player.totalDmg || 0) + dmg;
        }
    }

    // ─── Kontaktowe kolizje monster vs gracz ─────────────────

    checkMonsterPlayerCollisions(monsters, player, dt) {
        if (!player) return;

        let totalDamage = 0;
        let monsterCount = 0;

        for (const m of monsters) {
            if (m.hp <= 0 || m.isPeaceful) continue;

            const dist = Math.hypot(m.x - player.x, m.y - player.y);
            const collisionDist = m.sz * 0.8 + 15;

            if (dist < collisionDist) {
                totalDamage += m.dmg * dt * 2.5;
                monsterCount++;
            }
        }

        if (monsterCount > 1) {
            totalDamage *= 1 + (monsterCount - 1) * 0.3;
        }

        if (totalDamage > 0) {
            player.takeDamage(totalDamage);
        }
    }

    // ─── Kontaktowe kolizje monster vs boty ──────────────────

    checkMonsterBotCollisions(monsters, bots, dt) {
        for (const bot of bots) {
            let totalDamage = 0;
            let monsterCount = 0;

            for (const m of monsters) {
                if (m.hp <= 0 || m.isPeaceful) continue;

                const dist = Math.hypot(m.x - bot.x, m.y - bot.y);
                const collisionDist = m.sz * 0.8 + 15;

                if (dist < collisionDist) {
                    totalDamage += m.dmg * dt * 2.5;
                    monsterCount++;
                }
            }

            if (monsterCount > 1) {
                totalDamage *= 1 + (monsterCount - 1) * 0.3;
            }

            if (totalDamage > 0) {
                bot.takeDamage(totalDamage * 0.4); // boty dostają 40% obrażeń kontaktowych od mobów
            }
        }
    }

    // ─── Boss vs gracz ───────────────────────────────────────

    checkBossPlayerCollisions(bosses, player, dt) {
        if (!player || !bosses) return;

        for (const boss of bosses) {
            if (boss.hp <= 0) continue;

            const dist = Math.hypot(boss.x - player.x, boss.y - player.y);
            const collisionDist = boss.sz * 0.8 + 20;

            if (dist < collisionDist) {
                player.takeDamage(boss.dmg * dt * 3);
            }
        }
    }

    // ─── Boss vs boty ────────────────────────────────────────

    checkBossBotCollisions(bosses, bots, dt) {
        if (!bosses) return;

        for (const bot of bots) {
            for (const boss of bosses) {
                if (boss.hp <= 0) continue;

                const dist = Math.hypot(boss.x - bot.x, boss.y - bot.y);
                const collisionDist = boss.sz * 0.8 + 20;

                if (dist < collisionDist) {
                    bot.takeDamage(boss.dmg * dt * 3 * 0.4); // 40% od bossa
                }
            }
        }
    }

    // ─── PvP: gracz vs boty ──────────────────────────────────

    // ─── PvP: gracz vs boty (kontakt) ───────────────────────────
    // Uwaga: główne obrażenia PvP są w checkPvpBulletCollisions
    // To tylko awaryjne kill przy bardzo bliskim kontakcie
    checkPlayerBotCollisions(player, bots) {
        if (!player) return null;
        const results = [];

        for (const bot of bots) {
            if (bot.hp <= 0) continue;

            const dist = Math.hypot(bot.x - player.x, bot.y - player.y);
            if (dist < 28) {
                // Zamiast instant kill — zadaj obrażenia (35% dmg)
                // Gracz uderza bota
                if (player.hp > 0) {
                    const dmg = 8 * 0.35; // bazowe 8 hp kontaktowych, 35%
                    bot.takeDamage(dmg);
                    if (bot.hp <= 0) {
                        player.addXp(Math.floor((bot.totalXp || 0) * 0.3));
                        results.push({ killed: bot, killer: player });
                    }
                }
            }
        }

        return results.length > 0 ? results[0] : null;
    }

    // ─── Pociski botów trafiają gracza (PvP, 35% obrażeń) ───────
    checkBotBulletVsPlayer(bullets, player, bots) {
        if (!player) return;
        const PVP_MULT   = 0.35;
        const PLAYER_R   = 22; // rozmiar gracza (size=22 w Player.js)
        const BOT_R      = 20; // rozmiar bota

        for (const b of bullets) {
            if (b.owner === 'monster' || b.owner === 'boss') continue;
            if (!b.owner?.isBot) continue; // tylko pociski botów

            // Bot strzela w GRACZA
            if (!b.hit.has(player) && b.owner !== player) {
                const dist = Math.hypot(b.x - player.x, b.y - player.y);
                const hitR = PLAYER_R + b.sz * 3;
                if (dist < hitR) {
                    player.takeDamage(b.dmg * PVP_MULT, b.owner);
                    b.hit.add(player);
                    if (b.isMine) b.life = -1;
                }
            }

            // Bot strzela w INNEGO bota (tylko swój cel PvP)
            const pvpTarget = b.owner?.botAI?.getPvpTarget?.();
            if (!pvpTarget || pvpTarget.hp <= 0) continue;
            if (b.hit.has(pvpTarget)) continue;
            if (!pvpTarget.isBot) continue; // target musi być botem

            const dist2 = Math.hypot(b.x - pvpTarget.x, b.y - pvpTarget.y);
            const hitR2 = BOT_R + b.sz * 3;
            if (dist2 < hitR2) {
                pvpTarget.takeDamage(b.dmg * PVP_MULT, b.owner);
                b.hit.add(pvpTarget);
                if (b.isMine) b.life = -1;
                if (pvpTarget.botAI?.onDamageTaken) pvpTarget.botAI.onDamageTaken(b.dmg * PVP_MULT, b.owner);
            }
        }
    }

    // ─── Pociski gracza trafiają boty (z mnożnikiem 35%) ─────────
    checkPlayerBulletVsBots(bullets, player, bots) {
        const PVP_MULT = 0.35;
        const BOT_RADIUS = 20; // rozmiar bota jak w Player.js (size=20)

        for (const b of bullets) {
            // Pociski GRACZA (nie botów, nie potworów)
            if (!b.owner || b.owner === 'monster' || b.owner === 'boss') continue;
            if (b.owner !== player) continue;

            for (const bot of bots) {
                if (bot.hp <= 0) continue;
                if (b.hit.has(bot)) continue;

                const dist = Math.hypot(b.x - bot.x, b.y - bot.y);
                // Hitbox: rozmiar bota + rozmiar pocisku (jak vs monster: sz*0.75 + sz*3, ale bot duży = 20)
                const hitR = BOT_RADIUS + (b.sz * 3);
                if (dist < hitR) {
                    const dmg = b.dmg * PVP_MULT;
                    bot.takeDamage(dmg, player);
                    b.hit.add(bot);
                    if (b.isMine) b.life = -1;
                    if (bot.botAI?.onDamageTaken) bot.botAI.onDamageTaken(dmg, player);
                }
            }
        }
    }
    handleBounce(b, hitMonster, monsters) {
        b.bounces = 0;
        b.life = -1;
        const angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
        const spd = Math.hypot(b.vx, b.vy);

        for (const angle of angles) {
            const newBullet = new ServerBullet(
                hitMonster.x, hitMonster.y,
                Math.cos(angle) * spd, Math.sin(angle) * spd,
                Math.round(b.dmg * 1.2), b.owner, b.wtype, b.sz, 0, 999999, b.col
            );
            newBullet.life = 0.05;
            newBullet.hit.add(hitMonster);
            b._spawnQueue = b._spawnQueue || [];
            b._spawnQueue.push(newBullet);
        }
    }

    // USUŃ CAŁKOWICIE FUNKCJĘ: createExplosionFX(b)
}