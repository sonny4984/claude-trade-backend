/**
 * 기니피그 몸의 치수와 털색 계산 — 3D 모델(stage/guinea.ts)과 2D 그림(draw2d.ts)이 같이 쓴다 (three.js 없이).
 * 단위는 3D 월드 단위, 원점은 자리(테이블 레일) 높이, x는 화면 오른쪽, y는 위, z는 화면 쪽.
 */
import type { Coat } from './roster';

export type V3 = readonly [number, number, number];

/** 목(머리가 끄덕이는 축) 높이 */
export const NECK_Y = 0.62;
/** 머리 가운데 높이 */
export const SKULL_Y = 1.42;
/** 머리 가운데 (몸 공간) — 머리 공간의 원점 */
export const SKULL_AT: V3 = [0, SKULL_Y, 0.06];
export const SKULL_R: V3 = [0.93, 0.8, 0.86];
export const BODY_POS: V3 = [0, 0.12, -0.12];
export const BODY_R: V3 = [1.03, 0.98, 0.92];
/** 어깨: 머리와 몸 사이를 메워 목 없이 이어지게 */
export const SHOULDER_POS: V3 = [0, 0.88, -0.28];
export const SHOULDER_R: V3 = [0.9, 0.44, 0.56];
/** 주둥이(로마 코)와 통통한 볼 (머리 공간) */
export const SNOUT_POS: V3 = [0, -0.27, 0.55];
export const SNOUT_R: V3 = [0.44, 0.34, 0.39];
export const CHEEK_POS: V3 = [0.28, -0.37, 0.5];
export const CHEEK_R: V3 = [0.31, 0.26, 0.27];
/** 눈 자리: 머리 옆쪽 (정면에서 두 눈이 다 보이게 조금 앞으로) */
export const EYE = { yaw: 0.68, pitch: 0.1 } as const;
export const EYE_R = 0.155;
/** 귀가 붙는 자리 */
export const EAR = { yaw: 1.08, pitch: 0.72 } as const;
export const PAW_Z = 0.84;
/** 볼터치 (머리 공간) */
export const BLUSH = { color: '#f39aa6', a: 0.42, c: [0.37, -0.29, 0.62] as V3, r: [0.17, 0.12, 0.24] as V3 };

/** 털 뭉침 정도: 아비시니안 1, 테디 0.4 */
export function messyOf(coat: Coat): number {
  return coat.fluff === 'rosette' ? 1 : coat.fluff === 'teddy' ? 0.4 : 0;
}

/** 머리 꼭대기 (털까지) */
export function headTopOf(coat: Coat): number {
  return SKULL_Y + SKULL_R[1] + coat.fur * (1 + messyOf(coat) * 1.4);
}

/** 단위 구 방향 (yaw, pitch) → 머리 타원체 위의 점 (머리 공간) */
export function skullPoint(yaw: number, pitch: number): [number, number, number] {
  return [Math.sin(yaw) * Math.cos(pitch) * SKULL_R[0], Math.sin(pitch) * SKULL_R[1], Math.cos(yaw) * Math.cos(pitch) * SKULL_R[2]];
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 0~255 RGB */
export const rgbOf = hex;

/** k: 0이면 그대로, 1이면 검정 */
export function shade(c: string, k: number): string {
  const [r, g, b] = hex(c);
  return `rgb(${Math.round(r * (1 - k))},${Math.round(g * (1 - k))},${Math.round(b * (1 - k))})`;
}

/** k: 0이면 그대로, 1이면 하양 */
export function lighten(c: string, k: number): string {
  const [r, g, b] = hex(c);
  return `rgb(${Math.round(r + (255 - r) * k)},${Math.round(g + (255 - g) * k)},${Math.round(b + (255 - b) * k)})`;
}

/** 밝기 0~1 */
export function luma(c: string): number {
  const [r, g, b] = hex(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** 무늬를 고려한 그 자리의 털색 (#rrggbb) — 셰이더와 같은 규칙에서 들쭉날쭉함만 뺀 것 */
export function coatAt(coat: Coat, on: 'head' | 'body', p: V3): string {
  let col = hex(coat.base);
  for (const q of coat.patches) {
    if (q.on !== on) continue;
    const d = Math.hypot((p[0] - q.c[0]) / q.r[0], (p[1] - q.c[1]) / q.r[1], (p[2] - q.c[2]) / q.r[2]);
    if (d < 1) {
      const a = q.a ?? 1;
      const pc = hex(q.color);
      col = [col[0] + (pc[0] - col[0]) * a, col[1] + (pc[1] - col[1]) * a, col[2] + (pc[2] - col[2]) * a];
    }
  }
  return '#' + col.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** 눈썹 색: 그 자리 털이 어두우면 밝게, 밝으면 진하게 (화면 왼쪽, 오른쪽) */
export function browColors(coat: Coat): [string, string] {
  const of = (dir: -1 | 1): string => {
    const fur = coatAt(coat, 'head', skullPoint(dir * EYE.yaw, EYE.pitch + 0.3));
    return luma(fur) < 0.42 ? lighten(fur, 0.62) : shade(fur, 0.55);
  };
  return [of(-1), of(1)];
}

/** 주둥이 앞 털이 어두운지 (히말라얀처럼) — 입 선을 밝게 그린다 */
export function darkSnout(coat: Coat): boolean {
  return luma(coatAt(coat, 'head', [0, SNOUT_POS[1] + 0.1, SNOUT_POS[2] + SNOUT_R[2]])) < 0.42;
}
