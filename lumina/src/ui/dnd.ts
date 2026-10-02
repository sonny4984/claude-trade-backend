/**
 * 드래그 앤 드롭 — 포인터 이벤트 하나로 마우스·터치·펜을 모두 다룬다.
 *  · 6px 이상 움직이면 드래그, 그 전에 떼면 탭 (두 번 탭 = 들어갈 곳이 하나뿐이면 자동 배치)
 *  · 터치에서는 고스트 타일이 손가락 위쪽에 떠서, 놓일 자리가 손가락에 가리지 않는다
 *  · 보드에서는 고스트 아래의 칸이 놓일 자리(칸 하나씩 맞춰 놓는다), 랙·작업대는 [data-drop] 요소로 찾는다
 *  · 규칙 판정은 하지 않는다 — 미리보기도 커널의 previewMove를 그대로 부른다
 */
import { create } from 'zustand';
import { analyzeSet, canMoveTile, cellKey, occupancy, previewMove, isJoker, type MoveTarget, type TileId } from '../game';
import { assistOf, useGame, visibleRack, currentSeatIsHuman } from '../store/game';
import { boardElement, cellAt, startCell } from './game/boardGeometry';
import * as flip from './flip';
import { sfx, unlockAudio } from '../audio/sfx';
import { buzz } from './haptics';

export type DropTarget =
  /** 보드의 칸 — 첫 타일이 이 칸에 놓이고 나머지는 오른쪽 칸들에 */
  | { kind: 'cell'; row: number; col: number }
  | { kind: 'staging'; index: number }
  | { kind: 'rack'; index: number }
  | { kind: 'swap'; setId: string; joker: TileId };

/** neutral: 놓을 수는 있지만 맞는지는 알려 주지 않음 (루미큐브 "스스로" 모드) */
export type PreviewState = 'valid' | 'incomplete' | 'invalid' | 'refuse' | 'neutral';

interface DragState {
  active: boolean;
  tiles: TileId[];
  target: DropTarget | null;
  preview: PreviewState | null;
  /** 놓을 수 없을 때의 이유 코드 (err.* 문구 키) */
  error: string | null;
  touch: boolean;
  /** 고스트 타일 너비(px) — 집은 타일의 크기 그대로 */
  ghostW: number;
}

export const useDrag = create<DragState>(() => ({ active: false, tiles: [], target: null, preview: null, error: null, touch: false, ghostW: 44 }));

let ghostEl: HTMLElement | null = null;
export function registerGhost(el: HTMLElement | null): void {
  ghostEl = el;
}

interface Gesture {
  id: TileId;
  pointerId: number;
  x0: number;
  y0: number;
  t0: number;
  touch: boolean;
  grabDX: number;
  grabDY: number;
  tileW: number;
  tileH: number;
  /** 지금 고스트 타일 너비 — 보드 위에서는 칸 크기로 줄어든다 */
  gw: number;
  /** 터치에서 고스트 중심이 손가락보다 얼마나 위에 뜨는가(px) */
  lift: number;
  dragging: boolean;
  refused: boolean;
  lastX: number;
  lastY: number;
}

let g: Gesture | null = null;
let raf = 0;
let lastTap: { id: TileId; at: number } | null = null;
let edgeDir = 0;
let edgeSince = 0;
let scrollRaf = 0;

const DRAG_START = 6;
const DOUBLE_TAP = 300;

function scrollArea(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-scroll="felt"]');
}

/** 놓을 자리를 가리키는 점: 마우스는 포인터, 터치는 손가락 위에 뜬 고스트 중심 */
function hotPoint(x: number, y: number): { x: number; y: number } {
  if (!g) return { x, y };
  return g.touch ? { x, y: y - g.lift } : { x, y };
}

function moveGhost(x: number, y: number): void {
  if (!ghostEl || !g) return;
  const gh = g.gw * 1.36;
  const k = g.gw / g.tileW;
  const left = g.touch ? x - g.gw / 2 : x - g.grabDX * k;
  const top = g.touch ? y - g.lift - gh / 2 : y - g.grabDY * k;
  ghostEl.style.transform = `translate3d(${left}px, ${top}px, 0)`;
}

/** 보드의 타일 너비 (보드가 화면에 있을 때) */
function boardTileWidth(): number | null {
  const w = Number(boardElement()?.dataset.tw);
  return w > 0 ? w : null;
}

