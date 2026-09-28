/**
 * 불과 얼음 — 단계(맵) 형식과 해석.
 *
 * 맵은 글자 칸으로 그린다 (가로 16 × 세로 20, 위가 0행):
 *   #  블록 (단단함)          .  빈칸
 *   L  딸기잼 웅덩이 (불만 지나감, 얼음은 녹아요)
 *   W  블루베리 물 웅덩이 (얼음만 지나감, 불은 꺼져요)
 *   G  말차 독 웅덩이 (둘 다 위험)          웅덩이는 바닥처럼 딛고 서지만, 밟는 순간 판정한다
 *   f  불 시작 자리          i  얼음 시작 자리
 *   F  불의 문 (그 칸에 서면 "문 안")     I  얼음의 문
 *   r  빨간 사탕 (불이 먹음)             b  파란 사탕 (얼음이 먹음)
 *   1 2  버튼 — 위에 서 있는 동안 같은 번호의 발판이 움직인다 (아래 칸이 바닥이어야 함)
 *   3 4  레버 — 밀면 켜지고 반대로 밀면 꺼진다 (켜진 동안 같은 번호의 발판이 움직인다)
 *   =  크림 선반 — 아래에서는 뛰어 통과하고, 위에 내려앉을 수 있다 (옆으로도 지나감)
 *   J  젤리 — 밟으면 약 6칸 높이로 통 튀어 오른다 (그 위에 서 있을 수는 없음)
 *   H  뜨거운 커튼 — 불만 지나가고 얼음에게는 벽
 *   C  차가운 커튼 — 얼음만 지나가고 불에게는 벽
 *   5 6 7 8  젤리빈 문 — 1·2·3·4번(버튼·레버)이 켜진 동안 열린다 (꺼지면 닫힘)
 *   x y  거꾸로 문 — 3·4번 레버가 켜지면 닫힌다 (꺼지면 열림)
 *   k  쿠키 열쇠 — 누구든 주우면 함께 쓰는 열쇠 하나
 *   K  자물쇠 문 — 열쇠를 가진 채 옆에서 밀면 열린다 (열쇠 하나 씀)
 *   @ %  순간이동 구멍 — 같은 글자 두 칸이 한 쌍, 걸어 들어가면 짝 칸으로
 * 발판(움직이는 판)은 맵 대신 platforms 목록에 적는다: 쉴 때 위치(x, y, 너비, 높이)와 켜졌을 때 옮겨 갈 칸 수.
 */

export const LEVEL_W = 16;
export const LEVEL_H = 20;

export type Element = 'fire' | 'ice';
export type Pool = 'L' | 'W' | 'G';

export interface PlatformDef {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** 켜졌을 때 옮겨 갈 칸 수 */
  readonly dx: number;
  readonly dy: number;
  /** 움직이게 하는 버튼·레버 번호 (1~4) */
  readonly group: number;
}

export interface LevelDef {
  readonly id: string;
  /** 단계 이름 (i18n 키 fireice.levels.<id>) */
  readonly map: readonly string[];
  readonly platforms?: readonly PlatformDef[];
  /** 별 셋 기준 시간 (초) */
  readonly par: number;
}

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export interface ParsedLevel {
  readonly def: LevelDef;
  /** 모두에게 단단함: 블록·웅덩이·젤리 */
  readonly solid: readonly boolean[];
  /** 크림 선반 (위에서만 딛는다) */
  readonly oneway: readonly boolean[];
  /** 젤리 (solid이기도 함) */
  readonly jelly: readonly boolean[];
  /** 커튼: 지나갈 수 있는 원소 (다른 원소에게는 벽) */
  readonly curtain: readonly (Element | null)[];
  /** 문: 0 없음, +g = g번이 켜지면 열림, -g = g번이 켜지면 닫힘 */
  readonly gate: readonly number[];
  readonly keys: readonly { readonly id: number; readonly x: number; readonly y: number }[];
  readonly locks: readonly { readonly id: number; readonly x: number; readonly y: number }[];
  /** 칸 번호 → 순간이동 짝 칸 */
  readonly portal: ReadonlyMap<number, Cell>;
  readonly pool: readonly (Pool | null)[];
  readonly spawn: Readonly<Record<Element, Cell>>;
  readonly door: Readonly<Record<Element, Cell>>;
  readonly gems: readonly { readonly id: number; readonly x: number; readonly y: number; readonly el: Element }[];
  readonly buttons: readonly { readonly x: number; readonly y: number; readonly group: number }[];
  readonly levers: readonly { readonly id: number; readonly x: number; readonly y: number; readonly group: number }[];
  readonly platforms: readonly PlatformDef[];
}

