/**
 * 드래그 앤 드롭 — 포인터 이벤트 하나로 마우스·터치·펜을 모두 다룬다.
 *  · 6px 이상 움직이면 드래그, 그 전에 떼면 탭, 0.42초 가만히 누르면 길게 누르기
 *  · 터치에서는 고스트 타일이 손가락 위쪽에 떠서, 놓일 자리가 손가락에 가리지 않는다
 *  · 놓을 곳은 [data-drop] 요소로 찾고, 타일 사이 삽입 위치를 얇은 선으로 보여 준다
 *  · 규칙 판정은 하지 않는다 — 미리보기도 커널의 previewMove를 그대로 부른다
 */
import { create } from 'zustand';
import { analyzeSet, canMoveTile, previewMove, isJoker, type MoveTarget, type TileId } from '../game';
import { useGame, visibleRack, currentSeatIsHuman } from '../store/game';
import * as flip from './flip';
import { sfx, unlockAudio } from '../audio/sfx';
import { buzz } from './haptics';

export type DropTarget =
  | { kind: 'set'; setId: string; index: number }
  | { kind: 'new'; before?: string }
  | { kind: 'staging'; index: number }
  | { kind: 'rack'; index: number }
  | { kind: 'swap'; setId: string; joker: TileId };

export type PreviewState = 'valid' | 'incomplete' | 'invalid' | 'refuse';

interface DragState {
  active: boolean;
  tiles: TileId[];
  target: DropTarget | null;
  preview: PreviewState | null;
  touch: boolean;
}

export const useDrag = create<DragState>(() => ({ active: false, tiles: [], target: null, preview: null, touch: false }));

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
  dragging: boolean;
  refused: boolean;
  longTimer: ReturnType<typeof setTimeout> | null;
  longFired: boolean;
  lastX: number;
  lastY: number;
}

let g: Gesture | null = null;
let raf = 0;
let lastTap: { id: TileId; at: number } | null = null;
let scrollVel = 0;
let scrollRaf = 0;

const DRAG_START = 6;
const LONG_PRESS = 420;
const DOUBLE_TAP = 300;

function scrollArea(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-scroll="felt"]');
}

function hotPoint(x: number, y: number): { x: number; y: number } {
  if (!g) return { x, y };
  // 터치: 고스트 중심을 기준으로 (손가락보다 위)
  if (g.touch) return { x, y: y - g.tileH * 0.85 };
  return { x: x - g.grabDX + g.tileW / 2, y: y - g.grabDY + g.tileH / 2 };
}

