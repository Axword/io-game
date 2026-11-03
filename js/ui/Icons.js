// Original geometric artwork. Each icon uses the same grid, outline and palette.
const KEYS = new Set(['armor','bow','lightning','axe','ember','knife','laser','poison','meteor','sword','aura','heart','speed','hourglass','magnet','critical','damage','prism','clover','revival','fang','chest','book','chain','bounce','projectileCount','fireball','vitality','regeneration','cooldown','duration','area','luck','range','explosion','critChance','critDamage','attackSpeed','projectileSpeed','projectileSize','pierce','bookPower']);
const ALIASES = { warrior:'armor', archer:'bow', mage:'prism', berserker:'axe', pyromancer:'ember', assassin:'knife', necromancer:'poison', paladin:'sword', warlock:'laser', druid:'meteor', '❤️':'heart', '💚':'regeneration', '💨':'speed', '⚡':'lightning', '🎯':'critical', '💥':'damage', '💥💥':'critical', '🛡️':'armor', '⏰':'hourglass', '⏱️':'hourglass', '🧲':'magnet', '💫':'aura', '🍀':'clover', '👼':'revival', '🏹':'bow', '🪓':'axe', '🔥':'ember', '🔪':'knife', '⚔️':'sword', '📡':'laser', '☠️':'poison', '☄️':'meteor', '🔮':'prism', '🔱':'knife', '🔄':'bounce', '⛓️':'chain', '🚀':'speed', '⬤':'prism', '💣':'damage' };
export function resolveIconKey(key) { return KEYS.has(key) ? key : (ALIASES[key] || 'book'); }
export function iconUrl(key) { return new URL(`../../assets/icons/${resolveIconKey(key)}.svg`, import.meta.url).href; }
export function iconMarkup(key, className = 'game-icon') {
    const safeClass = String(className).replace(/[^a-zA-Z0-9_ -]/g, '');
    return `<img class="${safeClass}" src="${iconUrl(key)}" alt="" aria-hidden="true" draggable="false">`;
}
export const ICON_KEYS = Object.freeze([...KEYS]);
