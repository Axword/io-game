import { norm } from '../utils/math.js';

export class CollisionSystem {
    checkBulletCollisions(bullets, monsters, player, bots, bosses) {
        for (const b of bullets) {
            if (b.owner === 'monster' || b.owner === 'boss') {
                if (player && !b.hit.has(player)) {
                    const dist = Math.hypot(b.x - player.x, b.y - player.y);
                    if (dist < b.sz * 10 + 10) {
                        player.takeDamage(b.dmg);
                        b.hit.add(player);
                        if (b.isMine) {
                            b.life = -1;
                        }
                    }
                }
                
                for (const bot of bots) {
                    if (!b.hit.has(bot)) {
                        const dist = Math.hypot(b.x - bot.x, b.y - bot.y);
                        if (dist < b.sz * 10 + 10) {
                            bot.takeDamage(b.dmg);
                            b.hit.add(bot);
                            if (b.isMine) {
                                b.life = -1;
                            }
                        }
                    }
                }
                continue;
            }
            
            // Pociski graczy/botów trafiają potwory
            for (const m of monsters) {
                if (b.hit.has(m)) continue;
                
                const hitR = (m.sz * 0.75) + (b.sz * 3);
                if (Math.hypot(b.x - m.x, b.y - m.y) < hitR) {
                    m.takeDamage(b.dmg);
                    if (b.owner === 'player' && player) {
                        player.totalDmg += b.dmg;
                    }
                    b.hit.add(m);
                    b.onHit();
                    
                    if (b.bounces > 0 && b.life > 0) {
                        b.bounces--;
                        const next = monsters.find(mm => 
                            !b.hit.has(mm) && 
                            Math.hypot(mm.x - b.x, mm.y - b.y) < 350
                        );
                        
                        if (next) {
                            const [nx, ny] = norm(next.x - b.x, next.y - b.y);
                            const spd = Math.hypot(b.vx, b.vy);
                            b.vx = nx * spd;
                            b.vy = ny * spd;
                        } else {
                            b.life = -1;
                        }
                    }
                    break;
                }
            }
            
            // Pociski trafiają bossów
            if (bosses) {
                for (const boss of bosses) {
                    if (b.hit.has(boss)) continue;
                    
                    const hitR = boss.sz * 0.8 + (b.sz * 3);
                    if (Math.hypot(b.x - boss.x, b.y - boss.y) < hitR) {
                        boss.takeDamage(b.dmg);
                        if (b.owner === 'player' && player) {
                            player.totalDmg += b.dmg;
                        }
                        b.hit.add(boss);
                        b.onHit();
                        break;
                    }
                }
            }
        }
    }
    
checkMonsterPlayerCollisions(monsters, player, dt) {
    if (!player) return;
    
    let totalDamage = 0;
    let monsterCount = 0;
    
    for (const m of monsters) {
        if (m.isPeaceful) continue;
        
        const dist = Math.hypot(m.x - player.x, m.y - player.y);
        const collisionDist = m.sz * 0.8 + 15;
        
        if (dist < collisionDist) {
            totalDamage += m.dmg * dt * 2.5;
            monsterCount++;
        }
    }
    
    if (monsterCount > 1) {
        const multiplier = 1 + (monsterCount - 1) * 0.3;
        totalDamage *= multiplier;
    }
    
    if (totalDamage > 0) {
        player.takeDamage(totalDamage);
    }
}

checkMonsterBotCollisions(monsters, bots, dt) {
    for (const bot of bots) {
        let totalDamage = 0;
        let monsterCount = 0;
        
        for (const m of monsters) {
            if (m.isPeaceful) continue;
            
            const dist = Math.hypot(m.x - bot.x, m.y - bot.y);
            const collisionDist = m.sz * 0.8 + 15;
            
            if (dist < collisionDist) {
                totalDamage += m.dmg * dt * 2.5;
                monsterCount++;
            }
        }
        
        if (monsterCount > 1) {
            const multiplier = 1 + (monsterCount - 1) * 0.3;
            totalDamage *= multiplier;
        }
        
        if (totalDamage > 0) {
            bot.takeDamage(totalDamage);
        }
    }
}
    
    checkBossPlayerCollisions(bosses, player, dt) {
        if (!player || !bosses) return;
        
        for (const boss of bosses) {
            const dist = Math.hypot(boss.x - player.x, boss.y - player.y);
            const collisionDist = boss.sz * 0.8 + 20;
            
            if (dist < collisionDist) {
                player.takeDamage(boss.dmg * dt * 3);
            }
        }
    }
    
    checkBossBotCollisions(bosses, bots, dt) {
        if (!bosses) return;
        
        for (const bot of bots) {
            for (const boss of bosses) {
                const dist = Math.hypot(boss.x - bot.x, boss.y - bot.y);
                const collisionDist = boss.sz * 0.8 + 20;
                
                if (dist < collisionDist) {
                    bot.takeDamage(boss.dmg * dt * 3);
                }
            }
        }
    }
    
    checkPlayerBotCollisions(player, bots) {
        if (!player) return null;
        
        for (const bot of bots) {
            const dist = Math.hypot(bot.x - player.x, bot.y - player.y);
            if (dist < 30) {
                if (player.hp > bot.hp) {
                    bot.hp = -1;
                    player.addXp(bot.totalXp);
                    return { killed: bot, killer: player };
                }
            }
        }
        
        return null;
    }
}