function childTiles(zone: Element, exclude: ReadonlySet<TileId>): { id: TileId; rect: DOMRect }[] {
  return [...zone.querySelectorAll<HTMLElement>('[data-tile-id]')]
    .map((el) => ({ id: Number(el.dataset.tileId), rect: el.getBoundingClientRect() }))
    .filter((c) => !exclude.has(c.id));
}

/** 여러 줄로 감긴 영역에서 (x, y)가 몇 번째 사이인가 */
function insertIndex(children: { rect: DOMRect }[], x: number, y: number): number {
  if (!children.length) return 0;
  let idx = 0;
  for (let i = 0; i < children.length; i++) {
    const r = (children[i] as { rect: DOMRect }).rect;
    const rowTop = r.top - 4;
    const rowBottom = r.bottom + 4;
    if (y > rowBottom) {
      idx = i + 1;
      continue;
    }
    if (y >= rowTop && y <= rowBottom) {
      if (x > r.left + r.width / 2) idx = i + 1;
      continue;
    }
  }
  return idx;
}

/** 보드 위 (x, y)에 첫 타일이 오도록 한 목표 — 조커 위면 바꾸기 */
function boardTarget(x: number, y: number, tiles: readonly TileId[]): DropTarget | null {
  const c = cellAt(x, y);
  if (!c) return null;
  if (tiles.length === 1 && !isJoker(tiles[0] as TileId)) {
    const session = useGame.getState().session;
    const sets = session?.match.game.turn.work.sets ?? [];
    const there = occupancy(sets).get(cellKey(c.row, c.col));
    if (there !== undefined && isJoker(there) && there !== tiles[0]) {
      const holder = sets.find((st) => st.tiles.includes(there));
      if (holder) return { kind: 'swap', setId: holder.id, joker: there };
    }
  }
  const at = startCell(c, g && !g.touch ? Math.max(0, tiles.indexOf(g.id)) : 0, tiles.length);
  return { kind: 'cell', row: at.row, col: at.col };
}

function computeTarget(x: number, y: number, tiles: readonly TileId[]): DropTarget | null {
  const stack = document.elementsFromPoint(x, y);
  const zoneEl = stack.map((e) => (e as HTMLElement).closest<HTMLElement>('[data-drop]')).find(Boolean) ?? null;
  if (!zoneEl) return null;
  const kind = zoneEl.dataset.drop;
  const exclude = new Set(tiles);
  if (kind === 'felt' || kind === 'set') return boardTarget(x, y, tiles);
  if (kind === 'staging') return { kind: 'staging', index: insertIndex(childTiles(zoneEl, exclude), x, y) };
  if (kind === 'rack') return { kind: 'rack', index: insertIndex(childTiles(zoneEl, exclude), x, y) };
  return null;
}

function toMove(t: DropTarget): MoveTarget | null {
  switch (t.kind) {
    case 'cell':
      return { kind: 'cell', row: t.row, col: t.col };
    case 'staging':
      return { kind: 'staging', index: t.index };
    default:
      return null;
  }
}

