import { ServerBullet } from '../entities/bullet.js';

export class CollisionSystem {
    constructor() {
        this._targetBuf = [];
    }

    checkBulletCollisions(bullets, monsters, players, bots, bosses) {
        for (const b of bullets) {
            if (b.ownerType === 'monster' || b.ownerType === 'boss') {
                this.checkEnemyBullet(b, players, bots);
                continue;
            }

            if (b.wtype === 'laser') {
                this.checkLaserCollisions(b, monsters, bosses, players, bots);
                continue;
            }

            if (b.wtype === 'poison') {
                this.checkPoisonCollisions(b, monsters, bosses, players, bots);
                continue;
            }

            const allTargets = this._getBulletTargets(b, monsters, bots);
            this.checkBulletVsMonsters(b, allTargets, players, bots);

            if (bosses) {
                this.checkBulletVsBosses(b, bosses, players);
            }

            if (b.isExplosive && b.explosionRadius > 0 && b.life <= 0 && !b.hasExploded) {
                this.handleExplosion(b, monsters, bosses, players, bots);
            }
        }
    }

    _getBulletTargets(b, monsters, bots) {
        if (b.ownerType === 'monster' || b.ownerType === 'boss') return monsters;
        if (!bots || bots.length === 0) return monsters;

        this._targetBuf.length = 0;
        for (const m of monsters) this._targetBuf.push(m);
        for (const bot of bots) {
            if (bot.hp > 0 && bot !== b.ownerEntity) this._targetBuf.push(bot);
        }
        return this._targetBuf;
    }

    checkEnemyBullet(b, players, bots) {
        for (const player of players) {
            if (!player || player.hp <= 0 || b.hit.has(player)) continue;
            const dist = Math.hypot(b.x - player.x, b.y - player.y);
            if (dist < b.sz * 10 + 10) {
                player.takeDamage(b.dmg);
                b.hit.add(player);
                if (b.isMine) b.life = -1;
            }
        }

        for (const bot of bots) {
            if (!bot || bot.hp <= 0 || b.hit.has(bot)) continue;
            const dist = Math.hypot(b.x - bot.x, b.y - bot.y);
            if (dist < b.sz * 10 + 10) {
                bot.takeDamage(b.dmg * 0.4);
                b.hit.add(bot);
                if (b.isMine) b.life = -1;
            }
        }
    }

    checkBulletVsMonsters(b, monsters, players, bots) {
        for (const m of monsters) {
            if (m.hp <= 0) continue;
            if (b.hit.has(m)) continue;
            if (b.ownerEntity === m) continue;

            const targetRadius = m.isBot ? 20 : (m.sz ?? 20);
            const hitR = b.wtype === 'sword'
                ? targetRadius * 0.75 + b.sz * 60
                : b.wtype === 'knife'
                    ? targetRadius * 0.75 + b.sz * 7
                    : targetRadius * 0.75 + b.sz * 3;

            const dist = Math.hypot(b.x - m.x, b.y - m.y);
            if (dist < hitR) {
                if (m.isBot) {
                    const pvpDmg = b.dmg * 0.35;
                    m.takeDamage(pvpDmg, b.ownerEntity);
                    b.hit.add(m);
                    if (m.botAI?.onDamageTaken) m.botAI.onDamageTaken(pvpDmg, b.ownerEntity);
                    if (!['sword', 'poison'].includes(b.wtype)) break;
                    continue;
                }

                const finalDmg = this.calculateDamage(b, m);
                m.takeDamage(finalDmg, b.ownerEntity);
                this.trackDamage(b, finalDmg);
                b.hit.add(m);

                if (b.bounces > 0 && b.life > 0) {
                    this.handleBounce(b, m);
                }

                b.onHit();

                if (b.isExplosive && b.explosionRadius > 0 && !b.hasExploded) {
                    b.life = -1;
                }

                if (!['sword', 'poison'].includes(b.wtype)) break;
            }
        }
    }

