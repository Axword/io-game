import fs from 'node:fs';
import { runSolo } from './harness.mjs';

const requested = process.env.QA_CLASSES?.split(',') || ['warrior', 'archer', 'mage', 'berserker', 'pyromancer', 'assassin', 'necromancer', 'paladin', 'warlock', 'druid'];
const seeds = (process.env.QA_SEEDS || '11,47').split(',').map(Number);
const results = [];
for (const classId of requested) for (const seed of seeds) {
  const result = await runSolo({ classId, seed, maxTime: Number(process.env.QA_MAX_TIME || 720) });
  results.push(result);
  console.log(JSON.stringify(result));
}
fs.mkdirSync('output/test-results', { recursive: true });
fs.writeFileSync('output/test-results/solo-runs.json', JSON.stringify(results, null, 2));
if (results.some(r => r.state !== 'victory' || r.stats?.bossesDefeated !== 3 || r.time < 480 || !r.stats?.chestsOpened)) process.exitCode = 1;
