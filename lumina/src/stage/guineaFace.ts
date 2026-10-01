/**
 * 3D 기니피그 얼굴에 붙이는 그림 두 장.
 *  · 머리 앞(skull): 눈썹, 크레스티드의 이마 소용돌이, 졌을 때 땀방울
 *  · 주둥이 앞(snout): 분홍 코, 인중과 "ω" 입, 웃을 때 앞니 두 개
 * 그림은 구면 조각(materials의 skullCap·snoutCap)에 그대로 감기므로, 자리는 (가로각 yaw, 세로각 pitch)로 정한다.
 */
import type { CharacterSpec, Coat } from '../characters/roster';
import type { Expression } from '../characters/draw2d';
import { lighten, shade } from '../characters/anatomy';

/** 구면 조각의 범위 (materials.ts의 SphereGeometry와 같은 값) */
export const SKULL_CAP = { phiLen: 2.0, thetaStart: 0.3, thetaLen: 1.75 } as const;
export const SNOUT_CAP = { phiLen: 1.9, thetaStart: Math.PI / 2 - 0.9, thetaLen: 1.75 } as const;

type Cap = { readonly phiLen: number; readonly thetaStart: number; readonly thetaLen: number };

/** (yaw, pitch) → 캔버스 좌표 */
function at(cap: Cap, size: number, yaw: number, pitch: number): [number, number] {
  const u = (yaw + cap.phiLen / 2) / cap.phiLen;
  const v = (Math.PI / 2 - pitch - cap.thetaStart) / cap.thetaLen;
  return [u * size, v * size];
}

const sad = (ex: Expression): boolean => ex === 'sad' || ex === 'lose';

/** 머리 앞 그림: 눈썹 · 볏 소용돌이 · 땀방울 */
export function paintSkull(ctx: CanvasRenderingContext2D, size: number, spec: CharacterSpec, ex: Expression, eye: { yaw: number; pitch: number }, brows: readonly [string, string]): void {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const P = (yaw: number, pitch: number): [number, number] => at(SKULL_CAP, size, yaw, pitch);
  const unit = size / SKULL_CAP.phiLen; // 1 rad 가로 픽셀
  const by = eye.pitch + 0.3;
  if (spec.brows !== 'none' || sad(ex)) {
    for (const dir of [-1, 1] as const) {
      ctx.strokeStyle = brows[dir < 0 ? 0 : 1];
      const cx = dir * (eye.yaw - 0.02);
      // 안쪽(코 쪽) 끝과 바깥 끝의 높이
      let inner = 0;
      let outer = 0;
      let width = 0.05;
      if (spec.brows === 'bushy') {
        width = 0.085;
        inner = sad(ex) ? 0.07 : 0.02;
        outer = sad(ex) ? -0.03 : 0.0;
      } else if (spec.brows === 'serious') {
        width = 0.05;
        inner = sad(ex) ? 0.06 : -0.05;
        outer = sad(ex) ? -0.02 : 0.04;
      } else {
        width = 0.035;
        inner = 0.06;
        outer = -0.02;
      }
      if (ex === 'surprised') {
        inner += 0.06;
        outer += 0.06;
      }
      ctx.lineWidth = width * unit;
      const [x0, y0] = P(cx - dir * 0.16, by + inner);
      const [xm, ym] = P(cx, by + 0.05 + (inner + outer) / 2);
      const [x1, y1] = P(cx + dir * 0.16, by + outer);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(xm, ym, x1, y1);
      ctx.stroke();
    }
  }
  if (spec.coat.breed === 'crested') {
    // 크레스티드: 이마의 흰 볏 — 가운데에서 바깥으로 도는 털결
    const [cx, cy] = P(0, 0.93);
    ctx.strokeStyle = 'rgba(205,195,200,0.85)';
    ctx.lineWidth = unit * 0.018;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * unit * 0.02, cy + Math.sin(a) * unit * 0.02);
      ctx.quadraticCurveTo(cx + Math.cos(a + 0.6) * unit * 0.09, cy + Math.sin(a + 0.6) * unit * 0.09, cx + Math.cos(a + 1.1) * unit * 0.15, cy + Math.sin(a + 1.1) * unit * 0.15);
      ctx.stroke();
    }
  }
  if (ex === 'lose') {
    // 땀방울
    const [dx, dy] = P(eye.yaw - 0.05, eye.pitch + 0.62);
    const r = unit * 0.07;
    const g = ctx.createLinearGradient(dx, dy - r * 1.6, dx, dy + r);
    g.addColorStop(0, '#d8eeff');
    g.addColorStop(1, '#7fb8ea');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(dx, dy - r * 1.7);
    ctx.quadraticCurveTo(dx + r * 1.1, dy, dx, dy + r);
    ctx.quadraticCurveTo(dx - r * 1.1, dy, dx, dy - r * 1.7);
    ctx.fill();
  }
  ctx.restore();
}

