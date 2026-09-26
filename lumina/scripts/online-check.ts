/**
 * 온라인 대전 점검: (1) E2E용 시드 — 방장·친구·AI 셋 중 친구(1번)가 먼저 두고 첫 차례에 등록할 수 있는 판,
 * (2) 방 문서 크기 — 끝까지 둔 4인 판을 JSON으로 만들었을 때 몇 KiB인지.
 *   npx tsx scripts/online-check.ts
 */
import { newMatch, recordGame } from '../src/game/match';
import { computeHint } from '../src/game/hints';
import { CLASSIC_RULES } from '../src/game/rules';
import { decide, AI_PROFILES } from '../src/game/ai';
import { reduce } from '../src/game/engine';
import { createRng } from '../src/game/rng';
import { newCoda, codaReduce } from '../src/coda/engine';
import { codaDecide } from '../src/coda/ai';

const rules = { ...CLASSIC_RULES, turnSeconds: null };
const seats3 = [
  { name: '방장', seat: 'human' as const },
  { name: '친구', seat: 'human' as const },
  { name: '휘기', seat: 'ai' as const, ai: 'casual' as const },
];
const found: number[] = [];
for (let seed = 1; seed < 20000 && found.length < 5; seed++) {
  const m = newMatch({ seats: seats3, rules, format: { kind: 'games', games: 1 }, seed });
  if (m.game.current !== 1) continue;
  if (computeHint(m.game).kind === 'meld') found.push(seed);
}
console.log('guest-first meld seeds:', found.join(', '));

// 문서 크기: 4인 전원 AI로 끝까지
let worst = 0;
for (let seed = 1; seed <= 30; seed++) {
  const seats4 = [0, 1, 2, 3].map((i) => ({ name: `P${i}`, seat: 'ai' as const, ai: 'beginner' as const }));
  let m = newMatch({ seats: seats4, rules, format: { kind: 'games', games: 1 }, seed });
  const rng = createRng(seed);
  let g = m.game;
  let guard = 0;
  while (g.phase === 'playing' && guard++ < 2000) {
    const d = decide(g, rng, AI_PROFILES.beginner);
    let next = null;
    if (d.kind === 'play') {
      const p = reduce(g, { type: 'propose', sets: d.sets });
      const c = p.ok ? reduce(p.state, { type: 'commit' }) : null;
      if (c?.ok) next = c.state;
    }
    if (!next) {
      const r = reduce(g, g.turn.meldedNow ? { type: 'commit' } : { type: 'draw' });
      if (!r.ok) break;
      next = r.state;
    }
    g = next;
  }
  m = recordGame({ ...m, game: g });
  const session = { v: 1, mode: 'online', lesson: null, match: m, seatsMeta: seats4.map(() => ({ character: 'hwigi' })), rackOrder: [[], [], [], []], drawn: [[], [], [], []], startedAt: 0, endedAt: 0, hintsLeft: 0, timerLeftMs: null, online: null };
  worst = Math.max(worst, JSON.stringify(session).length);
}
console.log('LUMINA 4인 끝판 문서 최대:', (worst / 1024).toFixed(1), 'KiB');

let worstC = 0;
for (let seed = 1; seed <= 30; seed++) {
  let s = newCoda({ seats: [0, 1, 2, 3].map((i) => ({ name: `P${i}`, seat: 'ai' as const, ai: 'casual' as const })), jokers: true, seed });
  const rng = createRng(seed);
  let guard = 0;
  while (s.phase !== 'over' && guard++ < 3000) {
    const r = codaReduce(s, codaDecide(s, rng));
    if (!r.ok) break;
    s = r.state;
  }
  worstC = Math.max(worstC, JSON.stringify({ v: 1, state: s }).length);
}
console.log('다빈치 코드 4인 끝판 문서 최대:', (worstC / 1024).toFixed(1), 'KiB');
