/**
 * 기니피그 한 마리 — 절차적으로 만든 셀 셰이딩 3D 캐릭터.
 *   root  : 자리 위치 (y = 0 이 테이블 레일 높이)
 *   lift  : 깡충 뛰기
 *   body  : 숨쉬기·눌림 (몸통 + 나비넥타이 + 머리)
 *   head  : 끄덕임·갸웃
 *   paws  : 레일 위에 올린 두 앞발 (잘리지 않음)
 * 얼굴은 2D 초상화와 같은 drawFace()로 캔버스 텍스처에 그려 머리 앞면에 붙인다.
 */
import * as THREE from 'three';
import { CHARACTERS, type CharacterId } from '../characters/roster';
import { drawFace, type Expression } from '../characters/draw2d';
import type { ReactionKind } from '../store/game';
import type { Mats } from './materials';

const FACE_PX = 512;
const FACE_W = 600;
const SKULL_Y = 1.42;
export const PAW_Z = 0.84;
const WHITE = '#fffdf8';
const LINE = 0.045;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);

const ANIM_MS: Partial<Record<ReactionKind, number>> = {
  play: 650,
  meld: 950,
  combo: 1150,
  draw: 720,
  nod: 820,
  surprise: 700,
  win: 1500,
  lose: 900,
};

const FACE_FOR: Partial<Record<ReactionKind, [Expression, number]>> = {
  play: ['happy', 800],
  meld: ['happy', 1500],
  combo: ['happy', 1800],
  surprise: ['surprised', 1100],
  draw: ['blink', 240],
};

export class Guinea {
  readonly root = new THREE.Group();
  readonly headTop: number;
  private readonly lift = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly pawL = new THREE.Group();
  private readonly pawR = new THREE.Group();
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly tex: THREE.CanvasTexture;
  private shown: Expression | null = null;
  private readonly phase = Math.random() * Math.PI * 2;
  private readonly energy: number;
  private nextBlink = performance.now() + 600 + Math.random() * 3000;
  private blinkUntil = 0;
  private anim: { kind: ReactionKind; t0: number; dur: number } | null = null;
  private temp: { ex: Expression; until: number } | null = null;
  private overAt = 0;
  private pawBase = 0;
  thinking = false;
  moving = false;
  over: 'win' | 'lose' | null = null;

