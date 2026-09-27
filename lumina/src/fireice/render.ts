/**
 * 불과 얼음 그리기 (캔버스 2D) — 소풍 과자 나라:
 * 크림 아이싱 쿠키 블록, 딸기잼·블루베리·말차 웅덩이, 사탕, 아치 문, 버튼 접시, 사탕 레버, 비스킷 발판.
 * 캐릭터는 기니피그 스티커(draw2d)에 불꽃 머리 장식·눈꽃 핀과 빛무리를 더한다.
 * 움직이지 않는 것(배경·블록·문틀)은 한 번만 그려 두고(정적 층), 매 프레임엔 나머지만 그린다.
 */
import { LEVEL_H, LEVEL_W, at, type Element, type ParsedLevel, type Pool } from './level';
import { PHYS, type WorldState } from './world';
import { drawCharacter, type Expression } from '../characters/draw2d';
import type { CharacterId } from '../characters/roster';

export const GROUP_COLOR: Readonly<Record<number, string>> = { 1: '#FFC93C', 2: '#B884FF', 3: '#43CFA0', 4: '#FF9F43' };
const EL_COLOR: Record<Element, { main: string; light: string; glow: string }> = {
  fire: { main: '#FF6A3D', light: '#FFD166', glow: 'rgba(255,120,60,' },
  ice: { main: '#3FA7F5', light: '#BDE8FF', glow: 'rgba(80,180,255,' },
};
const POOL_COLOR: Record<Pool, { deep: string; top: string; shine: string }> = {
  L: { deep: '#F2466B', top: '#FF8AA0', shine: 'rgba(255,255,255,0.55)' },
  W: { deep: '#3E8FE8', top: '#8FCBFF', shine: 'rgba(255,255,255,0.6)' },
  G: { deep: '#6FA83A', top: '#A9D86E', shine: 'rgba(255,255,255,0.45)' },
};
const INK = '#3B2A20';

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** 칸마다 같은 값이 나오는 작은 난수 (쿠키 구멍 무늬) */
function hash(x: number, y: number, k = 0): number {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function solidAt(lv: ParsedLevel, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= LEVEL_W || y >= LEVEL_H) return true;
  return (lv.solid[at(x, y)] as boolean) && !lv.pool[at(x, y)];
}

