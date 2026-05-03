import { norm } from '../utils/math.js';

export class CollisionSystem {
    
    checkBulletCollisions(bullets, monsters, player, bots, bosses) {
        for (const b of bullets) {
            // ── Pociski wrogów trafiają graczy/boty ──────────
            if (b.owner === 'monster' || b.owner === 'boss') {
                this.checkEnemyBullet(b, player, bots);
                continue;
            }

            // ── Laser - specjalna kolizja prostokątna ───────
            if (b.wtype === 'laser') {
                this.checkLaserCollisions(b, monsters, bosses, player);
                continue;
            }

            // ── Poison - kolizja obszarowa z lingerem ───────
            if (b.wtype === 'poison') {
                this.checkPoisonCollisions(b, monsters, bosses, player);
                continue;
            }

            // ── Standardowe pociski trafiają potwory ────────
            this.checkBulletVsMonsters(b, monsters, player, bots);

            // ── Pociski trafiają bossów ─────────────────────
            if (bosses) {
                this.checkBulletVsBosses(b, bosses, player);
            }

            // ── Eksplozja (fireball/meteor) przy śmierci ────
            if (b.isExplosive && b.explosionRadius > 0 && b.life <= 0 && !b.hasExploded) {
                this.handleExplosion(b, monsters, bosses, player);
            }
        }
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
                    bot.takeDamage(b.dmg);
                    b.hit.add(bot);
                    if (b.isMine) b.life = -1;
                }
            }
        }
    }

    // ─── Standardowe pociski vs potwory ──────────────────────

    checkBulletVsMonsters(b, monsters, player, bots) {
        for (const m of monsters) {
            if (m.hp <= 0) continue;
            if (b.hit.has(m)) continue;

            const hitR = (m.sz * 0.75) + (b.sz * 3);
            const dist = Math.hypot(b.x - m.x, b.y - m.y);

            if (dist < hitR) {
                // Oblicz obrażenia z krytem
                const finalDmg = this.calculateDamage(b, m);
                m.takeDamage(finalDmg);
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
                boss.takeDamage(finalDmg);
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

    checkLaserCollisions(b, monsters, bosses, player) {
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

            // Przekształć pozycję potwora do układu współrzędnych lasera
            const dx = m.x - ownerX;
            const dy = m.y - ownerY;

            // Obrót do lokalnego układu lasera
            const localX = dx * cosA + dy * sinA;
            const localY = -dx * sinA + dy * cosA;

            // Sprawdź czy w prostokącie lasera
            if (localX > 0 && localX < range && Math.abs(localY) < halfWidth + m.sz * 0.5) {
                const finalDmg = this.calculateDamage(b, m);
                m.takeDamage(finalDmg);
                this.trackDamage(b, player, finalDmg);
                b.hit.add(m);
                // Laser NIE wywołuje onHit - przechodzi przez wszystko
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
                    boss.takeDamage(finalDmg);
                    this.trackDamage(b, player, finalDmg);
                    b.hit.add(boss);
                }
            }
        }
    }

    // ─── Trucizna - obszarowa z lingerem ─────────────────────

    checkPoisonCollisions(b, monsters, bosses, player) {
        const poisonRange = b.sz * 120; // sz jest ustawiane jako range/120

        for (const m of monsters) {
            if (m.hp <= 0) continue;

            const dist = Math.hypot(m.x - b.x, m.y - b.y);

            if (dist < poisonRange) {
                // W chmurze trucizny
                if (!b.hit.has(m)) {
                    const finalDmg = this.calculateDamage(b, m);
                    m.takeDamage(finalDmg);
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
                        boss.takeDamage(finalDmg);
                        this.trackDamage(b, player, finalDmg);
                        b.hit.add(boss);
                    }

                    if (b.lingerDmg > 0) {
                        b.refreshLingerTarget(boss);
                    }
                }
            }
        }
    }

    // ─── Eksplozja (fireball/meteor) ─────────────────────────

    handleExplosion(b, monsters, bosses, player) {
        b.hasExploded = true;
        const radius = b.explosionRadius;

        // Obrażenia potworom w zasięgu eksplozji
        for (const m of monsters) {
            if (m.hp <= 0) continue;

            const dist = Math.hypot(m.x - b.x, m.y - b.y);
            if (dist < radius) {
                // Falloff: im dalej od centrum, tym mniej obrażeń
                const falloff = 1 - (dist / radius) * 0.5;
                const explosionDmg = b.dmg * falloff;
                m.takeDamage(explosionDmg);
                this.trackDamage(b, player, explosionDmg);
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
                    boss.takeDamage(explosionDmg);
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
        b.bounces--;

        // Znajdź najbliższy cel do odbicia
        let nearest = null;
        let nearestDist = 350;

        for (const mm of monsters) {
            if (mm.hp <= 0 || b.hit.has(mm)) continue;

            const d = Math.hypot(mm.x - b.x, mm.y - b.y);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = mm;
            }
        }

        if (nearest) {
            const [nx, ny] = norm(nearest.x - b.x, nearest.y - b.y);
            const spd = Math.hypot(b.vx, b.vy);
            b.vx = nx * spd;
            b.vy = ny * spd;

            // Odśwież rotację noża
            if (b.wtype === 'knife') {
                b.mesh.rotation.z = Math.atan2(b.vy, b.vx);
            }
        } else {
            // Brak celu do odbicia - leci dalej
            if (b.bounces <= 0) {
                // Ostatnie odbicie, leci dalej aż zgaśnie
            }
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
                bot.takeDamage(totalDamage);
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
                    bot.takeDamage(boss.dmg * dt * 3);
                }
            }
        }
    }

    // ─── PvP: gracz vs boty ──────────────────────────────────

    checkPlayerBotCollisions(player, bots) {
        if (!player) return null;

        for (const bot of bots) {
            if (bot.hp <= 0) continue;

            const dist = Math.hypot(bot.x - player.x, bot.y - player.y);
            if (dist < 30) {
                if (player.hp > bot.hp) {
                    bot.hp = -1;
                    player.addXp(bot.totalXp || 0);
                    return { killed: bot, killer: player };
                }
            }
        }

        return null;
    }
}