/** 로봇 풀이 따라가기 점검 (개발용) */
import { LEVELS } from '../src/fireice/levels';
import { parseLevel } from '../src/fireice/level';
import { verifyLevel } from '../src/fireice/verify';
import { replay, cellOf } from '../src/fireice/__tests__/bot';

const only = process.argv[2];
for (const def of LEVELS) {
  if (only && def.id !== only) continue;
  const lv = parseLevel(def);
  const { path } = verifyLevel(lv);
  const r = replay(lv, path);
  console.log(`== ${def.id}: ok=${r.ok} failedAt=${r.failedAt} ${r.why}`);
  if (!r.ok) {
    path.forEach((p, k) => console.log(`  ${k === r.failedAt ? '>>' : '  '} ${k}: by=${p.by} to=${JSON.stringify(p.to)} f=${p.f.x},${p.f.y} i=${p.i.x},${p.i.y} lev=${p.lev}`));
    const w = r.world;
    console.log('  world: fire', cellOf(w, 'fire'), w.bodies.fire.x.toFixed(2), w.bodies.fire.y.toFixed(2), 'ice', cellOf(w, 'ice'), w.bodies.ice.x.toFixed(2), w.bodies.ice.y.toFixed(2), 'plats', JSON.stringify(w.plats), 'levers', w.levers, 'pressed', w.pressed);
  }
}
