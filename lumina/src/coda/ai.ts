/**
 * 다빈치 코드 AI — 추리기(deduce)의 확률을 쓰되 단계마다 보는 깊이와 배짱이 다르다.
 *  · 입문: 가끔 순서를 따지지 않고 찍는다. 한 번 맞히면 멈춘다.
 *  · 보통: 확률이 높은 쪽을 고르지만 약간 흔들린다. 반반이면 한 번 더 간다.
 *  · 고수: 줄 사이까지 따져 가장 확실한 곳을 맞힌다. 꽤 과감하다.
 *  · 명인: 고수 + 상황 판단 — 상대를 떨어뜨릴 수 있으면 더 과감하게,
 *    내가 위험하거나(숨은 타일이 적음) 조커를 뽑았으면 더 조심스럽게. 공개할 내 타일도 골라서 준다.
 */
import type { AiLevel } from '../game/types';
import type { Rng } from '../game/rng';
import { activePlayers, hiddenCount, isCodaJoker, poolColors, validSlots, type CodaAction, type CodaColor, type CodaPlayer, type CodaState } from './engine';
import { beliefs, guessOptions, knownTiles, type GuessOption } from './deduce';
import { codaColor, codaTiles, guessOf } from './engine';

export interface CodaAiProfile {
  readonly level: AiLevel;
  /** 확률^sharpness 비례로 고른다 (Infinity = 항상 최고) */
  readonly sharpness: number;
  /** 순서를 무시하고 찍을 확률 */
  readonly blind: number;
  /** 이 확률 이상이면 한 번 더 맞힌다 */
  readonly continueAt: number;
  readonly maxStreak: number;
  readonly crossRow: boolean;
  readonly thinkMs: readonly [number, number];
}

export const CODA_PROFILES: Readonly<Record<AiLevel, CodaAiProfile>> = {
  beginner: { level: 'beginner', sharpness: 2, blind: 0.15, continueAt: 0.8, maxStreak: 1, crossRow: false, thinkMs: [700, 1300] },
  casual: { level: 'casual', sharpness: 4, blind: 0, continueAt: 0.55, maxStreak: 2, crossRow: false, thinkMs: [800, 1500] },
  advanced: { level: 'advanced', sharpness: 14, blind: 0, continueAt: 0.38, maxStreak: 5, crossRow: true, thinkMs: [1000, 1800] },
  // 시뮬레이션(scripts/coda-sim.ts)상 과감하게 이어 맞힐수록 강하다 — 기준 0.2에서 상황 따라 올린다
  expert: { level: 'expert', sharpness: Infinity, blind: 0, continueAt: 0.2, maxStreak: 12, crossRow: true, thinkMs: [1100, 2000] },
};

