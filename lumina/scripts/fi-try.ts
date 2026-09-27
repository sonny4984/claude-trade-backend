/** 단계 초안 점검 (개발용): npx tsx scripts/fi-try.ts <파일.json> — {id, map, platforms?} 목록을 검사하고 닿는 칸 그림 */
import { readFileSync } from 'node:fs';
import { parseLevel, at, LEVEL_W, LEVEL_H, type LevelDef } from '../src/fireice/level';
import { verifyLevel, movesFrom } from '../src/fireice/verify';
import { replay } from '../src/fireice/__tests__/bot';

const defs = JSON.parse(readFileSync(process.argv[2] as string, 'utf8')) as LevelDef[];
const only = process.argv[3];
for (const def of defs) {
  if (only && def.id !== only) continue;
  let lv;
  try {
    lv = parseLevel({ ...def, par: def.par ?? 60 });
  } catch (e) {
    console.log(`== ${def.id}: ${(e as Error).message}`);
    continue;
  }
  const r = verifyLevel(lv, 1_500_000);
  const bot = r.solvable ? replay(lv, r.path) : null;
  console.log(`== ${def.id}: solvable=${r.solvable} steps=${r.steps} states=${r.states} gems=${r.gemsReachable.length}/${lv.gems.length} bot=${bot ? (bot.ok ? 'ok' : `FAIL@${bot.failedAt} ${bot.why}`) : '-'}`);
  if (!r.solvable || r.gemsReachable.length < lv.gems.length || (bot && !bot.ok) || only) {
    for (const el of ['fire', 'ice'] as const) {
      const start = lv.spawn[el];
      const seen = new Set<number>([at(start.x, start.y)]);
      const q = [start];
      while (q.length) {
        const c = q.shift()!;
        for (const { cell: n } of movesFrom(lv, new Set(), el, c.x, c.y)) {
          const k = at(n.x, n.y);
          if (!seen.has(k)) {
            seen.add(k);
            q.push(n);
          }
        }
      }
      console.log(`  ${el} alone (devices off):`);
      for (let y = 0; y < LEVEL_H; y++) {
        let row = '';
        for (let x = 0; x < LEVEL_W; x++) row += seen.has(at(x, y)) ? (el === 'fire' ? '*' : '+') : (def.map[y] as string)[x];
        console.log('   ' + row);
      }
    }
    if (bot && !bot.ok) r.path.forEach((p, k) => console.log(`  ${k === bot.failedAt ? '>>' : '  '} ${k}: by=${p.by} to=${JSON.stringify(p.to)} via=${JSON.stringify(p.via)} f=${p.f.x},${p.f.y} i=${p.i.x},${p.i.y} lev=${p.lev}`));
  }
  if (r.gemsReachable.length < lv.gems.length) console.log('  unreachable gems:', lv.gems.filter((g) => !r.gemsReachable.includes(g.id)).map((g) => `${g.el}@${g.x},${g.y}`).join(' '));
}