function previewOf(t: DropTarget, tiles: readonly TileId[]): { state: PreviewState; error: string | null } {
  const s = useGame.getState().session;
  if (!s) return { state: 'refuse', error: null };
  const turn = s.match.game.turn;
  if (t.kind === 'rack') {
    // 랙에는 이번 차례에 랙에서 나간 타일만 돌아올 수 있다
    return tiles.every((id) => turn.start.rack.includes(id)) ? { state: 'valid', error: null } : { state: 'refuse', error: 'table-to-rack' };
  }
  const blind = assistOf(s.mode) === 'self';
  if (t.kind === 'swap') {
    const holder = turn.work.sets.find((x) => x.id === t.setId);
    if (!holder) return { state: 'refuse', error: null };
    if (blind) return { state: 'neutral', error: null };
    const swapped = holder.tiles.map((id) => (id === t.joker ? (tiles[0] as TileId) : id));
    const a = analyzeSet(swapped);
    return { state: a.state === 'valid' ? 'valid' : a.state, error: null };
  }
  const mt = toMove(t);
  if (!mt) return { state: 'refuse', error: null };
  const r = previewMove(turn, tiles, mt);
  if (!r.ok) return { state: 'refuse', error: r.error };
  if (t.kind === 'staging') return { state: 'incomplete', error: null };
  // 규칙상 놓을 수는 있다 — 맞는 세트가 되는지는 스스로 판단
  if (blind) return { state: 'neutral', error: null };
  // 놓은 타일이 속하게 되는 세트의 상태
  const holder = r.turn.work.sets.find((x) => x.tiles.includes(tiles[0] as TileId));
  return { state: holder ? analyzeSet(holder.tiles).state : 'valid', error: null };
}

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 고스트 아래의 놓을 자리를 다시 계산한다 (움직일 때, 그리고 자동 스크롤로 보드가 밀릴 때) */
function updateTarget(): void {
  if (!g || !g.dragging) return;
  const hp = hotPoint(g.lastX, g.lastY);
  const tiles = useDrag.getState().tiles;
  // 타일(손가락 위) 자리에서 못 찾으면 손가락 자리로 한 번 더
  const target = computeTarget(hp.x, hp.y, tiles) ?? (g.touch ? computeTarget(g.lastX, g.lastY, tiles) : null);
  const prev = useDrag.getState().target;
  if (sameTarget(prev, target)) return;
  const pv = target ? previewOf(target, tiles) : null;
  useDrag.setState({ target, preview: pv ? pv.state : null, error: pv ? pv.error : null });
  if (target && pv && pv.state !== 'refuse') buzz('tap');
  // 보드 위에서는 고스트가 칸 크기로 줄어든다 — 놓일 칸이 가려지지 않게
  const over = !!target && (target.kind === 'cell' || target.kind === 'swap');
  const w = over ? (boardTileWidth() ?? g.tileW) : g.tileW;
  if (Math.abs(w - g.gw) > 0.5) {
    g.gw = w;
    useDrag.setState({ ghostW: w });
    moveGhost(g.lastX, g.lastY);
  }
}

/** 가장자리에서 이만큼 머물러야 판이 밀린다 — 랙에서 판으로 끌고 올라오며 스쳐 지나갈 때는 밀리지 않게 */
const EDGE_DWELL = 320;
const EDGE = 32;

function autoScroll(y: number): void {
  const area = scrollArea();
  if (!area) return;
  const r = area.getBoundingClientRect();
  // 더 내려갈(올라갈) 곳이 있을 때만 — 판이 화면에 다 들어오면 가장자리에서도 밀리지 않는다
  const canUp = area.scrollTop > 0;
  const canDown = area.scrollTop + area.clientHeight < area.scrollHeight - 1;
  const dir = canUp && y > r.top - 40 && y < r.top + EDGE ? -1 : canDown && y > r.bottom - EDGE && y < r.bottom + 12 ? 1 : 0;
  if (dir !== edgeDir) {
    edgeDir = dir;
    edgeSince = performance.now();
  }
  if (dir && !scrollRaf) scrollRaf = requestAnimationFrame(scrollStep);
}

function scrollStep(): void {
  scrollRaf = 0;
  const area = scrollArea();
  if (!area || !g?.dragging || !edgeDir) return;
  if (performance.now() - edgeSince >= EDGE_DWELL) {
    const before = area.scrollTop;
    area.scrollTop += edgeDir * 8;
    if (area.scrollTop !== before) updateTarget();
  }
  scrollRaf = requestAnimationFrame(scrollStep);
}

function orderedDragTiles(id: TileId): TileId[] {
  const { selection, session } = useGame.getState();
  if (!selection.includes(id) || !session) return [id];
  // 커널이 놓는 순서와 같게: 보드의 타일은 읽는 순서(위→아래, 왼쪽→오른쪽), 그다음 작업대, 마지막에 랙
  const rack = visibleRack(session);
  const w = session.match.game.turn.work;
  const board = w.sets.slice().sort((a, b) => a.row - b.row || a.col - b.col).flatMap((s) => s.tiles);
  const order = [...board, ...w.staging, ...rack];
  return selection.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function startDrag(): void {
  if (!g) return;
  const tiles = orderedDragTiles(g.id);
  const s = useGame.getState().session;
  if (!s) return;
  for (const id of tiles) {
    const err = canMoveTile(s.match.game.turn, id);
    if (err) {
      g.refused = true;
      useGame.getState().toastMsg(useGame.getState().session ? errorText(err) : '', 'bad');
      useGame.getState().shakeTiles([id]);
      sfx('invalid');
      buzz('error');
      return;
    }
  }
  g.dragging = true;
  useDrag.setState({ active: true, tiles, target: null, preview: null, error: null, touch: g.touch, ghostW: g.tileW });
  sfx('pick');
  buzz('pick');
  document.body.classList.add('is-dragging');
  requestAnimationFrame(() => moveGhost(g?.lastX ?? 0, g?.lastY ?? 0));
}

let errorText: (code: string) => string = (c) => c;
export function setErrorText(fn: (code: string) => string): void {
  errorText = fn;
}

function onMove(e: PointerEvent): void {
  if (!g || e.pointerId !== g.pointerId) return;
  g.lastX = e.clientX;
  g.lastY = e.clientY;
  if (!g.dragging && !g.refused) {
    const d = Math.hypot(e.clientX - g.x0, e.clientY - g.y0);
    if (d > DRAG_START) startDrag();
    return;
  }
  if (!g.dragging) return;
  e.preventDefault();
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (!g) return;
    moveGhost(g.lastX, g.lastY);
    autoScroll(hotPoint(g.lastX, g.lastY).y);
    updateTarget();
  });
}