    checkBulletVsBosses(b, bosses, players) {
        for (const boss of bosses) {
            if (boss.hp <= 0) continue;
            if (b.hit.has(boss)) continue;

            const hitR = boss.sz * 0.8 + b.sz * 3;
            const dist = Math.hypot(b.x - boss.x, b.y - boss.y);
            if (dist < hitR) {
                const finalDmg = this.calculateDamage(b, boss);
                boss.takeDamage(finalDmg, b.ownerEntity);
                this.trackDamage(b, finalDmg);
                b.hit.add(boss);
                if (b.bounces > 0 && b.life > 0) b.bounces--;
                b.onHit();
                if (b.isExplosive && !b.hasExploded) b.life = -1;
                break;
            }
        }
    }

    checkLaserCollisions(b, monsters, bosses, players, bots = []) {
        if (!b.ownerEntity) return;
        const owner = b.ownerEntity;
        const ownerX = owner.x;
        const ownerY = owner.y;
        const angle = b.laserAngle || 0;
        const range = b.laserRange || 350;
        const halfWidth = (b.laserWidth || 18) / 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        for (const m of monsters) {
            if (m.hp <= 0 || b.hit.has(m)) continue;
            const dx = m.x - ownerX;
            const dy = m.y - ownerY;
            const localX = dx * cosA + dy * sinA;
            const localY = -dx * sinA + dy * cosA;
            const targetR = m.isBot ? 20 : (m.sz ?? 20);
            if (localX > 0 && localX < range && Math.abs(localY) < halfWidth + targetR * 0.5) {
                const finalDmg = this.calculateDamage(b, m);
                m.takeDamage(finalDmg, owner);
                this.trackDamage(b, finalDmg);
                b.hit.add(m);
            }
        }

        if (bots && b.ownerType !== 'monster' && b.ownerType !== 'boss') {
            for (const bot of bots) {
                if (bot.hp <= 0 || bot === owner || b.hit.has(bot)) continue;
                const dx = bot.x - ownerX;
                const dy = bot.y - ownerY;
                const localX = dx * cosA + dy * sinA;
                const localY = -dx * sinA + dy * cosA;
                if (localX > 0 && localX < range && Math.abs(localY) < halfWidth + 20 * 0.5) {
                    const laserDmg = b.dmg * 0.35;
                    bot.takeDamage(laserDmg, owner);
                    if (bot.botAI?.onDamageTaken) bot.botAI.onDamageTaken(laserDmg, owner);
                    b.hit.add(bot);
                }
            }
        }

        if (bosses) {
            for (const boss of bosses) {
                if (boss.hp <= 0 || b.hit.has(boss)) continue;
                const dx = boss.x - ownerX;
                const dy = boss.y - ownerY;
                const localX = dx * cosA + dy * sinA;
                const localY = -dx * sinA + dy * cosA;
                if (localX > 0 && localX < range && Math.abs(localY) < halfWidth + boss.sz * 0.5) {
                    const finalDmg = this.calculateDamage(b, boss);
                    boss.takeDamage(finalDmg, owner);
                    this.trackDamage(b, finalDmg);
                    b.hit.add(boss);
                }
            }
        }
    }

    checkPoisonCollisions(b, monsters, bosses, players, bots = []) {
        const poisonRange = b.sz * 120;

        for (const m of monsters) {
            if (m.hp <= 0) continue;
            const dist = Math.hypot(m.x - b.x, m.y - b.y);
            if (dist < poisonRange) {
                if (!b.hit.has(m)) {
                    const finalDmg = this.calculateDamage(b, m);
                    m.takeDamage(finalDmg, b.ownerEntity);
                    this.trackDamage(b, finalDmg);
                    b.hit.add(m);
                }
                if (b.lingerDmg > 0) b.refreshLingerTarget(m);
            } else if (b.lingerDmg > 0 && b.hit.has(m)) {
                b.addLingerTarget(m);
            }
        }

        if (bosses) {
            for (const boss of bosses) {
                if (boss.hp <= 0) continue;
                const dist = Math.hypot(boss.x - b.x, boss.y - b.y);
                if (dist < poisonRange) {
                    if (!b.hit.has(boss)) {
                        const finalDmg = this.calculateDamage(b, boss);
                        boss.takeDamage(finalDmg, b.ownerEntity);
                        this.trackDamage(b, finalDmg);
                        b.hit.add(boss);
                    }
                    if (b.lingerDmg > 0) b.refreshLingerTarget(boss);
                }
            }
        }

        if (bots && b.ownerType && b.ownerType !== 'monster' && b.ownerType !== 'boss') {
            for (const bot of bots) {
                if (bot.hp <= 0 || bot === b.ownerEntity) continue;
                const dist = Math.hypot(bot.x - b.x, bot.y - b.y);
                if (dist < poisonRange) {
                    const poisonDmg = b.dmg * 0.35;
                    bot.takeDamage(poisonDmg, b.ownerEntity);
                    if (bot.botAI?.onDamageTaken) bot.botAI.onDamageTaken(poisonDmg, b.ownerEntity);
                }
            }
        }
    }

