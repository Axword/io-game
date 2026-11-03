import { writeFileSync } from 'node:fs';
const icons = {
  armor: `<path fill="#64c9ff" d="M32 7 52 15v16c0 12-9 21-20 26C21 52 12 43 12 31V15Z"/><path fill="#bdeaff" d="M32 14 45 19v12c0 8-5 14-13 19Z"/><path fill="none" d="m22 31 7 7 14-16"/>`,
  bow: `<path fill="none" stroke="#ffd74c" stroke-width="7" d="M16 10c33 4 33 40 0 44"/><path fill="none" d="m16 10 9 22-9 22M8 32h44"/><path fill="#8ae4ff" d="m46 24 12 8-12 8Z"/>`,
  lightning: `<path fill="#ffe345" d="M35 5 12 36h17l-3 23 26-34H35l5-20Z"/><path stroke="#fff6a4" stroke-width="2" d="m33 17-12 16h12"/>`,
  axe: `<path stroke="#8a5648" stroke-width="8" d="m14 53 30-38"/><path fill="#c3e4f5" d="m27 12 11 9 9 8c9-6 13-14 10-22-9 4-17 5-30 5Z"/><path fill="#8bc6e5" d="m38 21 9 8c-2 9-9 13-17 12 2-8 4-15 8-20Z"/>`,
  ember: `<path fill="#ff7b19" d="M34 6c4 14 20 19 17 35C49 53 39 58 28 55 12 53 8 37 16 26c0 9 4 11 8 13C18 24 34 20 34 6Z"/><path fill="#ffe43d" d="M34 31c-1 10 9 9 9 17-5 9-19 8-20-3-1-6 5-11 11-14Z"/>`,
  knife: `<path fill="#c4edff" d="m17 38 5-14L55 7 43 40 29 45Z"/><path fill="none" d="m22 40 24-24"/><path fill="#ffbe48" d="m11 34 22 20 5-6-22-20Z"/><path fill="#866156" d="m8 49 8-10 10 9-8 11Z"/>`,
  laser: `<path fill="#d078ff" d="M8 26h16v12H8Z"/><path fill="#f0c4ff" d="m24 20 12 6v12l-12 6Z"/><path stroke="#ed58ff" stroke-width="6" d="M36 32h21"/><path fill="none" stroke="#ffe6ff" stroke-width="2" d="M36 32h21M45 17v5m0 20v5"/>`,
  poison: `<path fill="#ab75ed" d="M23 7h18v9H23Z"/><path fill="#79e678" d="M26 16v10L13 45c-4 6 0 12 7 12h24c7 0 11-6 7-12L38 26V16Z"/><path fill="#b9ff8d" d="M19 40h26l6 10c1 3-2 7-7 7H20c-5 0-8-4-7-7Z"/><circle fill="#4ba44c" cx="28" cy="46" r="3"/><path fill="none" d="M33 32h1"/>`,
  meteor: `<path fill="#ff7b19" d="m9 30 9-3 2-14 12 6L55 5l-8 27-8 9Z"/><circle fill="#ffb22f" cx="25" cy="42" r="17"/><path fill="#ffe34c" d="m18 32 13-2 9 11-8 12-14-3-5-10Z"/>`,
  sword: `<path fill="#bce7ff" d="m32 5 9 13-4 23H27l-4-23Z"/><path stroke="#fff" stroke-width="2" d="M32 12v25"/><path fill="#ffcf4b" d="M15 37h34v8H15Z"/><path fill="#8f6970" d="M27 45h10v12H27Z"/>`,
  aura: `<circle fill="#c4edff" cx="32" cy="32" r="15"/><path fill="none" stroke="#48bbef" stroke-width="6" d="M17 12A25 25 0 0 1 54 44M47 52A25 25 0 0 1 10 20"/><path fill="#ffe345" d="m32 20 4 8 9 4-9 4-4 9-4-9-9-4 9-4Z"/>`,
  heart: `<path fill="#ff6d84" d="M32 56 10 34C-2 18 18 4 32 20 46 4 66 18 54 34Z"/><path fill="none" stroke="#ffc2c8" stroke-width="3" d="M13 23c1-5 7-7 11-3"/>`,
  speed: `<path fill="#8be6ff" d="m33 7 13 7-7 15 17 8-5 12-18-9-7 16H11l12-27Z"/><path fill="none" d="M8 17h13M5 28h12M4 40h9"/>`,
  hourglass: `<path fill="#a9dfff" d="M18 12h28v8c0 6-9 12-9 12s9 6 9 12v8H18v-8c0-6 9-12 9-12s-9-6-9-12Z"/><path fill="#ffe36b" d="m21 19 11 11 11-11M21 49l11-11 11 11Z"/><path fill="none" stroke="#966ce4" stroke-width="7" d="M14 9h36M14 55h36"/>`,
  magnet: `<path fill="#fb7c8c" d="M10 10h14v24c0 12 16 12 16 0V10h14v24c0 31-44 31-44 0Z"/><path fill="#bdeaff" d="M10 10h14v12H10ZM40 10h14v12H40Z"/>`,
  critical: `<circle fill="#faf4e2" cx="30" cy="34" r="22"/><circle fill="#ff7c6e" cx="30" cy="34" r="14"/><circle fill="#ffe35b" cx="30" cy="34" r="5"/><path fill="none" d="m30 34 23-23M43 11h10v10"/>`,
  damage: `<path fill="#ffbe40" d="m32 5 6 17 16-7-7 17 14 9-19 2-2 16-11-13-15 10 3-18-13-8 18-5Z"/><path fill="#ff7860" d="m32 22 11 14-12 11-11-14Z"/>`,
  prism: `<path fill="#ad71f0" d="m32 6 22 17-7 29H17l-7-29Z"/><path fill="#d59bff" d="m32 6 9 20-9 26-9-26Z"/><path fill="none" d="M10 23h44M17 52l6-26m24 26-6-26"/>`,
  clover: `<path fill="#6dde8b" d="M31 30C8 37 3 18 14 13c8-4 15 1 17 8C27-1 48 1 51 13c2 8-4 13-12 15 22-3 23 18 11 22-8 2-15-4-17-12 0 14-9 20-17 13-9-9-3-19 15-21Z"/><path fill="none" stroke="#286b50" d="m33 32-4 26"/>`,
  revival: `<path fill="none" stroke="#ffcf4b" stroke-width="7" d="M47 17A23 23 0 1 0 54 41"/><path fill="#ffe470" d="M34 17h20V3"/><path fill="#97e7dc" d="M27 23h10v9h9v10h-9v9H27v-9h-9V32h9Z"/>`,
  fang: `<path fill="#fff6ce" d="M13 12c4 24 6 35 18 47 3-18 8-24 20-42-13 9-24 2-38-5Z"/><path fill="none" stroke="#dcaa67" stroke-width="3" d="M21 22c2 12 4 18 8 24"/>`,
  chest: `<path fill="#c68c4d" d="M8 28h48v26H8Z"/><path fill="#f3c26f" d="M8 28V17c0-8 48-8 48 0v11Z"/><path fill="#ffe46c" d="M16 12h8v42h-8ZM40 12h8v42h-8Z"/><path fill="#6d65a5" d="M26 25h12v15H26Z"/><path stroke="#ffe46c" stroke-width="3" d="M32 30v5"/>`,
  book: `<path fill="#b58ce8" d="M12 10h36v45H12c-6 0-6-10 0-10h36"/><path fill="#fff2cf" d="M13 45h35v10H13c-6 0-6-10 0-10Z"/><path fill="#ffe367" d="m30 18 4 7 8 2-6 6 1 9-7-4-7 4 1-9-6-6 8-2Z"/>`,
  chain: `<path fill="none" stroke="#a0d5ec" stroke-width="10" d="m30 18 6-6a11 11 0 0 1 16 16l-8 8M34 46l-6 6a11 11 0 0 1-16-16l8-8"/><path fill="none" d="m23 41 18-18"/>`,
  bounce: `<path fill="none" stroke="#ad7fe9" stroke-width="7" d="m10 49 16-16 12 10 16-27"/><path fill="#cba8f6" d="M40 16h14v15"/>`,
  projectileCount: `<path fill="#7bdbff" d="m9 12 14 7-14 7Zm0 26 14 7-14 7Zm25-13 18 8-18 9Z"/><path fill="none" d="M4 19h3m-3 26h3m16-12h9"/>`
};
const aliases = {fireball:'ember', vitality:'heart', regeneration:'heart', cooldown:'hourglass', duration:'hourglass', area:'aura', luck:'clover', range:'laser', explosion:'damage', critChance:'critical', critDamage:'critical', attackSpeed:'lightning', projectileSpeed:'speed', projectileSize:'prism', pierce:'knife', bookPower:'book'};
for (const [key, value] of Object.entries(aliases)) icons[key] = icons[value];
for (const [key, body] of Object.entries(icons)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#27233b" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`;
  writeFileSync(new URL(`./${key}.svg`, import.meta.url), svg);
}
console.log(`Created ${Object.keys(icons).length} original geometric SVG icons.`);