function finish(e: PointerEvent, cancelled: boolean): void {
  if (!g || e.pointerId !== g.pointerId) return;
  const gest = g;
  g = null;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onCancel);
  edgeDir = 0;
  document.body.classList.remove('is-dragging');
  if (!gest.dragging) {
    if (gest.refused || cancelled) return;
    // 탭
    const now = performance.now();
    const store = useGame.getState();
    if (lastTap && lastTap.id === gest.id && now - lastTap.at < DOUBLE_TAP) {
      lastTap = null;
      store.quickPlay(gest.id);
      return;
    }
    lastTap = { id: gest.id, at: now };
    store.select(gest.id);
    return;
  }
  const { tiles, target, preview, error } = useDrag.getState();
  // 고스트의 각 타일 위치에서 제자리로 / 새 자리로 날아가게
  flip.capture();
  if (ghostEl) {
    ghostEl.querySelectorAll<HTMLElement>('[data-ghost-id]').forEach((el) => {
      flip.from(Number(el.dataset.ghostId), el.getBoundingClientRect(), 0, 200);
    });
  }
  useDrag.setState({ active: false, tiles: [], target: null, preview: null, error: null });
  const store = useGame.getState();
  let ok = false;
  if (!cancelled && target && preview !== 'refuse') {
    if (target.kind === 'rack') ok = store.dropTiles(tiles, { kind: 'rack-order', index: target.index });
    else if (target.kind === 'swap') ok = store.dropTiles(tiles, { kind: 'swap', joker: target.joker });
    else {
      const mt = toMove(target);
      if (mt) ok = store.dropTiles(tiles, mt);
    }
  } else if (!cancelled && target && preview === 'refuse') {
    store.toastMsg(errorText(error ?? (target.kind === 'rack' ? 'table-to-rack' : 'locked-before-meld')), 'bad');
    sfx('invalid');
    buzz('error');
  }
  if (!ok) {
    // 제자리로 돌아가는 모습을 보여 준다
    useGame.setState({ layoutTick: useGame.getState().layoutTick + 1 });
  }
}

function onUp(e: PointerEvent): void {
  finish(e, false);
}
function onCancel(e: PointerEvent): void {
  finish(e, true);
}

/** 타일의 onPointerDown에 연결 */
export function tilePointerDown(e: React.PointerEvent<HTMLElement>, id: TileId): void {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  if (g) return;
  unlockAudio();
  const store = useGame.getState();
  if (!store.session || store.curtain || store.ai || store.waiting || !currentSeatIsHuman(store.session)) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  g = {
    id,
    pointerId: e.pointerId,
    x0: e.clientX,
    y0: e.clientY,
    t0: performance.now(),
    touch: e.pointerType !== 'mouse',
    grabDX: e.clientX - r.left,
    grabDY: e.clientY - r.top,
    tileW: r.width,
    tileH: r.height,
    gw: r.width,
    lift: Math.max(r.height * 0.85, 46),
    dragging: false,
    refused: false,
    lastX: e.clientX,
    lastY: e.clientY,
  };
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
}

/** 드래그 중 Esc = 취소 */
export function cancelDrag(): void {
  if (!g?.dragging) return;
  const fake = { pointerId: g.pointerId } as PointerEvent;
  finish(fake, true);
}