export const at = (x: number, y: number): number => y * LEVEL_W + x;

export function parseLevel(def: LevelDef): ParsedLevel {
  if (def.map.length !== LEVEL_H || def.map.some((row) => row.length !== LEVEL_W)) throw new Error(`level ${def.id}: map must be ${LEVEL_W}×${LEVEL_H}`);
  const solid: boolean[] = [];
  const oneway: boolean[] = [];
  const jelly: boolean[] = [];
  const curtain: (Element | null)[] = [];
  const gate: number[] = [];
  const keys: { id: number; x: number; y: number }[] = [];
  const locks: { id: number; x: number; y: number }[] = [];
  const pairs: Record<string, Cell[]> = {};
  const pool: (Pool | null)[] = [];
  const spawn: Partial<Record<Element, Cell>> = {};
  const door: Partial<Record<Element, Cell>> = {};
  const gems: { id: number; x: number; y: number; el: Element }[] = [];
  const buttons: { x: number; y: number; group: number }[] = [];
  const levers: { id: number; x: number; y: number; group: number }[] = [];
  for (let y = 0; y < LEVEL_H; y++) {
    for (let x = 0; x < LEVEL_W; x++) {
      const ch = (def.map[y] as string)[x] as string;
      const isPool = ch === 'L' || ch === 'W' || ch === 'G';
      solid.push(ch === '#' || isPool || ch === 'J');
      oneway.push(ch === '=');
      jelly.push(ch === 'J');
      curtain.push(ch === 'H' ? 'fire' : ch === 'C' ? 'ice' : null);
      gate.push(ch >= '5' && ch <= '8' ? Number(ch) - 4 : ch === 'x' ? -3 : ch === 'y' ? -4 : 0);
      if (ch === 'k') keys.push({ id: keys.length, x, y });
      else if (ch === 'K') locks.push({ id: locks.length, x, y });
      else if (ch === '@' || ch === '%') (pairs[ch] ??= []).push({ x, y });
      pool.push(isPool ? (ch as Pool) : null);
      if (ch === 'f') spawn.fire = { x, y };
      else if (ch === 'i') spawn.ice = { x, y };
      else if (ch === 'F') door.fire = { x, y };
      else if (ch === 'I') door.ice = { x, y };
      else if (ch === 'r' || ch === 'b') gems.push({ id: gems.length, x, y, el: ch === 'r' ? 'fire' : 'ice' });
      else if (ch === '1' || ch === '2') buttons.push({ x, y, group: Number(ch) });
      else if (ch === '3' || ch === '4') levers.push({ id: levers.length, x, y, group: Number(ch) });
    }
  }
  if (!spawn.fire || !spawn.ice || !door.fire || !door.ice) throw new Error(`level ${def.id}: needs f, i, F, I`);
  const portal = new Map<number, Cell>();
  for (const [ch, cells] of Object.entries(pairs)) {
    if (cells.length !== 2) throw new Error(`level ${def.id}: portal ${ch} needs exactly 2 cells`);
    const [a, b] = cells as [Cell, Cell];
    portal.set(at(a.x, a.y), b);
    portal.set(at(b.x, b.y), a);
  }
  return { def, solid, oneway, jelly, curtain, gate, keys, locks, portal, pool, spawn: spawn as Record<Element, Cell>, door: door as Record<Element, Cell>, gems, buttons, levers, platforms: def.platforms ?? [] };
}

/** 이 원소에게 (x, y) 칸이 벽인가 (블록·웅덩이·젤리·막는 커튼) — 발판은 따로 */
export function wallFor(level: ParsedLevel, el: Element, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= LEVEL_W || y >= LEVEL_H) return true;
  const i = at(x, y);
  if (level.solid[i]) return true;
  const c = level.curtain[i];
  return !!c && c !== el;
}

/** 이 원소가 이 웅덩이를 밟으면 위험한가 */
export function deadly(el: Element, p: Pool | null): boolean {
  if (!p) return false;
  return p === 'G' || (p === 'L' && el === 'ice') || (p === 'W' && el === 'fire');
}
