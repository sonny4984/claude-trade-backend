import { describe, expect, it } from 'vitest';
import { LEVELS } from '../levels';
import { LEVEL_H, at, parseLevel, type Element, type LevelDef, type ParsedLevel } from '../level';
import { searchFrom, verifyLevel } from '../verify';
import { describeHint } from '../hintStep';
import { replay } from './bot';
import { NO_INPUT, PHYS, cleared, newWorld, step, type Input, type WorldEvent, type WorldState } from '../world';

const DT = 1 / 120;

/** 가로 16 × 세로 20 맵을 짧게: 주어진 줄들을 아래에 붙이고 위는 빈칸으로 채운다 */
function mini(rows: string[], platforms: LevelDef['platforms'] = []): ParsedLevel {
  const empty = '#..............#';
  const map = [...Array.from({ length: LEVEL_H - rows.length }, (_, i) => (i === 0 ? '################' : empty)), ...rows];
  // 문이 없으면 맨 위 구석에 둔다 (시험과 무관한 곳)
  const doors = (map.join('').includes('F') ? '.' : 'F') + '............' + (map.join('').includes('I') ? '.' : 'I');
  map[1] = `#${doors}#`;
  return parseLevel({ id: 'test', par: 10, map, platforms });
}

function run(w: WorldState, secs: number, input: (w: WorldState) => Partial<Record<Element, Input>>): WorldEvent[] {
  const out: WorldEvent[] = [];
  for (let t = 0; t < secs; t += DT) {
    const inp = input(w);
    out.push(...step(w, { fire: inp.fire ?? NO_INPUT, ice: inp.ice ?? NO_INPUT }, DT));
  }
  return out;
}

/** 칸 모형의 ㄱ자 점프를 실제 물리로: 뛰어오른 뒤(발이 목표보다 높아지면) 목표 칸 가운데로 몸을 튼다 */
function jumpTo(w: WorldState, el: Element, tx: number, ty: number, flat = false): boolean {
  const b = w.bodies[el];
  let high = flat;
  let t = 0;
  let left = false;
  for (; t < 2.5; t += DT) {
    if (!high && b.y + PHYS.h < ty + 1 - 0.02) high = true;
    const cx = b.x + PHYS.w / 2;
    const want = high ? (cx < tx + 0.4 ? 1 : cx > tx + 0.6 ? -1 : 0) : 0;
    const inp: Input = { left: want < 0, right: want > 0, jump: t < 0.5 };
    step(w, { fire: el === 'fire' ? inp : NO_INPUT, ice: el === 'ice' ? inp : NO_INPUT }, DT);
    if (b.ground !== -2) left = left || t > 0.05;
    if (left && b.ground !== -2 && t > 0.1) break;
  }
  for (let k = 0; k < 60; k++) step(w, { fire: NO_INPUT, ice: NO_INPUT }, DT);
  const cx = b.x + PHYS.w / 2;
  return b.alive && b.ground !== -2 && Math.floor(cx) === tx && Math.abs(b.y + PHYS.h - (ty + 1)) < 0.05;
}

