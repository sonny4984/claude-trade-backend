/**
 * 기니피그 친구들을 2D 캔버스에 그린다 — 3D 모델과 같은 치수·털옷(anatomy, roster의 coat)으로.
 * 몸·어깨·머리·볼·주둥이(타원체)를 한 점씩 직접 칠해 빛·털 무늬·털결·보송한 가장자리를 내고,
 * 그 위에 귀·눈·코·입·수염·나비넥타이·안경을 그린다. 3D가 늦게 뜨거나 없을 때도 같은 친구로 보이게.
 *  · drawCharacter: 정면 흉상 (초상화·결과 카드·불과 얼음 스프라이트·WebGL이 없을 때)
 */
import { CHARACTERS, type CharacterId, type Coat, type CoatPatch } from './roster';
import {
  BLUSH,
  BODY_POS,
  BODY_R,
  CHEEK_POS,
  CHEEK_R,
  EAR,
  EYE,
  EYE_R,
  SHOULDER_POS,
  SHOULDER_R,
  SKULL_AT,
  SKULL_R,
  SNOUT_POS,
  SNOUT_R,
  browColors,
  darkSnout,
  headTopOf,
  lighten,
  messyOf,
  rgbOf,
  shade,
  skullPoint,
  type V3,
} from './anatomy';

export type Expression = 'idle' | 'blink' | 'happy' | 'surprised' | 'sad' | 'think' | 'win' | 'lose';

const sad = (ex: Expression): boolean => ex === 'sad' || ex === 'lose';

/** 정면에서 본 귀 가운데 (머리 공간 x, y)와 처진 각 — 3D 귀(guinea.ts makeEar)를 정면에 비춘 값 */
const EAR_AT = (() => {
  const p = skullPoint(EAR.yaw, EAR.pitch);
  const n = [p[0] / (SKULL_R[0] * SKULL_R[0]), p[1] / (SKULL_R[1] * SKULL_R[1]), p[2] / (SKULL_R[2] * SKULL_R[2])];
  const nl = Math.hypot(n[0] as number, n[1] as number, n[2] as number);
  const o = [(n[0] as number) / nl + 0.75, (n[1] as number) / nl - 1.45, (n[2] as number) / nl + 0.05];
  const ol = Math.hypot(o[0] as number, o[1] as number, o[2] as number);
  return [p[0] + ((o[0] as number) / ol) * 0.17, p[1] + ((o[1] as number) / ol) * 0.17] as const;
})();
const EAR_TILT = 0.5;

// ── 값 노이즈 (털 무늬 경계·털결·가닥) ─────────────────────────────

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let fx = x - ix;
  let fy = y - iy;
  let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  return l(
    l(l(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx), l(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx), fy),
    l(l(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx), l(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx), fy),
    fz,
  );
}

// ── 털옷 칠하기 ──────────────────────────────────────────────

interface Paint {
  readonly base: [number, number, number];
  readonly patches: readonly { c: V3; r: V3; col: [number, number, number]; a: number }[];
  readonly ticked: number;
  readonly seed: number;
}

function paintOf(coat: Coat, on: 'head' | 'body', seed: number): Paint {
  const list: CoatPatch[] = coat.patches.filter((p) => p.on === on);
  if (on === 'head')
    for (const dir of [-1, 1])
      list.push({ on: 'head', c: [dir * BLUSH.c[0], BLUSH.c[1], BLUSH.c[2]], r: BLUSH.r, color: BLUSH.color, a: BLUSH.a });
  return {
    base: rgbOf(coat.base),
    patches: list.map((p) => ({ c: p.c, r: p.r, col: rgbOf(p.color), a: p.a ?? 1 })),
    ticked: coat.ticked,
    seed,
  };
}

