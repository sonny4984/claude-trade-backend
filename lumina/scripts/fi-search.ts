/**
 * 단계 틀 찾기 (개발용): npx tsx scripts/fi-search.ts <틀.json> [표본 수]
 * 틀 = { id, map(20줄), slots: { 자리 글자(a·c·d·e·g·h 등 지도에 안 쓰는 소문자): 넣어 볼 글자들 }, levers?: 레버 자리들(3·4를 바꿔 봄) }
 * 같은 자리 글자가 여러 칸이면 모두 같은 글자로 바뀐다 (두 칸짜리 계단·문 기둥).
 * 실제 풀이기로 풀어 보고 (장치 조작 수·막다른 상태 비율·걸음 수) 점수가 높은 판을 보여 준다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseLevel } from '../src/fireice/level';
import { verifyLevel } from '../src/fireice/verify';

interface Tpl {
  id: string;
  map: string[];
  slots: Record<string, string>;
  levers?: [number, number][];
  platforms?: unknown[];
}
const tpl = JSON.parse(readFileSync(process.argv[2] as string, 'utf8')) as Tpl;
const samples = Number(process.argv[3] ?? 2000);
const names = Object.keys(tpl.slots);
let seed = 12345;
// 선형 합동 난수의 아래 비트는 주기가 짧아(0,1,0,1…) 위쪽 비트를 쓴다
const rnd = (n: number): number => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) >>> 16) % n;
const seen = new Set<string>();
const top: { score: number; line: string; map: string[] }[] = [];
for (let n = 0; n < samples; n++) {
  const pick = names.map((nm) => (tpl.slots[nm] as string)[rnd((tpl.slots[nm] as string).length)] as string);
  const swap = tpl.levers && rnd(2) === 1;
  const k = pick.join('') + (swap ? 's' : '');
  if (seen.has(k)) continue;
  seen.add(k);
  const map = tpl.map.map((r) => [...r].map((ch) => (names.includes(ch) ? (pick[names.indexOf(ch)] as string) : ch)));
  if (swap) for (const [x, y] of tpl.levers ?? []) (map[y] as string[])[x] = (map[y] as string[])[x] === '3' ? '4' : '3';
  const rows = map.map((r) => r.join(''));
  let lv;
  try {
    lv = parseLevel({ id: tpl.id, par: 90, map: rows, platforms: tpl.platforms as never });
  } catch (e) {
    if (n < 3) console.error((e as Error).message);
    continue;
  }
  const r = verifyLevel(lv, 300_000, true);
  if (!r.solvable || r.gemsReachable.length < lv.gems.length) continue;
  const flips = r.path.reduce((c, p, i) => c + (i > 0 && (p.lev !== r.path[i - 1]?.lev || p.open !== r.path[i - 1]?.open) ? 1 : 0), 0);
  const dead = r.deadEnds / r.states;
  const gates = pick.filter((c) => c !== '.' && c !== '#').length;
  void gates;
  const score = flips * 3 + dead * 30 + r.steps * 0.15 - gates * 0.5;
  top.push({ score, line: `${score.toFixed(1)} devices=${flips} dead=${Math.round(dead * 100)}% steps=${r.steps} states=${r.states} slots=${k}`, map: rows });
  top.sort((a, b) => b.score - a.score);
  top.length = Math.min(top.length, 8);
}
for (const t of top) console.log(t.line);
writeFileSync(process.argv[2].replace(/\.json$/, '.top.json'), JSON.stringify(top.map((t, i) => ({ id: `${tpl.id}${i}`, par: 90, map: t.map, platforms: tpl.platforms })), null, 0));