  constructor(
    readonly id: CharacterId,
    private readonly m: Mats,
  ) {
    const spec = CHARACTERS[id];
    // 휘기는 활발하게, 기니니는 점잖게
    this.energy = id === 'hwigi' ? 1.25 : id === 'ginini' ? 0.7 : 1;

    // 몸통 (레일 아래는 잘려서 테이블 뒤에 앉은 것처럼 보인다)
    this.body.add(this.blob(WHITE, [1.02, 0.98, 0.9], [0, 0.16, -0.14], LINE, true));

    // 머리: 목(0.62)을 축으로 움직인다
    this.head.position.set(0, 0.62, 0);
    const skull = new THREE.Group();
    skull.position.set(0, SKULL_Y - 0.62, 0.02);
    skull.add(this.blob(WHITE, [1, 0.9, 0.9], [0, 0, 0], LINE, true));

    // 얼굴 텍스처
    this.canvas = document.createElement('canvas');
    this.canvas.width = FACE_PX;
    this.canvas.height = FACE_PX;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const face = new THREE.Mesh(m.faceCap, m.face(this.tex));
    face.scale.set(1, 0.9, 0.9);
    face.renderOrder = 2;
    skull.add(face);

    if (spec.fur === 'fluffy') {
      // 휘기: 옆과 위로 뻗친 갈기 — 머리 윤곽을 따라 가늘고 긴 털 뭉치를 둘러 뾰족한 실루엣을 만든다.
      // 털 뭉치를 얼굴 가장자리보다 살짝 앞(z)에 두어 머리 자체의 외곽선을 덮는다.
      const n = 19;
      for (let i = 0; i < n; i++) {
        const a = THREE.MathUtils.degToRad(-42 + (i / (n - 1)) * 264);
        const long = i % 2 === 0 ? 0.5 : 0.38;
        const side = Math.abs(Math.cos(a));
        const tuft = this.blob(WHITE, [0.23, long + side * 0.07, 0.25], [Math.cos(a) * 0.9, Math.sin(a) * 0.8, -0.02], 0.032, true);
        tuft.rotation.z = a - Math.PI / 2;
        skull.add(tuft);
      }
      // 뒤쪽 한 겹 더 (고개를 돌려도 비지 않게)
      for (let i = 0; i < 10; i++) {
        const a = THREE.MathUtils.degToRad(-25 + (i / 9) * 230);
        const tuft = this.blob(WHITE, [0.28, 0.4, 0.28], [Math.cos(a) * 0.74, Math.sin(a) * 0.68, -0.5], 0.032, true);
        tuft.rotation.z = a - Math.PI / 2;
        skull.add(tuft);
      }
      this.headTop = SKULL_Y + 0.9 + 0.36;
    } else {
      // 매끈한 친구들: 정수리의 두 봉우리 (구름 모양 머리)
      for (const dir of [-1, 1] as const) {
        const color = spec.patches && dir === 1 ? '#b07a4e' : WHITE;
        skull.add(this.blob(color, [0.43, 0.41, 0.4], [dir * 0.42, 0.6, -0.12], LINE, true));
      }
      if (spec.patches) {
        // 모카: 뒤통수 쪽 갈색 얼룩
        skull.add(this.blob('#b07a4e', [0.55, 0.5, 0.45], [-0.55, -0.05, -0.45], LINE, true));
      }
      this.headTop = SKULL_Y + 0.6 + 0.42;
    }
    this.head.add(skull);
    this.body.add(this.head);

    // 나비넥타이
    const bow = new THREE.Mesh(m.bow, m.toon(spec.bow === '#141414' ? '#222222' : spec.bow, true));
    bow.position.set(0, 0.56, 0.74);
    bow.rotation.x = -0.18;
    this.body.add(bow);
    if (spec.bow !== '#141414') {
      const edge = new THREE.Mesh(m.bow, m.outline(0.02, 1, true));
      edge.position.copy(bow.position);
      edge.rotation.copy(bow.rotation);
      this.body.add(edge);
    }

    this.lift.add(this.body);
    // 앞발 (레일 위, 잘리지 않음)
    for (const [paw, dir] of [
      [this.pawL, -1],
      [this.pawR, 1],
    ] as const) {
      paw.add(this.blob(WHITE, [0.21, 0.14, 0.23], [0, 0, 0], 0.032, false));
      paw.position.set(dir * 0.42, 0, PAW_Z);
      this.lift.add(paw);
    }
    this.root.add(this.lift);
    this.drawExpression('idle');
  }

  private blob(color: string, scale: [number, number, number], pos: [number, number, number], line: number, clipped: boolean): THREE.Group {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(this.m.unit, this.m.toon(color, clipped));
    const avg = (scale[0] + scale[1] + scale[2]) / 3;
    const edge = new THREE.Mesh(this.m.unit, this.m.outline(line, avg, clipped));
    g.add(mesh, edge);
    g.scale.set(...scale);
    g.position.set(...pos);
    return g;
  }

  /** 앞발을 올려 둘 높이 (원근 때문에 레일 선이 z에 따라 조금 달라진다) */
  setPawBase(y: number): void {
    this.pawBase = y;
  }

  react(kind: ReactionKind, now: number): void {
    if (kind === 'win') this.over = 'win';
    if (kind === 'lose') {
      this.over = 'lose';
      this.overAt = now;
    }
    const dur = ANIM_MS[kind];
    if (dur) this.anim = { kind, t0: now, dur };
    const f = FACE_FOR[kind];
    if (f) this.temp = { ex: f[0], until: now + f[1] };
  }

  clearOver(): void {
    this.over = null;
    if (this.anim?.kind === 'win' || this.anim?.kind === 'lose') this.anim = null;
  }

  /** 움직임이 남아 있으면 true (무대가 프레임을 아끼지 않도록) */
  busy(now: number): boolean {
    return !!this.anim && now - this.anim.t0 < this.anim.dur + 50;
  }