    handleExplosion(b, monsters, bosses, players, bots = []) {
        b.hasExploded = true;
        const radius = b.explosionRadius;

        for (const m of monsters) {
            if (m.hp <= 0) continue;
            const dist = Math.hypot(m.x - b.x, m.y - b.y);
            if (dist < radius) {
                const falloff = 1 - (dist / radius) * 0.5;
                const explosionDmg = b.dmg * falloff;
                m.takeDamage(explosionDmg, b.ownerEntity);
                this.trackDamage(b, explosionDmg);
            }
        }

        if (bots && b.ownerType && b.ownerType !== 'monster' && b.ownerType !== 'boss') {
            for (const bot of bots) {
                if (bot.hp <= 0 || bot === b.ownerEntity) continue;
                const dist = Math.hypot(bot.x - b.x, bot.y - b.y);
                if (dist < radius) {
                    const falloff = 1 - (dist / radius) * 0.5;
                    const explosionDmg = b.dmg * falloff * 0.35;
                    bot.takeDamage(explosionDmg, b.ownerEntity);
                    if (bot.botAI?.onDamageTaken) bot.botAI.onDamageTaken(explosionDmg, b.ownerEntity);
                }
            }
        }

        if (bosses) {
            for (const boss of bosses) {
                if (boss.hp <= 0) continue;
                const dist = Math.hypot(boss.x - b.x, boss.y - b.y);
                if (dist < radius) {
                    const falloff = 1 - (dist / radius) * 0.5;
                    const explosionDmg = b.dmg * falloff;
                    boss.takeDamage(explosionDmg, b.ownerEntity);
                    this.trackDamage(b, explosionDmg);
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
                Math.cos(angle) * spd,
                Math.sin(angle) * spd,
                Math.round(b.dmg * 1.2),
                b.ownerId,
                b.wtype,
                b.sz,
                0,
                999999,
                b.col
            );
            newBullet.ownerType = b.ownerType;
            newBullet.ownerEntity = b.ownerEntity;
            newBullet.life = 1.0;
            newBullet.hit.add(hitMonster);
            b._spawnQueue.push(newBullet);
        }
    }

    calculateDamage(b, target) {
        let dmg = b.dmg;
        const owner = b.ownerEntity;
        if (owner) {
            const critChance = owner.critChance || 0;
            const critDamage = owner.critDamage || 200;
            if (critChance > 0 && Math.random() * 100 < critChance) {
                dmg *= (critDamage / 100);
            }
        }
        return dmg;
    }

    trackDamage(b, dmg) {
        const owner = b.ownerEntity;
        if (owner && owner.totalDmg !== undefined) {
            owner.totalDmg += dmg;
        }
    }

    checkMonsterPlayerCollisions(monsters, players, dt) {
        for (const player of players) {
            if (!player || player.hp <= 0) continue;
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
            if (monsterCount > 1) totalDamage *= 1 + (monsterCount - 1) * 0.3;
            if (totalDamage > 0) player.takeDamage(totalDamage);
        }
    }

    checkMonsterBotCollisions(monsters, bots, dt) {
        for (const bot of bots) {
            if (!bot || bot.hp <= 0) continue;
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
            if (monsterCount > 1) totalDamage *= 1 + (monsterCount - 1) * 0.3;
            if (totalDamage > 0) bot.takeDamage(totalDamage * 0.4);
        }
    }

    checkBossPlayerCollisions(bosses, players, dt) {
        for (const player of players) {
            if (!player || player.hp <= 0) continue;
            for (const boss of bosses) {
                if (boss.hp <= 0) continue;
                const dist = Math.hypot(boss.x - player.x, boss.y - player.y);
                const collisionDist = boss.sz * 0.8 + 20;
                if (dist < collisionDist) player.takeDamage(boss.dmg * dt * 3);
            }
        }
    }

    checkBossBotCollisions(bosses, bots, dt) {
        for (const bot of bots) {
            if (!bot || bot.hp <= 0) continue;
            for (const boss of bosses) {
                if (boss.hp <= 0) continue;
                const dist = Math.hypot(boss.x - bot.x, boss.y - bot.y);
                const collisionDist = boss.sz * 0.8 + 20;
                if (dist < collisionDist) bot.takeDamage(boss.dmg * dt * 3 * 0.4);
            }
        }
    }

    checkPlayerBotCollisions(players, bots) {
        for (const player of players) {
            if (!player || player.hp <= 0) continue;
            for (const bot of bots) {
                if (!bot || bot.hp <= 0) continue;
                const dist = Math.hypot(bot.x - player.x, bot.y - player.y);
                if (dist < 28) {
                    if (player.hp > 0) {
                        const dmg = 8 * 0.35;
                        bot.takeDamage(dmg);
                        if (bot.hp <= 0) {
                            player.addXp(Math.floor((bot.totalXp || 0) * 0.3));
                            return { killed: bot, killer: player };
                        }
                    }
                }
            }
        }
        return null;
    }

    checkBotBulletVsPlayer(bullets, players, bots) {
        const PVP_MULT = 0.35;
        const PLAYER_R = 22;
        const BOT_R = 20;

        for (const b of bullets) {
            if (b.ownerType === 'monster' || b.ownerType === 'boss') continue;
            if (!b.ownerEntity?.isBot) continue;

            for (const player of players) {
                if (!player || player.hp <= 0 || b.hit.has(player) || b.ownerEntity === player) continue;
                const dist = Math.hypot(b.x - player.x, b.y - player.y);
                const hitR = PLAYER_R + b.sz * 3;
                if (dist < hitR) {
                    player.takeDamage(b.dmg * PVP_MULT, b.ownerEntity);
                    b.hit.add(player);
                    if (b.isMine) b.life = -1;
                }
            }

            const pvpTarget = b.ownerEntity?.botAI?.getPvpTarget?.();
            if (!pvpTarget || pvpTarget.hp <= 0) continue;
            if (b.hit.has(pvpTarget)) continue;
            if (!pvpTarget.isBot) continue;
            const dist2 = Math.hypot(b.x - pvpTarget.x, b.y - pvpTarget.y);
            const hitR2 = BOT_R + b.sz * 3;
            if (dist2 < hitR2) {
                pvpTarget.takeDamage(b.dmg * PVP_MULT, b.ownerEntity);
                b.hit.add(pvpTarget);
                if (b.isMine) b.life = -1;
                if (pvpTarget.botAI?.onDamageTaken) pvpTarget.botAI.onDamageTaken(b.dmg * PVP_MULT, b.ownerEntity);
            }
        }
    }

    checkPlayerBulletVsBots(bullets, players, bots) {
        const PVP_MULT = 0.35;
        const BOT_RADIUS = 20;

        for (const b of bullets) {
            if (!b.ownerEntity || b.ownerType === 'monster' || b.ownerType === 'boss') continue;
            if (b.ownerEntity.isBot) continue;

            for (const bot of bots) {
                if (!bot || bot.hp <= 0) continue;
                if (b.hit.has(bot)) continue;
                const dist = Math.hypot(b.x - bot.x, b.y - bot.y);
                const hitR = BOT_RADIUS + b.sz * 3;
                if (dist < hitR) {
                    const dmg = b.dmg * PVP_MULT;
                    bot.takeDamage(dmg, b.ownerEntity);
                    b.hit.add(bot);
                    if (b.isMine) b.life = -1;
                    if (bot.botAI?.onDamageTaken) bot.botAI.onDamageTaken(dmg, b.ownerEntity);
                }
            }
        }
    }
}
