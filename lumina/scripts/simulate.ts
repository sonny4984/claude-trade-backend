/**
 * AI 대 AI 대량 시뮬레이션:  npm run sim -- 10000
 * 불법 커밋(fallback)·불변식 위반이 0인지, 성격별 승률이 난이도 순서인지 확인한다.
 */
import { simulateGame } from '../src/game/simulate';
import { CAFE_HOUSE_RULES, CLASSIC_RULES } from '../src/game/rules';
import type { AiLevel } from '../src/game/types';

const N = Number(process.argv[2] ?? 1000);
const LEVELS: AiLevel[] = ['beginner', 'casual', 'advanced', 'expert'];
const wins: Record<string, number> = {};
const seats: Record<string, number> = {};
let fallbacks = 0;
let violations = 0;
let turns = 0;
let ms = 0;
let stalemates = 0;
const t0 = Date.now();
for (let k = 0; k < N; k++) {
  const n = 2 + (k % 3);
  const levels = Array.from({ length: n }, (_, i) => LEVELS[(k * 7 + i * 3) % 4] as AiLevel);
  const rules = k % 5 === 4 ? { ...CAFE_HOUSE_RULES, jokerReplace: k % 2 ? ('exact-tile' as const) : ('any-legal' as const), jokerSetLocked: k % 3 === 0 } : CLASSIC_RULES;
  const r = simulateGame(10_000 + k, levels, rules);
  fallbacks += r.fallbacks;
  if (r.violations.length) {
    violations++;
    console.log('VIOLATION', k, r.violations.slice(0, 3));
  }
  turns += r.turns;
  ms += r.decisionsMs;
  if (r.state.result?.reason === 'stalemate') stalemates++;
  levels.forEach((l, i) => {
    seats[l] = (seats[l] ?? 0) + 1;
    if (r.state.result?.winners.includes(i)) wins[l] = (wins[l] ?? 0) + 1 / (r.state.result?.winners.length ?? 1);
  });
  if ((k + 1) % 500 === 0) console.log(`${k + 1}/${N} games, fallbacks=${fallbacks}, violations=${violations}, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log('──────── 결과 ────────');
console.log(`games ${N}, illegal commits (fallbacks) ${fallbacks}, invariant violations ${violations}, stalemates ${stalemates}`);
console.log(`avg turns ${(turns / N).toFixed(1)}, avg decision ${(ms / turns).toFixed(2)}ms, total ${((Date.now() - t0) / 1000).toFixed(0)}s`);
for (const l of LEVELS) console.log(`${l.padEnd(9)} win share ${(((wins[l] ?? 0) / (seats[l] ?? 1)) * 100).toFixed(1)}% over ${seats[l]} seats`);