  update(now: number, reduced: boolean): void {
    const t = now / 1000;
    const e = this.energy;
    let hop = 0;
    let squash = 0;
    let headX = 0;
    let headY = 0;
    let headZ = 0;
    let pawL = 0;
    let pawR = 0;
    if (!reduced) {
      squash += 0.013 * e * Math.sin(t * 1.9 + this.phase);
      headZ += 0.035 * e * Math.sin(t * 0.6 + this.phase);
      headY += 0.06 * e * Math.sin(t * 0.37 + this.phase * 2);
    }
    if (this.thinking) {
      headZ += 0.15;
      headX -= 0.1;
      if (!reduced) headZ += 0.035 * Math.sin(t * 1.5);
    }
    if (this.moving) {
      pawL += 0.16;
      pawR += 0.16;
    }
    const a = this.anim;
    if (a) {
      const p = clamp01((now - a.t0) / a.dur);
      const bell = Math.sin(Math.PI * p);
      const k = reduced ? 0 : 1;
      switch (a.kind) {
        case 'play':
          hop += 0.1 * bell * k;
          pawL += 0.22 * bell;
          pawR += 0.22 * bell;
          break;
        case 'meld':
          hop += 0.24 * bell * k;
          squash += 0.06 * bell * k;
          break;
        case 'combo':
          hop += 0.42 * bell * k;
          squash += 0.08 * Math.sin(2 * Math.PI * p) * k;
          headY += 0.25 * Math.sin(2 * Math.PI * p) * k;
          break;
        case 'draw':
          pawR += 0.3 * bell;
          headX += 0.14 * bell;
          break;
        case 'nod':
          headX += 0.2 * Math.sin(4 * Math.PI * p) * (1 - p);
          break;
        case 'surprise':
          hop += 0.16 * Math.sin(Math.PI * clamp01(p * 2.2)) * k;
          headX -= 0.12 * bell;
          break;
        case 'win':
          hop += 0.3 * Math.abs(Math.sin(3 * Math.PI * p)) * k;
          break;
        default:
          break;
      }
      if (now - a.t0 >= a.dur) {
        // 이긴 친구는 잠깐 쉬었다가 다시 뛴다
        this.anim = a.kind === 'win' && this.over === 'win' && !reduced ? { kind: 'win', t0: now + 700, dur: 1500 } : null;
      }
    }
    if (this.over === 'lose') {
      const s = easeOut(clamp01((now - this.overAt) / 800));
      headX += 0.24 * s;
      squash -= 0.05 * s;
    }
    this.lift.position.y = hop;
    this.body.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
    this.head.rotation.set(headX, headY, headZ);
    this.pawL.position.set(-0.42, this.pawBase + 0.1, PAW_Z + pawL);
    this.pawR.position.set(0.42, this.pawBase + 0.1 + (pawR > 0.2 ? 0.05 : 0), PAW_Z + pawR);

    // 표정
    if (now >= this.nextBlink) {
      this.blinkUntil = now + 140;
      this.nextBlink = now + 2200 + Math.random() * 3600;
    }
    let ex: Expression = now < this.blinkUntil ? 'blink' : 'idle';
    if (this.over) ex = this.over;
    else if (this.temp && now < this.temp.until) ex = this.temp.ex;
    else if (this.thinking && ex !== 'blink') ex = 'think';
    if (ex !== this.shown) this.drawExpression(ex);
  }

  /** 초상화용: 기본 자세에 표정 하나를 고정 */
  pose(ex: Expression): void {
    this.lift.position.y = 0;
    this.body.scale.set(1, 1, 1);
    this.head.rotation.set(ex === 'think' ? -0.08 : ex === 'lose' ? 0.18 : 0, 0, ex === 'think' ? 0.14 : 0);
    this.pawL.position.set(-0.42, this.pawBase + 0.1, PAW_Z);
    this.pawR.position.set(0.42, this.pawBase + 0.1, PAW_Z);
    this.drawExpression(ex);
  }

  private drawExpression(ex: Expression): void {
    this.shown = ex;
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, FACE_PX, FACE_PX);
    drawFace(ctx, this.id, ex, FACE_PX / 2, FACE_PX / 2, FACE_W);
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.tex.dispose();
  }
}
