/**
 * E2E용 시드 찾기: 기본 혼자 두기 설정(나·휘기·기니니)에서
 * 사람이 먼저 두고, 첫 차례에 힌트로 등록할 수 있는 시드를 고른다.
 *   npx tsx scripts/find-seed.ts
 */
import { newMatch } from '../src/game/match';
import { computeHint } from '../src/game/hints';
import { CLASSIC_RULES } from '../src/game/rules';

const seats = [
  { name: '나', seat: 'human' as const },
  { name: '휘기', seat: 'ai' as const, ai: 'beginner' as const },
  { name: '기니니', seat: 'ai' as const, ai: 'casual' as const },
];
const found: number[] = [];
for (let seed = 1; seed < 5000 && found.length < 5; seed++) {
  const m = newMatch({ seats, rules: { ...CLASSIC_RULES, turnSeconds: null }, format: { kind: 'games', games: 1 }, seed });
  if (m.game.current !== 0) continue;
  const h = computeHint(m.game);
  if (h.kind === 'meld') found.push(seed);
}
console.log('seeds:', found.join(', '));
