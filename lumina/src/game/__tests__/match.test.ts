import { describe, expect, it } from 'vitest';
import { gameSeed, newMatch, nextGame, recordGame, type MatchState } from '../match';
import { CLASSIC_RULES, sanitizeRules } from '../rules';
import type { GameState } from '../engine';

const seats = [
  { name: '나', seat: 'human' as const },
  { name: '민재', seat: 'ai' as const, ai: 'casual' as const },
];

/** 판을 강제로 끝낸 상태 (점수표 테스트용) */
function finish(m: MatchState, winners: number[], deltas: number[]): MatchState {
  const g: GameState = {
    ...m.game,
    phase: 'over',
    result: { reason: 'out', winners, totals: deltas.map((d) => Math.max(0, -d)), deltas },
  };
  return { ...m, game: g };
}

describe('매치 (공식: 이긴 판 수 → 동률이면 점수)', () => {
  it('판 결과는 한 번만 반영된다', () => {
    let m = newMatch({ seats, rules: CLASSIC_RULES, format: { kind: 'games', games: 2 }, seed: 5 });
    m = finish(m, [0], [20, -20]);
    m = recordGame(recordGame(m));
    expect(m.scores).toEqual([20, -20]);
    expect(m.wins).toEqual([1, 0]);
    expect(m.over).toBe(false);
  });
  it('정한 판 수가 끝나면 이긴 판이 많은 사람이 우승', () => {
    let m = newMatch({ seats, rules: CLASSIC_RULES, format: { kind: 'games', games: 3 }, seed: 5 });
    m = nextGame(recordGame(finish(m, [1], [-50, 50])));
    m = nextGame(recordGame(finish(m, [0], [10, -10])));
    m = recordGame(finish(m, [0], [5, -5]));
    expect(m.over).toBe(true);
    expect(m.champions).toEqual([0]);
    expect(m.scores).toEqual([-35, 35]);
  });
  it('이긴 판 수가 같으면 점수로', () => {
    let m = newMatch({ seats, rules: CLASSIC_RULES, format: { kind: 'games', games: 2 }, seed: 5 });
    m = nextGame(recordGame(finish(m, [1], [-8, 8])));
    m = recordGame(finish(m, [0], [30, -30]));
    expect(m.champions).toEqual([0]);
  });
  it('점수 목표 방식: 누가 목표에 닿으면 끝', () => {
    let m = newMatch({ seats, rules: CLASSIC_RULES, format: { kind: 'points', target: 100 }, seed: 5 });
    m = recordGame(finish(m, [0], [120, -120]));
    expect(m.over).toBe(true);
    expect(m.champions).toEqual([0]);
  });
  it('다음 판은 새 시드로 새로 나눈다', () => {
    let m = newMatch({ seats, rules: CLASSIC_RULES, format: { kind: 'games', games: 3 }, seed: 5 });
    const first = m.game.pool.slice();
    m = nextGame(recordGame(finish(m, [0], [1, -1])));
    expect(m.gameNo).toBe(2);
    expect(m.game.pool).not.toEqual(first);
    expect(gameSeed(5, 1)).not.toBe(gameSeed(5, 2));
  });
  it('끝나지 않은 판에서는 다음 판으로 못 간다', () => {
    const m = newMatch({ seats, rules: CLASSIC_RULES, format: { kind: 'games', games: 3 }, seed: 5 });
    expect(nextGame(m)).toBe(m);
  });
});

describe('규칙 설정', () => {
  it('깨진 저장값은 공식 기본값으로', () => {
    const r = sanitizeRules({ initialMeldPoints: 7, jokerReplace: 'x' as never, turnSeconds: 5 });
    expect(r.initialMeldPoints).toBe(30);
    expect(r.jokerReplace).toBe('any-legal');
    expect(r.turnSeconds).toBe(60);
  });
  it('허용된 하우스 룰은 유지', () => {
    const r = sanitizeRules({ initialMeldPoints: 50, turnSeconds: null, jokerPenalty: 50, initialMeldContinuesTurn: true });
    expect(r).toMatchObject({ initialMeldPoints: 50, turnSeconds: null, jokerPenalty: 50, initialMeldContinuesTurn: true });
  });
  it('공식 기본값: 등록 30, 다음 차례부터 조작, 조커 30, 시간 60초, 벌칙 3장, 14장', () => {
    expect(CLASSIC_RULES).toMatchObject({
      initialMeldPoints: 30,
      initialMeldContinuesTurn: false,
      jokerPenalty: 30,
      turnSeconds: 60,
      timeoutPenaltyDraw: 3,
      tilesPerPlayer: 14,
    });
  });
});