function pickWeighted<T>(items: readonly T[], weight: (t: T) => number, rng: Rng): T | undefined {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return items[rng.int(items.length)];
  let r = rng.next() * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/** 같은 확률이면: 한 장만 남은 사람(떨어뜨리기) → 후보가 적은 자리 */
function better(s: CodaState, a: GuessOption, b: GuessOption): number {
  if (Math.abs(a.p - b.p) > 1e-9) return b.p - a.p;
  const ha = hiddenCount(s.players[a.target] as CodaPlayer);
  const hb = hiddenCount(s.players[b.target] as CodaPlayer);
  if (ha !== hb) return ha - hb;
  return a.options - b.options;
}

function chooseGuess(s: CodaState, rng: Rng, prof: CodaAiProfile): CodaAction {
  const me = s.current;
  if (prof.blind > 0 && rng.next() < prof.blind) {
    // 순서를 따지지 않는 찍기: 보이는 타일과 틀린 값만 뺀다
    const known = knownTiles(s, me);
    const slots: { target: number; index: number }[] = [];
    s.players.forEach((p, t) => {
      if (t === me || p.out) return;
      p.row.forEach((x, i) => {
        if (!x.revealed) slots.push({ target: t, index: i });
      });
    });
    const at = slots[rng.int(slots.length)];
    if (at) {
      const slot = (s.players[at.target] as CodaPlayer).row[at.index];
      const color = slot ? codaColor(slot.tile) : 'black';
      const values = codaTiles(s.jokers)
        .filter((t) => codaColor(t) === color && !known.has(t))
        .map(guessOf)
        .filter((v) => !slot?.misses.includes(v));
      const value = values[rng.int(values.length)];
      if (value !== undefined) return { type: 'guess', target: at.target, index: at.index, value };
    }
  }
  const opts = guessOptions(s, me, beliefs(s, me, prof.crossRow));
  if (!opts.length) {
    // 이론상 없지만, 안전하게 아무 숨은 타일에 0을 말한다
    const t = activePlayers(s).find((p) => p !== me) ?? 0;
    const idx = Math.max(0, (s.players[t] as CodaPlayer).row.findIndex((x) => !x.revealed));
    return { type: 'guess', target: t, index: idx, value: 0 };
  }
  let choice: GuessOption | undefined;
  if (prof.sharpness === Infinity) choice = [...opts].sort((a, b) => better(s, a, b))[0];
  else choice = pickWeighted(opts, (o) => Math.pow(o.p, prof.sharpness), rng);
  const c = choice ?? (opts[0] as GuessOption);
  return { type: 'guess', target: c.target, index: c.index, value: c.value };
}

/** 맞힌 뒤: 더 갈까? */
function wantsMore(s: CodaState, prof: CodaAiProfile): boolean {
  if (s.streak >= prof.maxStreak) return false;
  const opts = guessOptions(s, s.current, beliefs(s, s.current, prof.crossRow));
  const best = opts[0];
  if (!best) return false;
  let need = prof.continueAt;
  if (prof.level === 'expert') {
    const me = s.players[s.current] as CodaPlayer;
    const target = s.players[best.target] as CodaPlayer;
    if (hiddenCount(target) === 1) need -= 0.12; // 떨어뜨릴 기회
    if (hiddenCount(me) <= 2) need += 0.12; // 내가 위험
    if (s.drawn === null) need += 0.1; // 더미가 비었다: 틀리면 내 숨은 타일 하나를 공개해야 한다
    else if (s.penalty === 'choose') need -= 0.03; // 공개할 타일을 내가 고르니(이미 짐작당한 걸 내준다) 틀려도 덜 아프다
    else if (isCodaJoker(s.drawn)) need += 0.1; // 조커를 들키기 싫다 (공식 규칙: 뽑은 타일이 그대로 공개된다)
    if (activePlayers(s).length === 2 && hiddenCount(target) <= hiddenCount(me) - 2) need += 0.05;
  }
  return best.p >= need;
}

/**
 * 더미에서 어느 색을 가져올까.
 *  · 처음 고르기와 입문·보통: 펼친 타일 중 아무거나 집듯이 (남은 장수에 비례)
 *  · 고수·명인: 모두에게 덜 드러난 색 — 그 색은 숫자 후보가 많아 새 타일을 맞히기 어렵다
 */
function chooseColor(s: CodaState, rng: Rng, prof: CodaAiProfile): CodaColor {
  const left = poolColors(s);
  if (!left.black) return 'white';
  if (!left.white) return 'black';
  const byCount = (): CodaColor => (rng.next() * (left.black + left.white) < left.black ? 'black' : 'white');
  if (s.phase === 'deal' || prof.level === 'beginner' || prof.level === 'casual') return byCount();
  const shown = new Set<number>();
  s.players.forEach((p) => p.row.forEach((x) => x.revealed && shown.add(x.tile)));
  const unknown = (c: CodaColor): number => codaTiles(s.jokers).filter((t) => codaColor(t) === c && !shown.has(t)).length;
  const b = unknown('black');
  const w = unknown('white');
  if (b === w) return byCount();
  return b > w ? 'black' : 'white';
}

export function codaDecide(s: CodaState, rng: Rng, level?: AiLevel): CodaAction {
  const me = s.players[s.current] as CodaPlayer;
  const prof = CODA_PROFILES[level ?? me.ai ?? 'casual'];
  switch (s.phase) {
    case 'deal':
    case 'draw':
      return { type: 'draw', color: chooseColor(s, rng, prof) };
    case 'guess':
      return chooseGuess(s, rng, prof);
    case 'decide':
      return wantsMore(s, prof) ? { type: 'continue' } : { type: 'stop' };
    case 'place': {
      const slots = s.drawn === null ? [0] : validSlots(me.row, s.drawn);
      return { type: 'place', index: slots[rng.int(slots.length)] ?? 0 };
    }
    case 'reveal-own': {
      // 틀렸을 때 공개할 내 타일 (방금 숨긴 채 끼운 타일도 후보)
      const hidden = me.row.map((x, i) => (x.revealed ? -1 : i)).filter((i) => i >= 0);
      if (prof.level === 'advanced' || prof.level === 'expert') {
        // 모두가 이미 거의 아는 타일을 내준다 (공개 정보만으로 본 확률이 가장 높은 자리)
        const pub = beliefs(s, -1, true).byPlayer[s.current] ?? [];
        let best = hidden[0] ?? 0;
        let bestP = -1;
        for (const i of hidden) {
          const b = pub[i];
          const p = b ? Math.max(0, ...b.values()) : 0;
          if (p > bestP) {
            bestP = p;
            best = i;
          }
        }
        return { type: 'reveal-own', index: best };
      }
      return { type: 'reveal-own', index: hidden[rng.int(hidden.length)] ?? 0 };
    }
    default:
      return { type: 'stop' };
  }
}

export function codaThinkTime(level: AiLevel, rng: Rng, speed = 1): number {
  const [a, b] = CODA_PROFILES[level].thinkMs;
  return Math.round((a + (b - a) * rng.next()) * speed);
}
