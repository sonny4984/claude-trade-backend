/**
 * 기니피그 친구들을 2D 캔버스에 그린다 — 두꺼운 검정 외곽선 + 흰 몸의 스티커 화풍.
 *  · drawFace: 눈·눈썹·코·입·(뽀니의 회색 주둥이) — 3D 얼굴 텍스처와 2D 초상화가 같이 쓴다
 *  · drawCharacter: 몸 전체 (초상화·결과 카드·WebGL이 안 될 때)
 */
import { CHARACTERS, type CharacterId } from './roster';

export type Expression = 'idle' | 'blink' | 'happy' | 'surprised' | 'sad' | 'think' | 'win' | 'lose';

const INK = '#141414';

/** 원작의 "6"자 눈: 고리 + 꼬리, 안쪽 동공 */
function eye(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, mirror: boolean, look: { x: number; y: number }, blink: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  if (mirror) ctx.scale(-1, 1);
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (blink) {
    ctx.lineWidth = s * 0.26;
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, s * 0.1);
    ctx.quadraticCurveTo(0, s * 0.42, s * 0.55, s * 0.1);
    ctx.stroke();
    ctx.restore();
    return;
  }
  // 고리 (살짝 기운 타원)
  ctx.lineWidth = s * 0.24;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.08, s * 0.5, s * 0.64, -0.18, 0, Math.PI * 2);
  ctx.stroke();
  // 꼬리: 고리 위쪽에서 바깥 위로 말려 올라감 ("6")
  ctx.lineWidth = s * 0.22;
  ctx.beginPath();
  ctx.moveTo(s * 0.18, -s * 0.52);
  ctx.quadraticCurveTo(-s * 0.2, -s * 0.95, -s * 0.62, -s * 0.66);
  ctx.stroke();
  // 동공
  ctx.beginPath();
  ctx.ellipse(look.x * s * 0.16 + s * 0.08, s * 0.2 + look.y * s * 0.16, s * 0.27, s * 0.34, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function happyEye(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = s * 0.26;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.55, y + s * 0.3);
  ctx.quadraticCurveTo(x, y - s * 0.55, x + s * 0.55, y + s * 0.3);
  ctx.stroke();
  ctx.restore();
}

/**
 * 얼굴만 (투명 배경). (cx, cy) = 얼굴 중심, w = 머리 폭 기준 크기.
 */
