/** 단계 점검: 풀리는지, 원소별로 닿는 칸 그림 (개발용) */
import { LEVELS } from '../src/fireice/levels';
import { parseLevel, at, LEVEL_W, LEVEL_H } from '../src/fireice/level';
import { verifyLevel, movesFrom } from '../src/fireice/verify';

const only = process.argv[2];
for (const def of LEVELS) {
  if (only && def.id !== only) continue;
  const lv = parseLevel(def);
  const t0 = Date.now();
  const r = verifyLevel(lv);
  console.log(`== ${def.id}: solvable=${r.solvable} steps=${r.steps} states=${r.states} gems=${JSON.stringify(r.gemsReachable)}/${lv.gems.length} (${Date.now() - t0}ms)`);
  // 원소별 단독 도달 (장치 꺼진 상태)
  for (const el of ['fire', 'ice'] as const) {
    const start = lv.spawn[el];
    const seen = new Set<number>([at(start.x, start.y)]);
    const q = [start];
    while (q.length) {
      const c = q.shift()!;
      for (const n of movesFrom(lv, new Set(), el, c.x, c.y)) {
        const k = at(n.x, n.y);
        if (!seen.has(k)) { seen.add(k); q.push(n); }
      }
    }
    if (only) {
      console.log(`  ${el} alone (devices off):`);
      for (let y = 0; y < LEVEL_H; y++) {
        let row = '';
        for (let x = 0; x < LEVEL_W; x++) row += seen.has(at(x, y)) ? '*' : (def.map[y] as string)[x];
        console.log('   ' + row);
      }
    }
  }
}