function moveGhost(x: number, y: number): void {
  if (!ghostEl || !g) return;
  const left = g.touch ? x - g.tileW / 2 : x - g.grabDX;
  const top = g.touch ? y - g.tileH * 1.35 : y - g.grabDY;
  ghostEl.style.transform = `translate3d(${left}px, ${top}px, 0)`;
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

function computeTarget(x: number, y: number, tiles: readonly TileId[]): DropTarget | null {
  const stack = document.elementsFromPoint(x, y);
  const zoneEl = stack.map((e) => (e as HTMLElement).closest<HTMLElement>('[data-drop]')).find(Boolean) ?? null;
  if (!zoneEl) return null;
  const kind = zoneEl.dataset.drop;
  const exclude = new Set(tiles);
  if (kind === 'set') {
    const setId = zoneEl.dataset.setId as string;
    const kids = childTiles(zoneEl, exclude);
    if (tiles.length === 1 && !isJoker(tiles[0] as TileId)) {
      for (const k of kids) {
        if (!isJoker(k.id)) continue;
        const r = k.rect;
        if (x > r.left + r.width * 0.2 && x < r.right - r.width * 0.2 && y > r.top && y < r.bottom) {
          return { kind: 'swap', setId, joker: k.id };
        }
      }
    }
    return { kind: 'set', setId, index: insertIndex(kids, x, y) };
  }
  if (kind === 'new' || kind === 'felt') return { kind: 'new', ...(zoneEl.dataset.before ? { before: zoneEl.dataset.before } : {}) };
  if (kind === 'staging') return { kind: 'staging', index: insertIndex(childTiles(zoneEl, exclude), x, y) };
  if (kind === 'rack') return { kind: 'rack', index: insertIndex(childTiles(zoneEl, exclude), x, y) };
  return null;
}

function toMove(t: DropTarget): MoveTarget | null {
  switch (t.kind) {
    case 'set':
      return { kind: 'set', setId: t.setId, index: t.index };
    case 'new':
      return t.before ? { kind: 'new', before: t.before } : { kind: 'new' };
    case 'staging':
      return { kind: 'staging', index: t.index };
    default:
      return null;
  }
}

function previewOf(t: DropTarget, tiles: readonly TileId[]): PreviewState {
  const s = useGame.getState().session;
  if (!s) return 'refuse';
  const turn = s.match.game.turn;
  if (t.kind === 'rack') {
    // 랙에는 이번 차례에 랙에서 나간 타일만 돌아올 수 있다
    return tiles.every((id) => turn.start.rack.includes(id)) ? 'valid' : 'refuse';
  }
  if (t.kind === 'swap') {
    const holder = turn.work.sets.find((x) => x.id === t.setId);
    if (!holder) return 'refuse';
    const swapped = holder.tiles.map((id) => (id === t.joker ? (tiles[0] as TileId) : id));
    const a = analyzeSet(swapped);
    return a.state === 'valid' ? 'valid' : a.state;
  }
  const mt = toMove(t);
  if (!mt) return 'refuse';
  const r = previewMove(turn, tiles, mt);
  if (!r.ok) return 'refuse';
  if (t.kind === 'staging') return 'incomplete';
  // 새로 생기거나 바뀐 세트 중 가장 나쁜 상태
  let worst: PreviewState = 'valid';
  for (const id of r.affected) {
    const set = r.turn.work.sets.find((x) => x.id === id);
    if (!set || !set.tiles.some((x) => tiles.includes(x))) continue;
    const a = analyzeSet(set.tiles);
    if (a.state === 'invalid') worst = 'invalid';
    else if (a.state === 'incomplete' && worst === 'valid') worst = 'incomplete';
  }
  return worst;
}

function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function autoScroll(y: number): void {
  const area = scrollArea();
  if (!area) return;
  const r = area.getBoundingClientRect();
  const edge = 44;
  scrollVel = y < r.top + edge && y > r.top - 60 ? -8 : y > r.bottom - edge && y < r.bottom + 20 ? 8 : 0;
  if (scrollVel && !scrollRaf) {
    const step = (): void => {
      if (!scrollVel || !g?.dragging) {
        scrollRaf = 0;
        return;
      }
      area.scrollTop += scrollVel;
      scrollRaf = requestAnimationFrame(step);
    };
    scrollRaf = requestAnimationFrame(step);
  }
}

function orderedDragTiles(id: TileId): TileId[] {
  const { selection, session } = useGame.getState();
  if (!selection.includes(id) || !session) return [id];
  // 화면 순서대로 (랙 → 테이블 → 작업대)
  const rack = visibleRack(session);
  const w = session.match.game.turn.work;
  const order = [...rack, ...w.sets.flatMap((s) => s.tiles), ...w.staging];
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
  useDrag.setState({ active: true, tiles, target: null, preview: null, touch: g.touch });
  useGame.getState().setSplit(null);
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
    if (d > DRAG_START && !g.longFired) {
      if (g.longTimer) clearTimeout(g.longTimer);
      startDrag();
    }
    return;
  }
  if (!g.dragging) return;
  e.preventDefault();
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (!g) return;
    moveGhost(g.lastX, g.lastY);
    const hp = hotPoint(g.lastX, g.lastY);
    autoScroll(hp.y);
    const tiles = useDrag.getState().tiles;
    const target = computeTarget(hp.x, hp.y, tiles);
    const prev = useDrag.getState().target;
    if (!sameTarget(prev, target)) {
      const preview = target ? previewOf(target, tiles) : null;
      useDrag.setState({ target, preview });
      if (target && preview !== 'refuse') buzz('tap');
    }
  });
}

function finish(e: PointerEvent, cancelled: boolean): void {
  if (!g || e.pointerId !== g.pointerId) return;
  const gest = g;
  g = null;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onCancel);
  if (gest.longTimer) clearTimeout(gest.longTimer);
  scrollVel = 0;
  document.body.classList.remove('is-dragging');
  if (!gest.dragging) {
    if (gest.refused || gest.longFired || cancelled) return;
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
  const { tiles, target, preview } = useDrag.getState();
  // 고스트의 각 타일 위치에서 제자리로 / 새 자리로 날아가게
  flip.capture();
  if (ghostEl) {
    ghostEl.querySelectorAll<HTMLElement>('[data-ghost-id]').forEach((el) => {
      flip.from(Number(el.dataset.ghostId), el.getBoundingClientRect(), 0, 200);
    });
  }
  useDrag.setState({ active: false, tiles: [], target: null, preview: null });
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
    store.toastMsg(errorText(target.kind === 'rack' ? 'table-to-rack' : 'locked-before-meld'), 'bad');
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
    dragging: false,
    refused: false,
    longTimer: null,
    longFired: false,
    lastX: e.clientX,
    lastY: e.clientY,
  };
  const setEl = el.closest<HTMLElement>('[data-drop="set"]');
  if (setEl) {
    g.longTimer = setTimeout(() => {
      if (!g || g.dragging) return;
      g.longFired = true;
      useGame.getState().setSplit(setEl.dataset.setId ?? null);
      sfx('split');
      buzz('warn');
    }, LONG_PRESS);
  }
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