/** 부위 공간의 점 p에서 털색 (셰이더와 같은 규칙) */
function furAt(pt: Paint, x: number, y: number, z: number, out: [number, number, number]): void {
  out[0] = pt.base[0];
  out[1] = pt.base[1];
  out[2] = pt.base[2];
  if (pt.patches.length) {
    const n = noise3(x * 4 + pt.seed, y * 4 + pt.seed, z * 4 + pt.seed) * 0.6 + noise3(x * 9 - pt.seed, y * 9 - pt.seed, z * 9 - pt.seed) * 0.4;
    for (const q of pt.patches) {
      const dx = (x - q.c[0]) / q.r[0];
      const dy = (y - q.c[1]) / q.r[1];
      const dz = (z - q.c[2]) / q.r[2];
      const k = Math.sqrt(dx * dx + dy * dy + dz * dz) + (n - 0.5) * 0.3;
      if (k >= 1) continue;
      const t = k <= 0.84 ? 1 : 1 - smooth((k - 0.84) / 0.16);
      const a = t * q.a;
      out[0] += (q.col[0] - out[0]) * a;
      out[1] += (q.col[1] - out[1]) * a;
      out[2] += (q.col[2] - out[2]) * a;
    }
  }
}

const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

interface Blob {
  readonly c: V3;
  readonly r: V3;
  readonly paint: Paint;
  /** 부위 공간의 원점 (몸 공간이면 0, 머리 공간이면 머리 가운데) */
  readonly origin: V3;
  /** 가장자리 털 길이 · 뭉침 */
  readonly fur: number;
  readonly messy: number;
}

const LIGHT = ((): V3 => {
  const v = [-0.45, 0.62, 0.65];
  const l = Math.hypot(v[0] as number, v[1] as number, v[2] as number);
  return [(v[0] as number) / l, (v[1] as number) / l, (v[2] as number) / l];
})();

/**
 * 타원체 털뭉치들을 한 점씩 칠한 이미지 (깊이 버퍼로 앞의 것이 덮는다).
 * S: 1 월드 단위의 픽셀 수, (ox, oy): 월드 원점의 픽셀 위치
 */