describe('불과 얼음 물리', () => {
  it('점프는 3.4칸 넘게 뛰어오른다', () => {
    const lv = mini(['#f............i#', '################', '################']);
    const w = newWorld(lv);
    const y0 = w.bodies.fire.y;
    let top = y0;
    run(w, 1.2, (s) => {
      top = Math.min(top, s.bodies.fire.y);
      return { fire: { left: false, right: false, jump: true } };
    });
    expect(y0 - top).toBeGreaterThan(3.4);
    expect(w.bodies.fire.ground).toBe(-1);
  });

  it('칸 모형의 점프(3칸 위 2칸 옆, 2칸 위 3칸 옆, 1칸 위 4칸 옆)는 실제로도 된다', () => {
    // 3 위 · 2 옆
    const a = mini(['#..............#', '#..............#', '#.....###......#', '#..............#', '#...f.........i#', '################', '################']);
    expect(jumpTo(newWorld(a), 'fire', 6, LEVEL_H - 6)).toBe(true);
    // 2 위 · 3 옆
    const b = mini(['#..............#', '#..............#', '#......###.....#', '#...f.........i#', '################', '################']);
    expect(jumpTo(newWorld(b), 'fire', 7, LEVEL_H - 5)).toBe(true);
    // 1 위 · 4 옆
    const c = mini(['#..............#', '#..............#', '#...f...###...i#', '################', '################']);
    expect(jumpTo(newWorld(c), 'fire', 8, LEVEL_H - 4)).toBe(true);
  });

  it('같은 높이 건너뛰기: 머리 위 한 칸이면 2칸, 세 칸 이상이면 4칸', () => {
    // 천장이 낮은 통로(머리 위 1칸)에서 한 칸 틈
    const low = mini(['################', '#..............#', '#..f..........i#', '####.###########', '################']);
    expect(jumpTo(newWorld(low), 'fire', 5, LEVEL_H - 3, true)).toBe(true);
    // 넓은 곳에서 세 칸 틈
    const wide = mini(['#..............#', '#..............#', '#..............#', '#..f..........i#', '####...#########', '################']);
    expect(jumpTo(newWorld(wide), 'fire', 7, LEVEL_H - 3, true)).toBe(true);
  });

  it('남의 웅덩이는 위험, 내 웅덩이는 안전, 말차는 둘 다 위험', () => {
    const lv = mini(['#.f.........i..#', '##LLWW####GG####', '################']);
    const w = newWorld(lv);
    // 불: 오른쪽으로 걸으면 잼(L)은 괜찮고 물(W)에서 꺼진다
    const ev = run(w, 1.5, () => ({ fire: { left: false, right: true, jump: false } }));
    expect(ev.find((e) => e.type === 'dead')).toMatchObject({ type: 'dead', el: 'fire', cause: 'W' });
    expect(w.bodies.fire.x).toBeGreaterThan(3.5);
    // 얼음: 말차(G)에서 녹는다
    const ev2 = run(w, 1, () => ({ ice: { left: true, right: false, jump: false } }));
    expect(ev2.find((e) => e.type === 'dead')).toMatchObject({ type: 'dead', el: 'ice', cause: 'G' });
  });

  it('사탕은 제 색만 먹는다', () => {
    const lv = mini(['#f..b..r......i#', '################', '################']);
    const w = newWorld(lv);
    const ev = run(w, 1.2, () => ({ fire: { left: false, right: true, jump: false } }));
    expect(ev.filter((e) => e.type === 'gem')).toEqual([{ type: 'gem', id: 1, el: 'fire' }]);
    expect(w.gems).toEqual([false, true]);
  });

  it('버튼을 밟고 있는 동안 발판이 올라가고, 위에 탄 몸을 싣고 간다', () => {
    const lv = mini(
      ['#..............#', '#..............#', '#..............#', '#..............#', '#..............#', '#f1...........i#', '################', '################'],
      [{ x: 10, y: LEVEL_H - 3, w: 3, h: 1, dx: 0, dy: -4, group: 1 }],
    );
    const w = newWorld(lv);
    // 얼음이 발판 위로 올라간다 (왼쪽으로 한 칸 뛰어오르기)
    const ice = w.bodies.ice;
    run(w, 1.2, (s) => ({ ice: { left: s.bodies.ice.x > 11.2, right: false, jump: s.time < 0.15 } }));
    expect(ice.ground).toBe(0);
    const y0 = ice.y;
    // 불이 버튼으로
    const ev = run(w, 2.2, (s) => ({ fire: { left: false, right: s.bodies.fire.x < 2.1, jump: false } }));
    expect(ev.some((e) => e.type === 'button' && e.group === 1 && e.on)).toBe(true);
    expect(w.plats[0]?.y).toBeCloseTo(LEVEL_H - 7, 3);
    expect(y0 - ice.y).toBeCloseTo(4, 1);
    expect(ice.ground).toBe(0);
    // 불이 내려오면 발판도 내려온다
    run(w, 2.5, () => ({ fire: { left: true, right: false, jump: false } }));
    expect(w.plats[0]?.y).toBeCloseTo(LEVEL_H - 3, 3);
    expect(Math.abs(ice.y + PHYS.h - (LEVEL_H - 3))).toBeLessThan(0.05);
  });

  it('내려오는 발판은 밑에 선 몸을 누르지 않고 기다린다', () => {
    const lv = mini(
      ['#..............#', '#..............#', '#..............#', '#..............#', '#..3...........#', '#f.........i...#', '################', '################'],
      [{ x: 10, y: LEVEL_H - 6, w: 3, h: 1, dx: 0, dy: 3, group: 3 }],
    );
    const w = newWorld(lv);
    // 불이 레버(3)를 오른쪽으로 밀어 켠다 — 발판이 얼음 머리 위로 내려오다 멈춘다
    w.levers[0] = true;
    run(w, 2, () => ({}));
    const p = w.plats[0] as { x: number; y: number };
    expect(p.y + 1).toBeLessThanOrEqual(w.bodies.ice.y + 1e-3);
    expect(w.bodies.ice.alive).toBe(true);
    // 얼음이 비키면 끝까지 내려온다
    run(w, 1.5, () => ({ ice: { left: true, right: false, jump: false } }));
    expect(p.y).toBeCloseTo(LEVEL_H - 3, 3);
  });

  it('레버는 오른쪽으로 밀면 켜지고 왼쪽으로 밀면 꺼진다', () => {
    const lv = mini(['#f...3........i#', '################', '################']);
    const w = newWorld(lv);
    const on = run(w, 1, (s) => ({ fire: { left: false, right: s.bodies.fire.x < 7, jump: false } }));
    expect(on.filter((e) => e.type === 'lever')).toEqual([{ type: 'lever', id: 0, on: true }]);
    const off = run(w, 1, (s) => ({ fire: { left: s.bodies.fire.x > 2, right: false, jump: false } }));
    expect(off.filter((e) => e.type === 'lever')).toEqual([{ type: 'lever', id: 0, on: false }]);
  });

  it('크림 선반: 아래에서 뛰어 통과해 위에 내려앉고, 그 위에 설 수 있다', () => {
    const lv = mini(['#..............#', '#..............#', '#...====.......#', '#..............#', '#....f........i#', '################', '################']);
    const w = newWorld(lv);
    // 선반 바로 아래에서 곧장 뛰면 선반을 뚫고 올라가 그 위에 선다
    const ok = jumpTo(w, 'fire', 5, LEVEL_H - 6);
    expect(ok).toBe(true);
    // 옆으로 걸어도 선반은 벽이 아니다 (아래층)
    const w2 = newWorld(lv);
    run(w2, 0.8, () => ({ fire: { left: false, right: true, jump: false } }));
    expect(w2.bodies.fire.x).toBeGreaterThan(8);
    expect(Math.abs(w2.bodies.fire.y + PHYS.h - (LEVEL_H - 2))).toBeLessThan(0.05);
  });

  it('젤리: 밟으면 5.5칸 넘게 통 튀어 오른다 (점프를 안 눌러도)', () => {
    const lv = mini(['#..............#', '#..............#', '#..f..........i#', '#####J##########', '################']);
    const w = newWorld(lv);
    const y0 = w.bodies.fire.y;
    let top = y0;
    const ev = run(w, 1.6, (s) => {
      top = Math.min(top, s.bodies.fire.y);
      const cx = s.bodies.fire.x + PHYS.w / 2;
      return { fire: { left: cx > 5.6, right: cx < 5.4, jump: false } };
    });
    expect(ev.some((e) => e.type === 'bounce' && e.el === 'fire')).toBe(true);
    expect(y0 - top).toBeGreaterThan(5.5);
  });

  it('커튼: 뜨거운 커튼은 불만, 차가운 커튼은 얼음만 지나간다', () => {
    const lv = mini(['#..f..H..C..i..#', '################', '################']);
    const w = newWorld(lv);
    run(w, 1.2, () => ({ fire: { left: false, right: true, jump: false }, ice: { left: true, right: false, jump: false } }));
    // 불: H(6)는 지나가고 C(9)에 막힌다 → 8칸 안쪽
    expect(w.bodies.fire.x).toBeGreaterThan(7);
    expect(w.bodies.fire.x + PHYS.w).toBeLessThanOrEqual(9 + 1e-3);
    // 얼음: C(9)는 지나가고 H(6)에 막힌다
    expect(w.bodies.ice.x).toBeLessThan(9);
    expect(w.bodies.ice.x).toBeGreaterThanOrEqual(7 - 1e-3);
  });

  it('젤리빈 문: 버튼을 밟는 동안만 열리고, 닫힌 문은 벽이다', () => {
    const w = newWorld(mini(['#f....5......1i#', '################']));
    const g = at(6, LEVEL_H - 2);
    const right: Input = { left: false, right: true, jump: false };
    run(w, 1.5, () => ({ fire: right }));
    expect(w.gateOpen[g]).toBe(false);
    expect(w.bodies.fire.x + PHYS.w).toBeLessThan(6.01);
    for (let t = 0; t < 1 && !w.pressed[1]; t += DT) step(w, { fire: NO_INPUT, ice: { left: true, right: false, jump: false } }, DT);
    run(w, 0.3, () => ({}));
    expect(w.gateOpen[g]).toBe(true);
    run(w, 1, () => ({ fire: right }));
    expect(w.bodies.fire.x).toBeGreaterThan(7);
  });

  it('열쇠: 주운 뒤 자물쇠를 옆에서 밀면 열리고 열쇠를 하나 쓴다 (없으면 벽)', () => {
    const right: Input = { left: false, right: true, jump: false };
    const locked = newWorld(mini(['#f....K.......i#', '################']));
    run(locked, 1.5, () => ({ fire: right }));
    expect(locked.lockOpen[0]).toBe(false);
    expect(locked.bodies.fire.x + PHYS.w).toBeLessThan(6.01);
    const w = newWorld(mini(['#f.k..K.......i#', '################']));
    run(w, 2, () => ({ fire: right }));
    expect(w.keysGot[0]).toBe(true);
    expect(w.lockOpen[0]).toBe(true);
    expect(w.keyCount).toBe(0);
    expect(w.bodies.fire.x).toBeGreaterThan(7);
  });

  it('순간이동 구멍: 걸어 들어가면 벽 너머 짝 칸으로', () => {
    const w = newWorld(mini(['#......#.......#', '#f..@..#...@..i#', '################']));
    const ev = run(w, 1, () => ({ fire: { left: false, right: true, jump: false } }));
    expect(ev.some((e) => e.type === 'teleport' && e.el === 'fire')).toBe(true);
    expect(w.bodies.fire.x).toBeGreaterThan(8);
    expect(w.bodies.fire.alive).toBe(true);
  });

  it('둘 다 제 문에 서면 통과', () => {
    const lv = mini(['#f.F......I...i#', '################', '################']);
    const w = newWorld(lv);
    run(w, 1.2, (s) => ({
      fire: { left: false, right: s.bodies.fire.x + PHYS.w / 2 < 3.45, jump: false },
      ice: { left: s.bodies.ice.x + PHYS.w / 2 > 10.55, right: false, jump: false },
    }));
    expect(w.bodies.fire.atDoor && w.bodies.ice.atDoor).toBe(true);
    expect(cleared(w)).toBe(true);
  });
});

