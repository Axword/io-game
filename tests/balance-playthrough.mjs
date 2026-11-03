import fs from 'node:fs';
import { runCampaign } from './harness.mjs';

const classes = process.env.QA_CLASSES?.split(',') || ['warrior', 'archer', 'warlock', 'pyromancer'];
const runs = [];
for (const classId of classes) {
    const result = await runCampaign({ classId, seed: 11, maxTime: Number(process.env.QA_MAX_TIME || 3600) });
    runs.push(result);
    console.log(JSON.stringify(result));
    if (!['dead', 'victory', 'playing', 'upgrade', 'loot', 'loot-opening'].includes(result.state)) throw new Error(`Invalid game state: ${result.state}`);
    if (!Number.isFinite(result.hp + result.time + result.level)) throw new Error('Non-finite gameplay');
}
fs.mkdirSync('output/test-results', { recursive: true });
fs.writeFileSync('output/test-results/restored-balance-runs.json', JSON.stringify({
    criterion: 'Natural production updates, input-only movement and actually offered cards. Death is an expected outcome; not every automated attempt must win. No HP, damage, build, position or timer patches.',
    runs
}, null, 2));