function paintBlobs(blobs: readonly Blob[], size: number, S: number, ox: number, oy: number): ImageData | null {
  let img: ImageData;
  try {
    img = new ImageData(size, size);
  } catch {
    return null;
  }
  const px = img.data;
  const zbuf = new Float32Array(size * size).fill(-1e9);
  const col: [number, number, number] = [0, 0, 0];
  // 털결 노이즈는 그림 크기에 맞춰 (작은 그림에서 지글거리지 않게)
  const grain = Math.min(70, size * 0.22);
  for (const b of blobs) {
    const ext = b.fur > 0 ? b.fur / Math.min(b.r[0], b.r[1]) : 0;
    const reach = 1 + ext * (1 + b.messy * 1.05);
    const x0 = Math.max(0, Math.floor(ox + (b.c[0] - b.r[0] * reach) * S) - 1);
    const x1 = Math.min(size - 1, Math.ceil(ox + (b.c[0] + b.r[0] * reach) * S) + 1);
    const y0 = Math.max(0, Math.floor(oy - (b.c[1] + b.r[1] * reach) * S) - 1);
    const y1 = Math.min(size - 1, Math.ceil(oy - (b.c[1] - b.r[1] * reach) * S) + 1);
    const edgePx = Math.min(b.r[0], b.r[1]) * S;
    for (let py = y0; py <= y1; py++) {
      const Y = (oy - (py + 0.5)) / S;
      const v = (Y - b.c[1]) / b.r[1];
      for (let qx = x0; qx <= x1; qx++) {
        const X = (qx + 0.5 - ox) / S;
        const u = (X - b.c[0]) / b.r[0];
        const d2 = u * u + v * v;
        if (d2 >= reach * reach) continue;
        const d = Math.sqrt(d2);
        let alpha = 1;
        let shellT = -1;
        if (d > 1) {
          // 바깥 털: 각도별 가닥이 이어지는 만큼만
          if (ext <= 0) continue;
          const ang = Math.atan2(v, u);
          const cl = noise3(Math.cos(ang) * 3.3 + b.paint.seed, Math.sin(ang) * 3.3, 0.5);
          const len = ext * (1 + b.messy * (1.5 * cl * cl - 0.45));
          const t = (d - 1) / Math.max(1e-3, len);
          if (t >= 1) continue;
          // 가닥: 각도와 높이를 같이 섞어 곧은 가시처럼 보이지 않게
          const strand = hash3(Math.floor((ang + Math.PI) * edgePx * 0.9), Math.floor(t * 3), b.paint.seed | 0);
          if (strand < 0.25 + t * 0.65) continue;
          shellT = t;
          alpha = 1 - t * 0.55;
        } else {
          // 부드러운 가장자리 (털이 없는 조각만)
          if (ext <= 0) alpha = Math.min(1, (1 - d) * edgePx + 0.5);
        }
        const dd = Math.min(1, d);
        const uu = d > 1 ? u / d : u;
        const vv = d > 1 ? v / d : v;
        const z = Math.sqrt(Math.max(0, 1 - dd * dd));
        const Z = b.c[2] + z * b.r[2] + (shellT >= 0 ? -0.001 : 0);
        const i = py * size + qx;
        if (Z <= (zbuf[i] as number)) continue;
        // 부위 공간의 점
        const sx = b.c[0] + uu * b.r[0] - b.origin[0];
        const sy = b.c[1] + vv * b.r[1] - b.origin[1];
        const sz = b.c[2] + z * b.r[2] - b.origin[2];
        furAt(b.paint, sx, sy, sz, col);
        // 빛: 타원체 법선
        let nx = uu / b.r[0];
        let ny = vv / b.r[1];
        let nz = z / b.r[2];
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        const diff = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
        const rim = Math.pow(1 - Math.max(0, nz), 2.4) * 0.32;
        let k = 0.7 + 0.42 * diff + rim;
        // 털결과 아구티 깨알
        k *= 0.93 + 0.12 * noise3(sx * grain * 0.42, sy * grain, sz * grain * 0.42);
        if (b.paint.ticked > 0) k *= 1 + b.paint.ticked * (hash3(Math.floor(sx * grain * 1.3), Math.floor(sy * grain * 1.3), Math.floor(sz * grain * 1.3)) < 0.5 ? -0.3 : 0.22);
        if (shellT >= 0) k *= 0.86 + 0.21 * shellT;
        const o = i * 4;
        const r = Math.min(255, col[0] * k);
        const g = Math.min(255, col[1] * k);
        const bb = Math.min(255, col[2] * k);
        if (alpha >= 1) {
          px[o] = r;
          px[o + 1] = g;
          px[o + 2] = bb;
          px[o + 3] = 255;
        } else if (alpha > 0) {
          // 아래에 칠한 것과 섞는다
          const ea = (px[o + 3] as number) / 255;
          const na = alpha + ea * (1 - alpha);
          px[o] = (r * alpha + (px[o] as number) * ea * (1 - alpha)) / na;
          px[o + 1] = (g * alpha + (px[o + 1] as number) * ea * (1 - alpha)) / na;
          px[o + 2] = (bb * alpha + (px[o + 2] as number) * ea * (1 - alpha)) / na;
          px[o + 3] = na * 255;
        } else continue;
        zbuf[i] = Z;
      }
    }
  }
  return img;
}

// ── 얼굴과 소품 ───────────────────────────────────────────────

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

/**
 * 캐릭터 정면 흉상. (0,0)~(size,size) 정사각형 안에 그린다 (3D 초상화와 같은 틀).
 */
