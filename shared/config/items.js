// Common items retain the original per-stack values. Quality belongs to each
// acquired stack, so a rare drop never upgrades previously collected copies.
export const ITEM_RARITIES = Object.freeze([
    { id: 0, key: 'common', name: 'ZWYKŁY', power: 1, col: '#65716b', bg: '#f2f5f2', border: '#9aa69f', weight: 76, rareWeight: 45 },
    { id: 1, key: 'uncommon', name: 'NIEPOSPOLITY', power: 1.15, col: '#278345', bg: '#eaf7e9', border: '#65a36c', weight: 18, rareWeight: 30 },
    { id: 2, key: 'rare', name: 'RZADKI', power: 1.35, col: '#3268c5', bg: '#eaf1ff', border: '#7399dc', weight: 5, rareWeight: 18 },
    { id: 3, key: 'epic', name: 'EPICKI', power: 1.6, col: '#8e46b9', bg: '#f4eafd', border: '#b17bd0', weight: .9, rareWeight: 6 },
    { id: 4, key: 'legendary', name: 'LEGENDARNY', power: 2, col: '#ac6b0c', bg: '#fff3d6', border: '#d6a443', weight: .1, rareWeight: 1 }
].map(Object.freeze));

export const ITEMS = {
    magnet: { name: 'Magnes', icon: 'magnet', desc: '+45 zasięgu zbierania', max: 5, weight: 14, stats: { magnetRange: 45 } },
    clover: { name: 'Koniczyna', icon: 'clover', desc: '+8 szczęścia', max: 5, weight: 12, stats: { luck: 8 } },
    armor: { name: 'Pancerna łuska', icon: 'armor', desc: '+7% pancerza', max: 5, weight: 14, stats: { armor: 7 } },
    ember: { name: 'Żar', icon: 'ember', desc: '+10% obrażeń', max: 5, weight: 16, stats: { damageBonus: 10 } },
    hourglass: { name: 'Klepsydra', icon: 'hourglass', desc: '−5% czasu odnowienia', max: 5, weight: 12, stats: { cooldownReduction: 5 } },
    heart: { name: 'Żywy kryształ', icon: 'heart', desc: '+18 maks. HP i 18 leczenia', max: 5, weight: 14, stats: { maxHp: 18 } },
    prism: { name: 'Pryzmat', icon: 'prism', desc: '+8% obszaru i rozmiaru pocisków', max: 5, weight: 10, stats: { areaBonus: 8, projectileSizeBonus: 8 } },
    fang: { name: 'Kieł', icon: 'fang', desc: '+4% szansy i +8% siły krytyka', max: 5, weight: 8, stats: { critChance: 4, critDamage: 8 } }
};

export const EVOLUTIONS = {
    fireball: { item: 'ember', name: 'Inferno', stats: { dmg: 1.4 }, add: { bCnt: 2 } },
    bow: { item: 'prism', name: 'Rozszczepienie', stats: { dmg: 1.25 }, add: { bCnt: 2 } },
    lightning: { item: 'clover', name: 'Burza', stats: { dmg: 1.35 }, add: { chain: 2 } },
    axe: { item: 'armor', name: 'Kataklizm', stats: { dmg: 1.4, bSz: 1.25 } },
    sword: { item: 'fang', name: 'Wir ostrzy', stats: { dmg: 1.35, orbit: 1.15 }, add: { count: 1 } },
    knife: { item: 'fang', name: 'Grad ostrzy', stats: { dmg: 1.3 }, add: { bCnt: 2, pierce: 1 } },
    poison: { item: 'magnet', name: 'Zaraza', stats: { dmg: 1.5, range: 1.25 } },
    aura: { item: 'heart', name: 'Słoneczna korona', stats: { dmg: 1.5, range: 1.25 } },
    laser: { item: 'hourglass', name: 'Promień osobliwości', stats: { dmg: 1.5, width: 1.3 } },
    meteor: { item: 'ember', name: 'Deszcz gwiazd', stats: { dmg: 1.35 }, add: { bCnt: 2 } }
};