/** 정적 층: 배경 + 쿠키 블록 + 문틀. tile은 CSS 픽셀, dpr 배율로 그린다 */
export function buildStatic(lv: ParsedLevel, tile: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(LEVEL_W * tile * dpr);
  c.height = Math.round(LEVEL_H * tile * dpr);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.scale(dpr, dpr);
  const T = tile;
  // 배경: 복숭아빛 → 크림, 옅은 물방울 무늬
  const g = ctx.createLinearGradient(0, 0, 0, LEVEL_H * T);
  g.addColorStop(0, '#FFE9D6');
  g.addColorStop(1, '#FFF7EC');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LEVEL_W * T, LEVEL_H * T);
  ctx.fillStyle = 'rgba(255, 170, 150, 0.14)';
  for (let y = 0; y < LEVEL_H; y++)
    for (let x = 0; x < LEVEL_W; x++) {
      if ((x + y) % 2) continue;
      ctx.beginPath();
      ctx.arc((x + 0.5) * T, (y + 0.5) * T, T * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }

  // 쿠키 블록 — 이어진 덩어리처럼: 전부 칠하고, 드러난 가장자리에 그림자·아이싱
  for (let y = 0; y < LEVEL_H; y++)
    for (let x = 0; x < LEVEL_W; x++) {
      if (!solidAt(lv, x, y)) continue;
      const px = x * T;
      const py = y * T;
      ctx.fillStyle = '#E7B26E';
      ctx.fillRect(px - 0.5, py - 0.5, T + 1, T + 1);
      // 아래·옆 드러난 면은 진하게
      ctx.fillStyle = '#C98B4B';
      if (!solidAt(lv, x, y + 1)) ctx.fillRect(px, py + T * 0.82, T, T * 0.18);
      if (!solidAt(lv, x - 1, y)) ctx.fillRect(px, py, T * 0.1, T);
      if (!solidAt(lv, x + 1, y)) ctx.fillRect(px + T * 0.9, py, T * 0.1, T);
      // 쿠키 구멍
      ctx.fillStyle = '#B97A3E';
      for (let k = 0; k < 2; k++) {
        const hx = 0.2 + hash(x, y, k) * 0.6;
        const hy = 0.3 + hash(x, y, k + 7) * 0.45;
        ctx.beginPath();
        ctx.arc(px + hx * T, py + hy * T, T * 0.055, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  // 위가 드러난 블록엔 크림 아이싱 (물결 모양으로 흘러내림)
  for (let y = 0; y < LEVEL_H; y++)
    for (let x = 0; x < LEVEL_W; x++) {
      if (!solidAt(lv, x, y) || solidAt(lv, x, y - 1) || y === 0) continue;
      const px = x * T;
      const py = y * T;
      ctx.fillStyle = '#FFF4E6';
      ctx.beginPath();
      ctx.moveTo(px - 0.5, py);
      ctx.lineTo(px + T + 0.5, py);
      ctx.lineTo(px + T + 0.5, py + T * 0.16);
      const drips = 3;
      for (let k = drips; k >= 0; k--) {
        const dx = px + (k / drips) * T;
        const deep = hash(x, y, k + 3) > 0.6 ? 0.34 : 0.2;
        ctx.quadraticCurveTo(dx + T / drips / 2, py + T * deep, dx, py + T * 0.16);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(px + T * 0.08, py + T * 0.03, T * 0.3, T * 0.04);
    }

  // 문틀 (아치) — 안쪽 불빛은 매 프레임
  for (const el of ['fire', 'ice'] as const) {
    const d = lv.door[el];
    const col = EL_COLOR[el];
    const x0 = d.x * T + T * 0.06;
    const w = T * 0.88;
    const top = d.y * T - T * 0.45;
    const h = T * 1.45;
    ctx.fillStyle = col.main;
    ctx.beginPath();
    ctx.moveTo(x0, top + h);
    ctx.lineTo(x0, top + w / 2);
    ctx.arc(x0 + w / 2, top + w / 2, w / 2, Math.PI, 0);
    ctx.lineTo(x0 + w, top + h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.5, T * 0.05);
    ctx.stroke();
  }
  return c;
}

/** 캐릭터 스프라이트: 표정마다 한 장 (크기는 칸 × 1.3) */
export type Sprites = Record<Element, Partial<Record<Expression, HTMLCanvasElement>>>;

export function buildSprites(chars: Readonly<Record<Element, CharacterId>>, tile: number, dpr: number): Sprites {
  const size = Math.max(24, Math.round(tile * 1.3 * dpr));
  const out: Sprites = { fire: {}, ice: {} };
  for (const el of ['fire', 'ice'] as const) {
    for (const ex of ['idle', 'blink', 'happy', 'surprised', 'sad'] as const) {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      if (!ctx) continue;
      drawCharacter(ctx, chars[el], ex, size);
      accessory(ctx, el, size);
      out[el][ex] = c;
    }
  }
  return out;
}

/** 불: 머리 위 불꽃 한 송이 / 얼음: 눈꽃 핀과 하늘색 목도리 */
function accessory(ctx: CanvasRenderingContext2D, el: Element, size: number): void {
  const s = size;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#141414';
  ctx.lineWidth = s * 0.022;
  if (el === 'fire') {
    const cx = s * 0.5;
    const by = s * 0.2;
    ctx.fillStyle = '#FF6A3D';
    ctx.beginPath();
    ctx.moveTo(cx, by - s * 0.2);
    ctx.bezierCurveTo(cx + s * 0.13, by - s * 0.08, cx + s * 0.12, by + s * 0.04, cx, by + s * 0.05);
    ctx.bezierCurveTo(cx - s * 0.12, by + s * 0.04, cx - s * 0.13, by - s * 0.07, cx - s * 0.03, by - s * 0.13);
    ctx.quadraticCurveTo(cx - s * 0.02, by - s * 0.05, cx, by - s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFD166';
    ctx.beginPath();
    ctx.ellipse(cx, by - s * 0.01, s * 0.045, s * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    // 볼 발그레
    ctx.fillStyle = 'rgba(255,110,80,0.35)';
    for (const dx of [-0.2, 0.2]) {
      ctx.beginPath();
      ctx.ellipse(s * (0.5 + dx), s * 0.47, s * 0.05, s * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // 눈꽃 핀
    const cx = s * 0.7;
    const cy = s * 0.17;
    const r = s * 0.075;
    ctx.strokeStyle = '#2E86DE';
    ctx.lineWidth = s * 0.028;
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }
    ctx.fillStyle = '#BDE8FF';
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.025, 0, Math.PI * 2);
    ctx.fill();
    // 목도리
    ctx.fillStyle = '#8FD3FF';
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = s * 0.02;
    rr(ctx, s * 0.3, s * 0.6, s * 0.4, s * 0.075, s * 0.035);
    ctx.fill();
    ctx.stroke();
    rr(ctx, s * 0.56, s * 0.64, s * 0.08, s * 0.14, s * 0.03);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  r: number;
}

export interface DrawOpts {
  readonly tile: number;
  readonly dpr: number;
  readonly now: number;
  readonly staticLayer: HTMLCanvasElement;
  readonly sprites: Sprites;
  readonly particles: readonly Particle[];
  /** 머리 위 표시 ("나" 또는 지금 움직이는 쪽) */
  readonly marker: Element | null;
  readonly markerText: string;
}

function drawPool(ctx: CanvasRenderingContext2D, x: number, y: number, T: number, p: Pool, t: number, lv: ParsedLevel): void {
  const col = POOL_COLOR[p];
  const px = x * T;
  const py = y * T;
  const surf = py + T * 0.1;
  ctx.fillStyle = col.deep;
  ctx.beginPath();
  ctx.moveTo(px, py + T);
  ctx.lineTo(px, surf);
  const n = 4;
  for (let k = 0; k <= n; k++) {
    const wx = px + (k / n) * T;
    const wy = surf + Math.sin(t * 3 + (x * n + k) * 1.3) * T * 0.035;
    ctx.lineTo(wx, wy);
  }
  ctx.lineTo(px + T, py + T);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = col.top;
  ctx.fillRect(px, surf + T * 0.02, T, T * 0.1);
  ctx.fillStyle = col.shine;
  ctx.fillRect(px + T * 0.15 + Math.sin(t * 1.7 + x) * T * 0.08, surf + T * 0.05, T * 0.22, T * 0.035);
  if (p === 'G') {
    // 말차 거품
    ctx.fillStyle = 'rgba(230,255,200,0.7)';
    const k = (t * 0.7 + hash(x, y) * 3) % 1;
    ctx.beginPath();
    ctx.arc(px + T * (0.25 + hash(x, y, 1) * 0.5), py + T * (0.85 - k * 0.6), T * 0.05 * (1 - k * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  // 옆이 블록이면 쿠키 벽을 조금 보이게
  ctx.fillStyle = '#C98B4B';
  if (solidAt(lv, x - 1, y)) ctx.fillRect(px, py + T * 0.1, T * 0.05, T * 0.9);
  if (solidAt(lv, x + 1, y)) ctx.fillRect(px + T * 0.95, py + T * 0.1, T * 0.05, T * 0.9);
}

function drawCandy(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, el: Element, t: number): void {
  const col = el === 'fire' ? { a: '#FF4D6D', b: '#FFD1DA' } : { a: '#3D8BFF', b: '#CFE6FF' };
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(t * 2.2 + cx) * 0.15);
  // 포장 꼬임
  ctx.fillStyle = col.b;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, r * 0.14);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.8, 0);
    ctx.lineTo(s * r * 1.6, -r * 0.55);
    ctx.lineTo(s * r * 1.6, r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = col.a;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 소용돌이
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = r * 0.22;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.5, t * 2, t * 2 + Math.PI * 1.2);
  ctx.stroke();
  ctx.restore();
}

function drawDoorGlow(ctx: CanvasRenderingContext2D, lv: ParsedLevel, el: Element, T: number, inside: boolean, t: number): void {
  const d = lv.door[el];
  const col = EL_COLOR[el];
  const x0 = d.x * T + T * 0.2;
  const w = T * 0.6;
  const top = d.y * T - T * 0.25;
  const h = T * 1.25;
  ctx.save();
  ctx.fillStyle = inside ? col.light : '#FFF7EC';
  ctx.globalAlpha = inside ? 0.8 + Math.sin(t * 6) * 0.2 : 1;
  ctx.beginPath();
  ctx.moveTo(x0, top + h);
  ctx.lineTo(x0, top + w / 2);
  ctx.arc(x0 + w / 2, top + w / 2, w / 2, Math.PI, 0);
  ctx.lineTo(x0 + w, top + h);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  // 문 표시: 불꽃 / 눈꽃
  const cx = d.x * T + T / 2;
  const cy = d.y * T + T * 0.2;
  if (el === 'fire') {
    ctx.fillStyle = col.main;
    ctx.beginPath();
    ctx.moveTo(cx, cy - T * 0.2);
    ctx.quadraticCurveTo(cx + T * 0.16, cy + T * 0.02, cx, cy + T * 0.12);
    ctx.quadraticCurveTo(cx - T * 0.16, cy + T * 0.02, cx, cy - T * 0.2);
    ctx.fill();
  } else {
    ctx.strokeStyle = col.main;
    ctx.lineWidth = T * 0.05;
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3 + Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * T * 0.14, cy - Math.sin(a) * T * 0.14);
      ctx.lineTo(cx + Math.cos(a) * T * 0.14, cy + Math.sin(a) * T * 0.14);
      ctx.stroke();
    }
  }
  if (inside) {
    ctx.fillStyle = col.glow + '0.25)';
    ctx.beginPath();
    ctx.arc(cx, d.y * T + T * 0.3, T * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawFrame(ctx: CanvasRenderingContext2D, w: WorldState, o: DrawOpts): void {
  const T = o.tile;
  const lv = w.level;
  const t = o.now / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(o.staticLayer, 0, 0);
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);

  // 문 안쪽
  drawDoorGlow(ctx, lv, 'fire', T, w.bodies.fire.atDoor, t);
  drawDoorGlow(ctx, lv, 'ice', T, w.bodies.ice.atDoor, t);

  // 웅덩이
  for (let y = 0; y < LEVEL_H; y++)
    for (let x = 0; x < LEVEL_W; x++) {
      const p = lv.pool[at(x, y)];
      if (p) drawPool(ctx, x, y, T, p, t, lv);
    }

  // 버튼 접시
  for (const b of lv.buttons) {
    const on = w.pressed[b.group] ?? false;
    const h = on ? T * 0.07 : T * 0.18;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, T * 0.04);
    rr(ctx, b.x * T + T * 0.08, (b.y + 1) * T - T * 0.08, T * 0.84, T * 0.08, T * 0.04);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = GROUP_COLOR[b.group] ?? '#FFC93C';
    rr(ctx, b.x * T + T * 0.18, (b.y + 1) * T - T * 0.08 - h, T * 0.64, h, T * 0.06);
    ctx.fill();
    ctx.stroke();
  }

  // 레버: 받침 + 사탕 막대 (꺼짐 왼쪽, 켜짐 오른쪽으로 기움)
  lv.levers.forEach((l, i) => {
    const on = w.levers[i] ?? false;
    const bx = l.x * T + T / 2;
    const by = (l.y + 1) * T;
    const ang = on ? 0.6 : -0.6;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = T * 0.14;
    ctx.beginPath();
    ctx.moveTo(bx, by - T * 0.12);
    ctx.lineTo(bx + Math.sin(ang) * T * 0.62, by - T * 0.12 - Math.cos(ang) * T * 0.62);
    ctx.stroke();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = T * 0.08;
    ctx.stroke();
    ctx.fillStyle = GROUP_COLOR[l.group] ?? '#FF9F43';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, T * 0.045);
    ctx.beginPath();
    ctx.arc(bx + Math.sin(ang) * T * 0.66, by - T * 0.12 - Math.cos(ang) * T * 0.66, T * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#E7B26E';
    ctx.beginPath();
    ctx.ellipse(bx, by - T * 0.06, T * 0.26, T * 0.13, 0, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });

  // 비스킷 발판
  lv.platforms.forEach((d, i) => {
    const p = w.plats[i];
    if (!p) return;
    const x = p.x * T;
    const y = p.y * T;
    ctx.fillStyle = '#F4C98A';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.2, T * 0.05);
    rr(ctx, x + 1, y + 1, d.w * T - 2, d.h * T - 2, T * 0.18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = GROUP_COLOR[d.group] ?? '#FFC93C';
    rr(ctx, x + T * 0.18, y + T * 0.36, d.w * T - T * 0.36, T * 0.18, T * 0.09);
    ctx.fill();
    ctx.fillStyle = '#D69A55';
    for (let k = 0; k < d.w * 2; k++) {
      ctx.beginPath();
      ctx.arc(x + (k + 0.5) * (T / 2), y + T * 0.2, T * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // 사탕
  lv.gems.forEach((g, i) => {
    if (w.gems[i]) return;
    const bob = Math.sin(t * 3 + i) * T * 0.06;
    drawCandy(ctx, g.x * T + T / 2, g.y * T + T / 2 + bob, T * 0.2, g.el, t + i);
  });

  // 캐릭터 (빛무리 → 스프라이트)
  for (const el of ['ice', 'fire'] as const) {
    const b = w.bodies[el];
    const col = EL_COLOR[el];
    const cx = (b.x + PHYS.w / 2) * T;
    const feet = (b.y + PHYS.h) * T;
    const size = T * 1.3;
    const blink = Math.floor(t * 1.3 + (el === 'fire' ? 0 : 0.5)) % 4 === 0 && (t * 1.3) % 1 < 0.12;
    const ex: Expression = !b.alive ? 'sad' : b.atDoor ? 'happy' : b.ground === -2 ? 'surprised' : blink ? 'blink' : 'idle';
    const sprite = o.sprites[el][ex] ?? o.sprites[el].idle;
    ctx.save();
    if (!b.alive) ctx.globalAlpha = 0.55;
    const glow = ctx.createRadialGradient(cx, feet - size * 0.4, size * 0.1, cx, feet - size * 0.4, size * 0.62);
    glow.addColorStop(0, col.glow + '0.45)');
    glow.addColorStop(1, col.glow + '0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, feet - size * 0.4, size * 0.62, 0, Math.PI * 2);
    ctx.fill();
    // 그림자
    ctx.fillStyle = 'rgba(80,40,10,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, feet, size * 0.26, size * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    if (sprite) {
      // 달릴 때 살짝 통통
      const squash = b.ground !== -2 && Math.abs(b.vx) > 0.5 ? 1 + Math.sin(t * 22) * 0.04 : b.ground === -2 ? 1.05 : 1;
      ctx.translate(cx, feet + size * 0.04);
      ctx.scale(b.face, 1);
      ctx.scale(1 / squash, squash);
      ctx.drawImage(sprite, -size / 2, -size, size, size);
    }
    ctx.restore();
  }

  // 머리 위 표시
  if (o.marker) {
    const b = w.bodies[o.marker];
    const cx = (b.x + PHYS.w / 2) * T;
    const top = b.y * T - T * 0.55 + Math.sin(t * 4) * T * 0.05;
    ctx.save();
    ctx.fillStyle = EL_COLOR[o.marker].main;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1.5, T * 0.06);
    ctx.beginPath();
    ctx.moveTo(cx - T * 0.14, top - T * 0.12);
    ctx.lineTo(cx + T * 0.14, top - T * 0.12);
    ctx.lineTo(cx, top + T * 0.06);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    if (o.markerText) {
      ctx.font = `700 ${Math.max(10, T * 0.36)}px Jua, Fredoka, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = Math.max(2, T * 0.1);
      ctx.strokeText(o.markerText, cx, top - T * 0.2);
      ctx.fillText(o.markerText, cx, top - T * 0.2);
    }
    ctx.restore();
  }

  // 반짝이·먼지
  for (const p of o.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x * T, p.y * T, p.r * T, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 사탕 톡, 점프 먼지 — 칸 단위 좌표 */
export function burst(list: Particle[], x: number, y: number, color: string, n: number, speed: number, r = 0.07): void {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.random() * 0.5;
    const v = speed * (0.6 + Math.random() * 0.6);
    list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: 0.5, max: 0.5, color, r });
  }
  if (list.length > 120) list.splice(0, list.length - 120);
}

export function stepParticles(list: Particle[], dt: number): void {
  for (const p of list) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 6 * dt;
    p.life -= dt;
  }
  for (let i = list.length - 1; i >= 0; i--) if ((list[i] as Particle).life <= 0) list.splice(i, 1);
}

export { EL_COLOR };