export function drawCharacter(ctx: CanvasRenderingContext2D, id: CharacterId, ex: Expression, size: number, bg?: string): void {
  const spec = CHARACTERS[id];
  const coat = spec.coat;
  const messy = messyOf(coat);
  const top = headTopOf(coat) + 0.14;
  const bottom = -0.42;
  const S = size / (top - bottom);
  const ox = size / 2;
  const oy = size + bottom * S;
  const P = (x: number, y: number): [number, number] => [ox + x * S, oy - y * S];
  const seed = [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 97;
  const head = paintOf(coat, 'head', seed);
  const body = paintOf(coat, 'body', seed + 11);
  const at = (o: V3, p: V3): V3 => [o[0] + p[0], o[1] + p[1], o[2] + p[2]];

  ctx.save();
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 몸·머리·주둥이·볼
  const blobs: Blob[] = [
    { c: BODY_POS, r: BODY_R, paint: body, origin: [0, 0, 0], fur: coat.fur, messy: messy * 0.6 },
    { c: SHOULDER_POS, r: SHOULDER_R, paint: body, origin: [0, 0, 0], fur: 0, messy: 0 },
    { c: SKULL_AT, r: SKULL_R, paint: head, origin: SKULL_AT, fur: coat.fur, messy },
    { c: at(SKULL_AT, [-CHEEK_POS[0], CHEEK_POS[1], CHEEK_POS[2]]), r: CHEEK_R, paint: head, origin: SKULL_AT, fur: 0, messy: 0 },
    { c: at(SKULL_AT, CHEEK_POS), r: CHEEK_R, paint: head, origin: SKULL_AT, fur: 0, messy: 0 },
    { c: at(SKULL_AT, SNOUT_POS), r: SNOUT_R, paint: head, origin: SKULL_AT, fur: 0, messy: 0 },
  ];
  const img = paintBlobs(blobs, size, S, ox, oy);
  if (img) {
    const layer = document.createElement('canvas');
    layer.width = size;
    layer.height = size;
    layer.getContext('2d')?.putImageData(img, 0, 0);
    ctx.drawImage(layer, 0, 0);
  }

  // 귀: 머리 위옆에 붙어 바깥 아래로 처진 꽃잎 (3D와 같은 자리 — 머리 옆면보다 앞에 온다)
  for (const dir of [-1, 1] as const) {
    const [cx, cy] = P(SKULL_AT[0] + dir * EAR_AT[0], SKULL_AT[1] + EAR_AT[1]);
    const rot = dir * EAR_TILT;
    const ear = dir < 0 ? coat.ears[0] : coat.ears[1];
    const g = ctx.createLinearGradient(cx, cy - 0.2 * S, cx, cy + 0.2 * S);
    g.addColorStop(0, lighten(ear, 0.14));
    g.addColorStop(1, shade(ear, 0.1));
    ctx.fillStyle = g;
    ellipse(ctx, cx, cy, 0.31 * S, 0.16 * S, rot);
    ctx.fill();
    ctx.fillStyle = coat.earIn;
    ellipse(ctx, cx - dir * 0.05 * S, cy + 0.01 * S, 0.19 * S, 0.085 * S, rot);
    ctx.fill();
  }

  // 눈
  const ep = skullPoint(EYE.yaw, EYE.pitch);
  const eyeY = SKULL_AT[1] + ep[1];
  const big = ex === 'surprised' ? 1.16 : 1;
  const erx = EYE_R * 0.84 * big * S;
  const ery = EYE_R * 1.04 * big * S * (sad(ex) ? 0.94 : 1);
  for (const dir of [-1, 1] as const) {
    const [cx, cy] = P(SKULL_AT[0] + dir * ep[0] * 0.95, eyeY);
    if (ex === 'happy' || ex === 'win') {
      ctx.strokeStyle = coat.eye;
      ctx.lineWidth = EYE_R * 0.32 * S;
      ctx.beginPath();
      ctx.moveTo(cx - erx, cy + ery * 0.25);
      ctx.quadraticCurveTo(cx, cy - ery * 1.15, cx + erx, cy + ery * 0.25);
      ctx.stroke();
      continue;
    }
    if (ex === 'blink') {
      ctx.strokeStyle = coat.eye;
      ctx.lineWidth = EYE_R * 0.24 * S;
      ctx.beginPath();
      ctx.moveTo(cx - erx, cy);
      ctx.quadraticCurveTo(cx, cy + ery * 0.35, cx + erx, cy);
      ctx.stroke();
      continue;
    }
    const g = ctx.createRadialGradient(cx - erx * 0.3, cy - ery * 0.35, erx * 0.1, cx, cy, ery * 1.05);
    g.addColorStop(0, lighten(coat.eye, 0.28));
    g.addColorStop(1, coat.eye);
    ctx.fillStyle = g;
    ellipse(ctx, cx, cy, erx, ery);
    ctx.fill();
    const teary = sad(ex) ? 1.3 : ex === 'surprised' ? 1.1 : 1;
    const up = ex === 'think' ? -0.3 : 0;
    ctx.fillStyle = '#ffffff';
    ellipse(ctx, cx - erx * 0.36, cy - ery * (0.42 - up), EYE_R * 0.3 * teary * S, EYE_R * 0.3 * teary * S);
    ctx.fill();
    ellipse(ctx, cx + erx * 0.34, cy + ery * (0.36 + up), EYE_R * 0.15 * teary * S, EYE_R * 0.15 * teary * S);
    ctx.fill();
  }

  // 눈썹
  const brows = browColors(coat);
  if (spec.brows !== 'none' || sad(ex)) {
    for (const dir of [-1, 1] as const) {
      let inner = 0;
      let outer = 0;
      let width = 0.04;
      if (spec.brows === 'bushy') {
        width = 0.068;
        inner = sad(ex) ? 0.056 : 0.016;
        outer = sad(ex) ? -0.024 : 0;
      } else if (spec.brows === 'serious') {
        width = 0.04;
        inner = sad(ex) ? 0.048 : -0.04;
        outer = sad(ex) ? -0.016 : 0.032;
      } else {
        width = 0.028;
        inner = 0.048;
        outer = -0.016;
      }
      if (ex === 'surprised') {
        inner += 0.05;
        outer += 0.05;
      }
      const bx = SKULL_AT[0] + dir * ep[0] * 0.93;
      const by = eyeY + 0.24;
      ctx.strokeStyle = brows[dir < 0 ? 0 : 1];
      ctx.lineWidth = width * S;
      const [x0, y0] = P(bx - dir * 0.13, by + inner);
      const [xm, ym] = P(bx, by + 0.04 + (inner + outer) / 2);
      const [x1, y1] = P(bx + dir * 0.13, by + outer);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(xm, ym, x1, y1);
      ctx.stroke();
    }
  }

  // 크레스티드 볏의 소용돌이
  if (coat.breed === 'crested') {
    const cp = skullPoint(0, 0.93);
    const [cx, cy] = P(SKULL_AT[0], SKULL_AT[1] + cp[1]);
    ctx.strokeStyle = 'rgba(205,195,200,0.85)';
    ctx.lineWidth = Math.max(1, 0.016 * S);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 0.015 * S, cy + Math.sin(a) * 0.015 * S);
      ctx.quadraticCurveTo(cx + Math.cos(a + 0.6) * 0.07 * S, cy + Math.sin(a + 0.6) * 0.07 * S, cx + Math.cos(a + 1.1) * 0.12 * S, cy + Math.sin(a + 1.1) * 0.12 * S);
      ctx.stroke();
    }
  }

  // 코와 입 (주둥이 앞)
  const snoutY = SKULL_AT[1] + SNOUT_POS[1];
  const dark = darkSnout(coat);
  const line = dark ? 'rgba(236,214,205,0.9)' : '#5a3a33';
  const [nx, ny] = P(0, snoutY + SNOUT_R[1] * Math.sin(0.44));
  const nw = 0.09 * S;
  const nh = 0.075 * S;
  const ng = ctx.createRadialGradient(nx - nw * 0.2, ny - nh * 0.4, nw * 0.1, nx, ny, nw * 1.1);
  ng.addColorStop(0, lighten(coat.nose, 0.25));
  ng.addColorStop(1, coat.nose);
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.moveTo(nx - nw, ny - nh * 0.45);
  ctx.quadraticCurveTo(nx, ny - nh * 0.95, nx + nw, ny - nh * 0.45);
  ctx.quadraticCurveTo(nx + nw * 0.75, ny + nh * 0.35, nx, ny + nh * 0.75);
  ctx.quadraticCurveTo(nx - nw * 0.75, ny + nh * 0.35, nx - nw, ny - nh * 0.45);
  ctx.fill();
  const [, my] = P(0, snoutY + SNOUT_R[1] * Math.sin(0.12));
  const [lx, ly] = P(-0.115, snoutY + SNOUT_R[1] * Math.sin(0.1));
  const [rx, ry] = P(0.115, snoutY + SNOUT_R[1] * Math.sin(0.1));
  const [, dy] = P(0, snoutY + SNOUT_R[1] * Math.sin(-0.04));
  const u = 0.45 * S; // 주둥이 한 바퀴의 대략 크기 (입 모양 비율)
  ctx.strokeStyle = line;
  ctx.lineWidth = Math.max(1, 0.012 * S);
  ctx.beginPath();
  ctx.moveTo(nx, ny + nh * 0.7);
  ctx.lineTo(nx, my);
  ctx.stroke();
  ctx.beginPath();
  if (ex === 'surprised') {
    ctx.fillStyle = '#9b4d55';
    const [mx, oy2] = P(0, snoutY + SNOUT_R[1] * Math.sin(-0.02));
    ellipse(ctx, mx, oy2, 0.03 * S, 0.038 * S);
    ctx.fill();
  } else if (ex === 'happy' || ex === 'win') {
    const [mx, m0] = P(0, snoutY);
    ctx.fillStyle = '#a5505a';
    ctx.moveTo(lx, ly);
    ctx.quadraticCurveTo(nx - u * 0.1, my, nx, my);
    ctx.quadraticCurveTo(nx + u * 0.1, my, rx, ry);
    ctx.quadraticCurveTo(mx + u * 0.12, m0 + u * 0.2, mx, m0 + u * 0.17);
    ctx.quadraticCurveTo(mx - u * 0.12, m0 + u * 0.2, lx, ly);
    ctx.fill();
    ctx.fillStyle = '#fffaf2';
    const tw = u * 0.068;
    for (const left of [nx - u * 0.008 - tw, nx + u * 0.008]) {
      ctx.beginPath();
      ctx.rect(left, my - u * 0.005, tw, u * 0.1);
      ctx.fill();
    }
  } else if (sad(ex)) {
    ctx.moveTo(lx, ly + u * 0.08);
    ctx.quadraticCurveTo(nx - u * 0.12, my - u * 0.02, nx, my);
    ctx.quadraticCurveTo(nx + u * 0.12, my - u * 0.02, rx, ry + u * 0.08);
    ctx.stroke();
  } else if (ex === 'think') {
    ctx.moveTo(nx - u * 0.04, my + u * 0.03);
    ctx.quadraticCurveTo(nx + u * 0.12, my + u * 0.06, rx, ry - u * 0.02);
    ctx.stroke();
  } else {
    ctx.moveTo(lx, ly - u * 0.02);
    ctx.quadraticCurveTo(nx - u * 0.12, dy, nx, my);
    ctx.quadraticCurveTo(nx + u * 0.12, dy, rx, ry - u * 0.02);
    ctx.stroke();
  }

  // 수염
  ctx.strokeStyle = coat.whisker;
  ctx.lineWidth = Math.max(0.6, 0.013 * S);
  for (const dir of [-1, 1])
    for (const k of [0, 1]) {
      const [ax, ay] = P(dir * 0.3, SKULL_AT[1] - 0.21 - k * 0.07);
      const [cx, cy] = P(dir * 0.66, SKULL_AT[1] - 0.16 - k * 0.1);
      const [bx, by] = P(dir * 1.02, SKULL_AT[1] - 0.14 - k * 0.2);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(cx, cy, bx, by);
      ctx.stroke();
    }

  // 땀방울
  if (ex === 'lose') {
    const sp = skullPoint(EYE.yaw - 0.05, EYE.pitch + 0.62);
    const [dx, dy2] = P(SKULL_AT[0] + sp[0], SKULL_AT[1] + sp[1]);
    const r = 0.055 * S;
    const g = ctx.createLinearGradient(dx, dy2 - r * 1.6, dx, dy2 + r);
    g.addColorStop(0, '#d8eeff');
    g.addColorStop(1, '#7fb8ea');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(dx, dy2 - r * 1.7);
    ctx.quadraticCurveTo(dx + r * 1.1, dy2, dx, dy2 + r);
    ctx.quadraticCurveTo(dx - r * 1.1, dy2, dx, dy2 - r * 1.7);
    ctx.fill();
  }

  // 안경
  if (spec.glasses) {
    ctx.strokeStyle = '#3b2d27';
    ctx.lineWidth = 0.036 * S;
    const ringR = EYE_R * 1.45 * S;
    const centers: [number, number][] = [];
    for (const dir of [-1, 1] as const) {
      const [cx, cy] = P(SKULL_AT[0] + dir * ep[0] * 0.93, eyeY);
      centers.push([cx, cy]);
      ellipse(ctx, cx, cy, ringR * 0.92, ringR);
      ctx.stroke();
    }
    const [a, b] = centers;
    if (a && b) {
      ctx.lineWidth = 0.03 * S;
      ctx.beginPath();
      ctx.moveTo(a[0] + ringR * 0.9, a[1] - ringR * 0.1);
      ctx.quadraticCurveTo(ox, a[1] - ringR * 0.55, b[0] - ringR * 0.9, b[1] - ringR * 0.1);
      ctx.stroke();
    }
  }

  // 나비넥타이
  bowTie(ctx, ...P(0, 0.6), S, spec.bow);

  // 앞발 (레일 위)
  for (const dir of [-1, 1] as const) {
    const [cx, cy] = P(dir * 0.42, 0.1);
    const g = ctx.createRadialGradient(cx - 0.05 * S, cy - 0.05 * S, 0.02 * S, cx, cy, 0.2 * S);
    g.addColorStop(0, lighten(coat.paw, 0.15));
    g.addColorStop(1, shade(coat.paw, 0.06));
    ctx.fillStyle = g;
    ellipse(ctx, cx, cy, 0.18 * S, 0.12 * S);
    ctx.fill();
    ctx.fillStyle = shade(coat.paw, 0.12);
    for (const k of [-1, 0, 1]) {
      ellipse(ctx, cx + (k * 0.085 + dir * 0.005) * S, cy + 0.075 * S, 0.048 * S, 0.036 * S);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** 나비넥타이: (cx, cy) 가운데, S = 1 월드 단위 픽셀 */
function bowTie(ctx: CanvasRenderingContext2D, cx: number, cy: number, S: number, color: string): void {
  const w = S * 1.05;
  ctx.save();
  const g = ctx.createLinearGradient(cx, cy - 0.12 * w, cx, cy + 0.12 * w);
  g.addColorStop(0, lighten(color, 0.18));
  g.addColorStop(1, shade(color, 0.12));
  ctx.fillStyle = g;
  ctx.beginPath();
  for (const dir of [-1, 1]) {
    ctx.moveTo(cx + dir * 0.03 * w, cy);
    ctx.lineTo(cx + dir * 0.2 * w, cy - 0.115 * w);
    ctx.quadraticCurveTo(cx + dir * 0.265 * w, cy, cx + dir * 0.2 * w, cy + 0.115 * w);
    ctx.closePath();
  }
  ctx.fill();
  ctx.fillStyle = shade(color, 0.05);
  ellipse(ctx, cx, cy, 0.055 * w, 0.06 * w);
  ctx.fill();
  ctx.restore();
}

const cache = new Map<string, string>();

/** 초상화 데이터 URL (같은 조합은 캐시) */
export function portraitURL(id: CharacterId, ex: Expression = 'idle', size = 128, bg?: string): string {
  const key = `${id}|${ex}|${size}|${bg ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    drawCharacter(ctx, id, ex, size, bg);
    const url = c.toDataURL('image/png');
    cache.set(key, url);
    return url;
  } catch {
    return '';
  }
}