/** 주둥이 앞 그림: 코 · 인중 · 입 · 앞니 */
export function paintSnout(ctx: CanvasRenderingContext2D, size: number, coat: Coat, ex: Expression, dark: boolean): void {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const P = (yaw: number, pitch: number): [number, number] => at(SNOUT_CAP, size, yaw, pitch);
  const unit = size / SNOUT_CAP.phiLen;
  const line = dark ? 'rgba(236,214,205,0.9)' : '#5a3a33';
  // 코: 둥근 역삼각형 (위가 넓고 아래가 뾰족), 콧구멍 두 줄
  const [nx, ny] = P(0, 0.44);
  const w = unit * 0.2;
  const h = unit * 0.15;
  const g = ctx.createRadialGradient(nx - w * 0.2, ny - h * 0.4, w * 0.1, nx, ny, w * 1.1);
  g.addColorStop(0, lighten(coat.nose, 0.25));
  g.addColorStop(1, coat.nose);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(nx - w, ny - h * 0.45);
  ctx.quadraticCurveTo(nx, ny - h * 0.95, nx + w, ny - h * 0.45);
  ctx.quadraticCurveTo(nx + w * 0.75, ny + h * 0.35, nx, ny + h * 0.75);
  ctx.quadraticCurveTo(nx - w * 0.75, ny + h * 0.35, nx - w, ny - h * 0.45);
  ctx.fill();
  ctx.strokeStyle = shade(coat.nose, 0.55);
  ctx.lineWidth = unit * 0.022;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(nx + dir * w * 0.25, ny - h * 0.2);
    ctx.quadraticCurveTo(nx + dir * w * 0.62, ny - h * 0.3, nx + dir * w * 0.72, ny + h * 0.05);
    ctx.stroke();
  }
  // 인중
  ctx.strokeStyle = line;
  ctx.lineWidth = unit * 0.026;
  const [, my] = P(0, 0.12);
  ctx.beginPath();
  ctx.moveTo(nx, ny + h * 0.7);
  ctx.lineTo(nx, my);
  ctx.stroke();
  // 입
  const [lx, ly] = P(-0.26, 0.1);
  const [rx, ry] = P(0.26, 0.1);
  const [, dy] = P(0, -0.04);
  ctx.beginPath();
  if (ex === 'surprised') {
    ctx.fillStyle = '#9b4d55';
    const [ox, oy] = P(0, -0.02);
    ctx.ellipse(ox, oy, unit * 0.07, unit * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (ex === 'happy' || ex === 'win') {
    // 활짝: 웃는 입 안 + 앞니 두 개
    const [ox, oy] = P(0, 0.0);
    ctx.fillStyle = '#a5505a';
    ctx.moveTo(lx, ly);
    ctx.quadraticCurveTo(nx - unit * 0.1, my, nx, my);
    ctx.quadraticCurveTo(nx + unit * 0.1, my, rx, ry);
    ctx.quadraticCurveTo(ox + unit * 0.12, oy + unit * 0.2, ox, oy + unit * 0.17);
    ctx.quadraticCurveTo(ox - unit * 0.12, oy + unit * 0.2, lx, ly);
    ctx.fill();
    // 앞니 두 개: 인중 양옆에 붙은 네모
    ctx.fillStyle = '#fffaf2';
    const tw = unit * 0.068;
    const gap = unit * 0.008;
    for (const left of [nx - gap - tw, nx + gap]) {
      ctx.beginPath();
      ctx.roundRect(left, my - unit * 0.005, tw, unit * 0.1, unit * 0.018);
      ctx.fill();
    }
  } else if (sad(ex)) {
    ctx.strokeStyle = line;
    ctx.moveTo(lx, ly + unit * 0.08);
    ctx.quadraticCurveTo(nx - unit * 0.12, my - unit * 0.02, nx, my);
    ctx.quadraticCurveTo(nx + unit * 0.12, my - unit * 0.02, rx, ry + unit * 0.08);
    ctx.stroke();
  } else if (ex === 'think') {
    ctx.strokeStyle = line;
    ctx.moveTo(nx - unit * 0.04, my + unit * 0.03);
    ctx.quadraticCurveTo(nx + unit * 0.12, my + unit * 0.06, rx, ry - unit * 0.02);
    ctx.stroke();
  } else {
    // ω: 인중에서 양쪽으로 둥글게
    ctx.strokeStyle = line;
    ctx.moveTo(lx, ly - unit * 0.02);
    ctx.quadraticCurveTo(nx - unit * 0.12, dy, nx, my);
    ctx.quadraticCurveTo(nx + unit * 0.12, dy, rx, ry - unit * 0.02);
    ctx.stroke();
  }
  // 수염 뿌리 점
  ctx.fillStyle = dark ? 'rgba(236,214,205,0.55)' : 'rgba(90,58,51,0.35)';
  for (const dir of [-1, 1])
    for (const [k, p] of [
      [0.36, 0.3],
      [0.42, 0.2],
      [0.38, 0.12],
    ] as const) {
      const [x, y] = P(dir * k, p);
      ctx.beginPath();
      ctx.arc(x, y, unit * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.restore();
}
