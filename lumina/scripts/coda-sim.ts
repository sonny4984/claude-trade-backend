/**
 * 다빈치 코드 AI끼리 대결 — 단계별 승률과 정답률.
 *   npx tsx scripts/coda-sim.ts [판 수]
 */
import { newCoda, codaReduce, codaInvariants } from '../src/coda/engine';
import { codaDecide } from '../src/coda/ai';
import { createRng } from '../src/game/rng';
import type { AiLevel } from '../src/game/types';

const N = Number(process.argv[2] ?? 400);
const pairs: [AiLevel, AiLevel][] = [
  ['expert', 'beginner'],
  ['expert', 'casual'],
  ['expert', 'advanced'],
  ['advanced', 'casual'],
  ['casual', 'beginner'],
];
for (const [a, b] of pairs) {
  let winsA = 0;
  let violations = 0;
  let turns = 0;
  const acc = { a: [0, 0], b: [0, 0] };
  for (let g = 0; g < N; g++) {
    const levels = g % 2 ? [a, b] : [b, a];
    const rng = createRng(g * 7919 + 1);
    let s = newCoda({ seats: levels.map((ai, i) => ({ name: `${i}`, seat: 'ai' as const, ai })), jokers: true, seed: 100000 + g });
    for (let step = 0; step < 3000 && s.phase !== 'over'; step++) {
      const r = codaReduce(s, codaDecide(s, rng));
      if (!r.ok) {
        violations++;
        break;
      }
      if (codaInvariants(r.state).length) violations++;
      s = r.state;
    }
    turns += s.turnNo;
    if (levels[s.winner ?? 0] === a) winsA++;
    s.players.forEach((p, i) => {
      const k = levels[i] === a ? acc.a : acc.b;
      k[0] += p.stats.correct;
      k[1] += p.stats.guesses;
    });
  }
  const pct = (x: number[]) => `${Math.round(((x[0] ?? 0) / Math.max(1, x[1] ?? 1)) * 100)}%`;
  console.log(`${a} vs ${b}: ${a} 승률 ${Math.round((winsA / N) * 100)}% · 정답률 ${pct(acc.a)} / ${pct(acc.b)} · 평균 ${Math.round(turns / N)}차례 · 위반 ${violations}`);
}