export function drawFace(ctx: CanvasRenderingContext2D, id: CharacterId, ex: Expression, cx: number, cy: number, w: number): void {
  const spec = CHARACTERS[id];
  const s = w * 0.11; // 눈 크기 단위
  const ey = cy - w * 0.06;
  const ex1 = cx - w * 0.19;
  const ex2 = cx + w * 0.19;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 뽀니: 회색 주둥이
  if (spec.muzzle) {
    ctx.fillStyle = '#c9c9c9';
    ctx.beginPath();
    ctx.ellipse(cx + w * 0.01, cy + w * 0.17, w * 0.2, w * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 모카: 갈색 무늬 (한쪽 눈가)
  if (spec.patches) {
    ctx.fillStyle = '#b07a4e';
    ctx.beginPath();
    ctx.ellipse(cx + w * 0.2, cy - w * 0.1, w * 0.19, w * 0.16, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  const look =
    ex === 'think' ? { x: -0.6, y: -0.7 } : ex === 'surprised' ? { x: 0, y: 0 } : ex === 'sad' || ex === 'lose' ? { x: 0, y: 0.6 } : { x: 0.1, y: 0.1 };
  const big = ex === 'surprised' ? 1.22 : 1;
  if (ex === 'happy' || ex === 'win') {
    happyEye(ctx, ex1, ey, s);
    happyEye(ctx, ex2, ey, s);
  } else {
    eye(ctx, ex1, ey, s * big, false, look, ex === 'blink');
    eye(ctx, ex2, ey, s * big, true, { x: -look.x, y: look.y }, ex === 'blink');
  }

  // 모카: 동그란 안경
  if (spec.glasses) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = w * 0.022;
    ctx.beginPath();
    ctx.arc(ex1, ey + s * 0.1, s * 1.05, 0, Math.PI * 2);
    ctx.moveTo(ex2 + s * 1.05, ey + s * 0.1);
    ctx.arc(ex2, ey + s * 0.1, s * 1.05, 0, Math.PI * 2);
    ctx.moveTo(ex1 + s * 1.05, ey);
    ctx.quadraticCurveTo(cx, ey - s * 0.4, ex2 - s * 1.05, ey);
    ctx.stroke();
  }

  // 눈썹
  ctx.strokeStyle = INK;
  const sad = ex === 'sad' || ex === 'lose';
  if (spec.brows === 'bushy') {
    // 휘기: 굵고 부스스한 눈썹
    ctx.lineWidth = w * 0.05;
    for (const [bx, dir] of [
      [ex1, -1],
      [ex2, 1],
    ] as const) {
      ctx.beginPath();
      const inner = sad ? -0.02 : 0.03;
      ctx.moveTo(bx - dir * w * 0.12, ey - w * 0.16);
      ctx.quadraticCurveTo(bx, ey - w * (0.23 + inner), bx + dir * w * 0.1, ey - w * (0.16 - (sad ? 0.05 : -0.02)));
      ctx.stroke();
    }
  } else if (spec.brows === 'serious') {
    // 기니니: 가늘고 진지하게 안쪽이 내려간 눈썹
    ctx.lineWidth = w * 0.028;
    for (const [bx, dir] of [
      [ex1, 1],
      [ex2, -1],
    ] as const) {
      ctx.beginPath();
      const tilt = sad ? -0.03 : 0.035;
      ctx.moveTo(bx - dir * w * 0.1, ey - w * (0.19 + tilt));
      ctx.lineTo(bx + dir * w * 0.08, ey - w * (0.19 - tilt));
      ctx.stroke();
    }
  } else if (sad) {
    ctx.lineWidth = w * 0.022;
    for (const [bx, dir] of [
      [ex1, 1],
      [ex2, -1],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(bx - dir * w * 0.08, ey - w * 0.15);
      ctx.lineTo(bx + dir * w * 0.06, ey - w * 0.19);
      ctx.stroke();
    }
  }

  // 코 + 입: 원작의 휘어진 선과 작은 코 덩어리
  const ny = cy + w * 0.15;
  ctx.lineWidth = w * 0.03;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.14, ny - w * 0.03);
  ctx.quadraticCurveTo(cx - w * 0.05, ny + w * 0.06, cx + w * 0.05, ny + w * 0.01);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.055, ny - w * 0.005, w * 0.045, w * 0.03, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // 입
  ctx.lineWidth = w * 0.026;
  ctx.beginPath();
  if (ex === 'surprised') {
    ctx.ellipse(cx + w * 0.01, ny + w * 0.085, w * 0.03, w * 0.038, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (ex === 'win' || ex === 'happy') {
    ctx.moveTo(cx - w * 0.06, ny + w * 0.06);
    ctx.quadraticCurveTo(cx + w * 0.01, ny + w * 0.13, cx + w * 0.08, ny + w * 0.06);
    ctx.stroke();
  } else if (sad) {
    ctx.moveTo(cx - w * 0.05, ny + w * 0.1);
    ctx.quadraticCurveTo(cx + w * 0.01, ny + w * 0.06, cx + w * 0.07, ny + w * 0.1);
    ctx.stroke();
  } else {
    ctx.moveTo(cx - w * 0.05, ny + w * 0.075);
    ctx.quadraticCurveTo(cx + w * 0.01, ny + w * 0.1, cx + w * 0.06, ny + w * 0.07);
    ctx.stroke();
  }
  // 패배: 땀방울
  if (ex === 'lose') {
    ctx.fillStyle = '#8ec5ef';
    ctx.strokeStyle = INK;
    ctx.lineWidth = w * 0.012;
    ctx.beginPath();
    const dx = cx + w * 0.34;
    const dy = cy - w * 0.2;
    ctx.moveTo(dx, dy - w * 0.06);
    ctx.quadraticCurveTo(dx + w * 0.05, dy + w * 0.02, dx, dy + w * 0.04);
    ctx.quadraticCurveTo(dx - w * 0.05, dy + w * 0.02, dx, dy - w * 0.06);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** 휘기의 부스스한 갈기 윤곽 */
function fluffyPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const n = 22;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const side = Math.abs(Math.cos(a));
    const bottom = Math.sin(a) > 0.55;
    const spike = bottom ? 0.02 : 0.1 + side * 0.14 + (i % 2 ? 0.05 : -0.03);
    const rr = r * (1 + (i % 2 ? spike : -0.02));
    const x = cx + Math.cos(a) * rr * 1.08;
    const y = cy + Math.sin(a) * rr * 0.96;
    if (i === 0) ctx.moveTo(x, y);
    else {
      const pa = a - Math.PI / n;
      ctx.quadraticCurveTo(cx + Math.cos(pa) * r * 0.98, cy + Math.sin(pa) * r * 0.9, x, y);
    }
  }
  ctx.closePath();
}

function bowTie(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = w * 0.012;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.02, cy);
  ctx.lineTo(cx - w * 0.14, cy - w * 0.06);
  ctx.quadraticCurveTo(cx - w * 0.16, cy, cx - w * 0.14, cy + w * 0.07);
  ctx.closePath();
  ctx.moveTo(cx + w * 0.02, cy);
  ctx.lineTo(cx + w * 0.15, cy - w * 0.065);
  ctx.quadraticCurveTo(cx + w * 0.17, cy, cx + w * 0.15, cy + w * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.035, w * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * 캐릭터 전신 (정면 스티커). (0,0)~(size,size) 정사각형 안에 그린다.
 */
export function drawCharacter(ctx: CanvasRenderingContext2D, id: CharacterId, ex: Expression, size: number, bg?: string): void {
  const spec = CHARACTERS[id];
  const w = size * 0.72;
  const cx = size / 2;
  const headY = size * 0.4;
  const bodyY = size * 0.62;
  ctx.save();
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const stroke = size * 0.028;
  // 발
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = INK;
  ctx.lineWidth = stroke;
  for (const fx of [-0.08, 0.08]) {
    ctx.beginPath();
    ctx.ellipse(cx + fx * size, bodyY + w * 0.36, w * 0.07, w * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // 몸
  ctx.beginPath();
  ctx.ellipse(cx, bodyY, w * 0.4, w * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 머리 (휘기는 갈기, 나머지는 구름 모양 위쪽 두 봉우리)
  if (spec.fur === 'fluffy') {
    fluffyPath(ctx, cx, headY, w * 0.46);
    ctx.fill();
    ctx.stroke();
    // 안쪽 털 결
    ctx.lineWidth = stroke * 0.7;
    for (const [x0, y0, x1, y1] of [
      [-0.3, -0.05, -0.36, 0.12],
      [0.3, -0.05, 0.37, 0.12],
      [-0.08, -0.36, 0.02, -0.28],
    ]) {
      ctx.beginPath();
      ctx.moveTo(cx + (x0 as number) * w, headY + (y0 as number) * w);
      ctx.quadraticCurveTo(cx + ((x0 as number) + (x1 as number)) * 0.5 * w * 1.05, headY + ((y0 as number) + (y1 as number)) * 0.5 * w, cx + (x1 as number) * w, headY + (y1 as number) * w);
      ctx.stroke();
    }
    ctx.lineWidth = stroke;
  } else {
    ctx.beginPath();
    ctx.arc(cx - w * 0.2, headY - w * 0.28, w * 0.2, Math.PI * 0.9, Math.PI * 1.95);
    ctx.arc(cx + w * 0.2, headY - w * 0.28, w * 0.2, Math.PI * 1.05, Math.PI * 0.1);
    ctx.ellipse(cx, headY, w * 0.46, w * 0.4, 0, -0.05, Math.PI + 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // 팔 선
  ctx.lineWidth = stroke * 0.9;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * w * 0.34, bodyY - w * 0.12);
    ctx.quadraticCurveTo(cx + dir * w * 0.4, bodyY + w * 0.04, cx + dir * w * 0.3, bodyY + w * 0.16);
    ctx.stroke();
  }
  drawFace(ctx, id, ex, cx, headY + w * 0.02, w);
  bowTie(ctx, cx, headY + w * 0.36, w, spec.bow);
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
