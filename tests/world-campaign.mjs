import fs from 'node:fs';
import { runCampaign } from './harness.mjs';

const classes = process.env.QA_CLASSES?.split(',') || ['warrior', 'archer', 'mage', 'berserker', 'pyromancer', 'assassin', 'necromancer', 'paladin', 'warlock', 'druid'];
const seeds = (process.env.QA_SEEDS || '11,47').split(',').map(Number);
const results = [];
for (const classId of classes) for (const seed of seeds) {
  const result = await runCampaign({ classId, seed, maxTime: Number(process.env.QA_MAX_TIME || 1800), waitForBosses: process.env.QA_WAIT_BOSSES === '1' });
  results.push(result);
  console.log(JSON.stringify(result));
}
fs.mkdirSync('output/test-results', { recursive: true });
fs.writeFileSync(process.env.QA_WAIT_BOSSES === '1' ? 'output/test-results/world-boss-campaigns.json' : 'output/test-results/world-campaigns.json', JSON.stringify(results, null, 2));
if (results.some(result => result.state !== 'victory' || result.worldId !== 2 || result.worldTime < 480 || result.stages.length !== 3 || Object.keys(result.archetypes).length !== 3 || Object.keys(result.archetypeKills).length !== 3 || Object.values(result.archetypeKills).some(kills => Object.keys(kills).length !== 3) || (result.waitForBosses && (result.stats.bossesDefeated !== 9 || Object.values(result.encounters).some(encounters => Object.keys(encounters).length !== 3))))) process.exitCode = 1;