describe('불과 얼음 단계', () => {
  for (const def of LEVELS) {
    it(`${def.id}: 둘이 함께 풀 수 있고 사탕도 모두 먹을 수 있다`, () => {
      const lv = parseLevel(def);
      const r = verifyLevel(lv);
      expect(r.solvable).toBe(true);
      expect(r.gemsReachable).toEqual(lv.gems.map((g) => g.id));
    });
  }

  it('단계 id는 겹치지 않는다', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });
});

describe('불과 얼음 단계 — 실제 물리로 풀이 따라가기', () => {
  for (const def of LEVELS) {
    it(`${def.id}: 로봇이 칸 모형 풀이대로 문까지 간다`, () => {
      const lv = parseLevel(def);
      const { path } = verifyLevel(lv);
      const r = replay(lv, path);
      expect(r.why).toBe('');
      expect(r.ok).toBe(true);
    });
  }
});

describe('불과 얼음 힌트·막힘', () => {
  const lv = (id: string): ParsedLevel => parseLevel(LEVELS.find((l) => l.id === id) as LevelDef);
  it('처음 자리에서 힌트는 누가 어디로 갈지 알려 준다', () => {
    const l = lv('keyhole');
    const r = searchFrom(l, { f: l.spawn.fire, i: l.spawn.ice, l: l.spawn.leaf, lev: 0, keys: 0, open: 0 });
    const h = describeHint(l, r.path);
    expect(r.solvable).toBe(true);
    expect(h?.kind).toBe('move');
  });
  it('교대 근무: 얼음이 먼저 떨어지고 불이 레버 방 밖에 있으면 막힘', () => {
    const l = lv('shift');
    const r = searchFrom(l, { f: l.spawn.fire, i: { x: 14, y: 17 }, l: l.spawn.leaf, lev: 0b10, keys: 0, open: 0 });
    expect(r.solvable).toBe(false);
    expect(r.truncated).toBe(false);
  });
});
