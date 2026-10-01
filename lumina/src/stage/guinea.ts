/**
 * 기니피그 한 마리 — 실제 기니피그를 본떠 코드로 만든 3D 캐릭터.
 *   root  : 자리 위치 (y = 0 이 테이블 레일 높이)
 *   lift  : 깡충 뛰기
 *   body  : 숨쉬기·눌림 (몸통 + 나비넥타이 + 머리)
 *   head  : 끄덕임·갸웃 (목이 축)
 *   skull : 머리 가운데가 원점인 "머리 공간" — 털 무늬·눈·귀·주둥이가 여기에 붙는다
 *   paws  : 레일 위에 올린 두 앞발 (잘리지 않음)
 * 생김새: 목 없이 몸에 붙은 큰 머리, 둥근 주둥이(로마 코)와 통통한 볼, 꽃잎 같은 처진 귀,
 * 옆으로 붙은 까맣고 반짝이는 눈, 분홍 코와 "ω" 입, 수염, 꼬리 없음. 털색·무늬는 roster의 품종(coat)을 따른다.
 */
import * as THREE from 'three';
import { CHARACTERS, type CharacterId, type Coat } from '../characters/roster';
import type { Expression } from '../characters/draw2d';
import type { ReactionKind } from '../store/game';
import { coatMaterial, type CoatLook, type Mats } from './materials';
import { paintSkull, paintSnout } from './guineaFace';
import {
  BLUSH,
  BODY_POS,
  BODY_R,
  CHEEK_POS,
  CHEEK_R,
  EAR,
  EYE,
  EYE_R,
  NECK_Y,
  PAW_Z,
  SHOULDER_POS,
  SHOULDER_R,
  SKULL_AT,
  SKULL_R,
  SNOUT_POS,
  SNOUT_R,
  browColors,
  darkSnout,
  headTopOf,
  messyOf,
  shade,
  type V3,
} from '../characters/anatomy';

export { PAW_Z };
const SKULL_PX = 512;
const SNOUT_PX = 256;

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

/** 단위 구 방향 → 머리 타원체 위의 점과 바깥 법선 */
function onSkull(yaw: number, pitch: number): { p: THREE.Vector3; n: THREE.Vector3 } {
  const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const p = new THREE.Vector3(d.x * SKULL_R[0], d.y * SKULL_R[1], d.z * SKULL_R[2]);
  const n = new THREE.Vector3(d.x / SKULL_R[0], d.y / SKULL_R[1], d.z / SKULL_R[2]).normalize();
  return { p, n };
}

/** z축을 n 방향으로 돌리는 회전 */
function facing(n: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n.clone().normalize());
}

interface Eye {
  readonly group: THREE.Group;
  readonly ball: THREE.Mesh;
  readonly arc: THREE.Mesh;
  readonly glints: THREE.Mesh[];
  readonly center: THREE.Vector3;
  readonly n: THREE.Vector3;
}

export class Guinea {
  readonly root = new THREE.Group();
  readonly headTop: number;
  private readonly lift = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly skull = new THREE.Group();
  private readonly pawL = new THREE.Group();
  private readonly pawR = new THREE.Group();
  private readonly eyes: Eye[] = [];
  private readonly skullCanvas: HTMLCanvasElement;
  private readonly snoutCanvas: HTMLCanvasElement;
  private readonly skullTex: THREE.CanvasTexture;
  private readonly snoutTex: THREE.CanvasTexture;
  private readonly owned: THREE.Material[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly brows: [string, string];
  private readonly darkSnout: boolean;
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
    const coat = spec.coat;
    // 휘기는 활발하게, 기니니는 점잖게
    this.energy = id === 'hwigi' ? 1.25 : id === 'ginini' ? 0.7 : 1;
    const seed = [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 97;
    const headLook: CoatLook = {
      base: coat.base,
      patches: [
        ...coat.patches.filter((p) => p.on === 'head'),
        // 볼터치
        { c: [-BLUSH.c[0], BLUSH.c[1], BLUSH.c[2]], r: BLUSH.r, color: BLUSH.color, a: BLUSH.a },
        { c: BLUSH.c, r: BLUSH.r, color: BLUSH.color, a: BLUSH.a },
      ],
      ticked: coat.ticked,
      seed,
    };
    const bodyLook: CoatLook = { base: coat.base, patches: coat.patches.filter((p) => p.on === 'body'), ticked: coat.ticked, seed: seed + 11 };

    const messy = messyOf(coat);
    // ── 몸통 (레일 아래는 잘려서 테이블 뒤에 앉은 것처럼 보인다)
    this.body.add(this.coated(bodyLook, BODY_POS, BODY_R, { fur: coat.fur, messy: messy * 0.6 }));
    // 어깨: 머리와 몸 사이를 메워 목 없이 감자처럼 이어지게
    this.body.add(this.coated(bodyLook, SHOULDER_POS, SHOULDER_R, {}));

    // ── 머리
    this.head.position.set(0, NECK_Y, 0);
    this.skull.position.set(SKULL_AT[0], SKULL_AT[1] - NECK_Y, SKULL_AT[2]);
    this.skull.add(this.coated(headLook, [0, 0, 0], SKULL_R, { fur: coat.fur, faceMask: true, messy }));
    // 주둥이와 통통한 볼
    this.skull.add(this.coated(headLook, SNOUT_POS, SNOUT_R, {}));
    for (const dir of [-1, 1]) this.skull.add(this.coated(headLook, [dir * CHEEK_POS[0], CHEEK_POS[1], CHEEK_POS[2]], CHEEK_R, {}));

    // 얼굴 그림 두 장
    this.skullCanvas = document.createElement('canvas');
    this.skullCanvas.width = SKULL_PX;
    this.skullCanvas.height = SKULL_PX;
    this.skullTex = new THREE.CanvasTexture(this.skullCanvas);
    this.skullTex.colorSpace = THREE.SRGBColorSpace;
    this.skullTex.anisotropy = 4;
    const skullDecal = new THREE.Mesh(m.skullCap, m.decal(this.skullTex));
    skullDecal.scale.set(...SKULL_R);
    skullDecal.renderOrder = 2;
    this.skull.add(skullDecal);
    this.snoutCanvas = document.createElement('canvas');
    this.snoutCanvas.width = SNOUT_PX;
    this.snoutCanvas.height = SNOUT_PX;
    this.snoutTex = new THREE.CanvasTexture(this.snoutCanvas);
    this.snoutTex.colorSpace = THREE.SRGBColorSpace;
    this.snoutTex.anisotropy = 4;
    const snoutDecal = new THREE.Mesh(m.snoutCap, m.decal(this.snoutTex));
    snoutDecal.position.set(...SNOUT_POS);
    snoutDecal.scale.set(...SNOUT_R);
    snoutDecal.renderOrder = 2;
    this.skull.add(snoutDecal);

    this.brows = browColors(coat);
    this.darkSnout = darkSnout(coat);

    // ── 눈
    for (const dir of [-1, 1] as const) this.eyes.push(this.makeEye(dir, coat));
    // ── 귀
    for (const dir of [-1, 1] as const) this.skull.add(this.makeEar(dir, coat));
    // ── 수염
    this.addWhiskers(coat);
    // ── 안경
    if (spec.glasses) this.addGlasses();

    this.head.add(this.skull);
    this.body.add(this.head);

    // ── 나비넥타이
    const bow = new THREE.Mesh(m.bow, m.plain(spec.bow, { roughness: 0.42 }));
    bow.position.set(0, 0.6, 0.77);
    bow.rotation.x = -0.22;
    bow.scale.setScalar(1.05);
    this.body.add(bow);

    this.lift.add(this.body);
    // ── 앞발 (레일 위, 잘리지 않음)
    for (const [paw, dir] of [
      [this.pawL, -1],
      [this.pawR, 1],
    ] as const) {
      this.makePaw(paw, coat, dir);
      paw.position.set(dir * 0.42, 0, PAW_Z);
      this.lift.add(paw);
    }
    this.root.add(this.lift);
    this.headTop = headTopOf(coat);
    this.drawExpression('idle');
  }

  /** 털옷을 입힌 타원체 하나 (fur가 있으면 털 껍질도) */
  private coated(look: CoatLook, pos: V3, scale: V3, o: { fur?: number; faceMask?: boolean; messy?: number }): THREE.Group {
    const g = new THREE.Group();
    g.position.set(...pos);
    g.scale.set(...scale);
    g.updateMatrix();
    const part = g.matrix.clone();
    const base = coatMaterial(look, { part, clipped: true }, this.m.planes);
    this.owned.push(base);
    g.add(new THREE.Mesh(this.m.unit, base));
    if (o.fur && o.fur > 0) {
      const furMat = coatMaterial(look, { part, clipped: true, fur: o.fur / Math.min(...scale), faceMask: o.faceMask, messy: o.messy }, this.m.planes);
      this.owned.push(furMat);
      g.add(new THREE.Mesh(this.m.furUnit, furMat));
    }
    return g;
  }

  private own<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }

  private makeEye(dir: -1 | 1, coat: Coat): Eye {
    const { p, n } = onSkull(dir * EYE.yaw, EYE.pitch);
    const center = p.clone().addScaledVector(n, -EYE_R * 0.42);
    const group = new THREE.Group();
    group.position.copy(center);
    group.quaternion.copy(facing(n));
    const ball = new THREE.Mesh(this.m.unit, this.m.plain(coat.eye, { gloss: true, roughness: 0.18 }));
    ball.scale.set(EYE_R * 0.96, EYE_R * 1.06, EYE_R * 0.82);
    group.add(ball);
    // 웃을 때 감은 눈 "∩"
    const arcGeo = this.own(new THREE.TorusGeometry(EYE_R * 0.78, EYE_R * 0.16, 8, 24, Math.PI));
    const arc = new THREE.Mesh(arcGeo, this.m.plain(coat.eye, { roughness: 0.5 }));
    arc.position.set(0, -EYE_R * 0.25, EYE_R * 0.55);
    arc.scale.set(1, 0.85, 1);
    arc.visible = false;
    group.add(arc);
    this.skull.add(group);
    // 반짝이: 카메라 쪽 위에 큰 점 하나, 아래에 작은 점 하나 (머리 공간에 붙여 눈과 같이 돌지 않게)
    const white = this.m.plain('#ffffff', { roughness: 0.3 });
    const glints: THREE.Mesh[] = [];
    for (const [r, off] of [
      [0.3, new THREE.Vector3(-0.35, 0.45, 0.9)],
      [0.15, new THREE.Vector3(0.32, -0.38, 0.9)],
    ] as const) {
      const gl = new THREE.Mesh(this.m.unit, white);
      gl.scale.setScalar(EYE_R * r);
      gl.position.copy(center).addScaledVector(off.clone().normalize(), EYE_R * 0.92);
      gl.userData.off = off.clone().normalize();
      this.skull.add(gl);
      glints.push(gl);
    }
    return { group, ball, arc, glints, center, n };
  }

  private makeEar(dir: -1 | 1, coat: Coat): THREE.Group {
    const { p, n } = onSkull(dir * EAR.yaw, EAR.pitch);
    // 꽃잎 귀: 머리 위옆에 붙어 바깥 아래로 축 처지고, 넓은 면은 옆을 더 본다 (안쪽 분홍은 조금만)
    const out = n.clone().add(new THREE.Vector3(dir * 0.75, -1.45, 0.05)).normalize();
    const face = new THREE.Vector3(dir * 0.95, 0.35, 0.62).normalize();
    const z = face.clone().addScaledVector(out, -face.dot(out)).normalize();
    const x = out.clone().multiplyScalar(dir);
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const ear = new THREE.Group();
    ear.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    ear.position.copy(p).addScaledVector(out, 0.17).addScaledVector(n, -0.02);
    const outer = new THREE.Mesh(this.m.unit, this.m.plain(dir < 0 ? coat.ears[0] : coat.ears[1], { roughness: 0.85 }));
    outer.scale.set(0.31, 0.21, 0.055);
    const inner = new THREE.Mesh(this.m.unit, this.m.plain(coat.earIn, { roughness: 0.7 }));
    inner.scale.set(0.19, 0.12, 0.03);
    inner.position.set(-dir * 0.05, 0.015, 0.03);
    ear.add(outer, inner);
    return ear;
  }

  private addWhiskers(coat: Coat): void {
    const mat = this.m.plain(coat.whisker, { roughness: 0.5 });
    for (const dir of [-1, 1])
      for (const k of [0, 1]) {
        const a = new THREE.Vector3(dir * 0.3, -0.21 - k * 0.07, 0.83 - k * 0.02);
        const c = new THREE.Vector3(dir * 0.66, -0.16 - k * 0.1, 0.92);
        const b = new THREE.Vector3(dir * 1.02, -0.18 - k * 0.2 + 0.04, 0.78);
        const geo = this.own(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, c, b), 12, 0.0085, 5, false));
        this.skull.add(new THREE.Mesh(geo, mat));
      }
  }

  private addGlasses(): void {
    const mat = this.m.plain('#3b2d27', { roughness: 0.32, metal: 0.45 });
    const ring = this.own(new THREE.TorusGeometry(EYE_R * 1.45, 0.018, 10, 40));
    const ends: THREE.Vector3[] = [];
    for (const e of this.eyes) {
      const fwd = e.n.clone().lerp(new THREE.Vector3(0, 0, 1), 0.55).normalize();
      const r = new THREE.Mesh(ring, mat);
      r.position.copy(e.center).addScaledVector(fwd, EYE_R * 1.05);
      r.quaternion.copy(facing(fwd));
      this.skull.add(r);
      // 코 쪽 고리 끝
      ends.push(r.position.clone().add(new THREE.Vector3(-Math.sign(e.center.x) * EYE_R * 1.42, 0.02, 0.02)));
    }
    const [a, b] = ends;
    if (a && b) {
      const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.07, 0.06));
      const bridge = this.own(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 10, 0.016, 6, false));
      this.skull.add(new THREE.Mesh(bridge, mat));
    }
  }

  private makePaw(paw: THREE.Group, coat: Coat, dir: -1 | 1): void {
    const fur = new THREE.Mesh(this.m.unit, this.m.plain(coat.paw, { clipped: false, roughness: 0.85 }));
    fur.scale.set(0.18, 0.12, 0.21);
    paw.add(fur);
    // 발가락 세 개
    const toe = this.m.plain(shade(coat.paw, 0.12), { clipped: false, roughness: 0.7 });
    for (const k of [-1, 0, 1]) {
      const t = new THREE.Mesh(this.m.unit, toe);
      t.scale.set(0.052, 0.045, 0.05);
      t.position.set(k * 0.085 + dir * 0.005, -0.035, 0.19 - Math.abs(k) * 0.025);
      paw.add(t);
    }
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
    // 그림이 바뀌는 표정만 다시 그린다 (깜빡임은 눈 모양만)
    const prev = this.shown;
    this.shown = ex;
    this.setEyes(ex);
    const faceKey = (x: Expression | null): Expression | null => (x === 'blink' ? 'idle' : x);
    if (prev !== null && faceKey(prev) === faceKey(ex)) return;
    const spec = CHARACTERS[this.id];
    const sk = this.skullCanvas.getContext('2d');
    if (sk) paintSkull(sk, SKULL_PX, spec, faceKey(ex) ?? 'idle', EYE, this.brows);
    const sn = this.snoutCanvas.getContext('2d');
    if (sn) paintSnout(sn, SNOUT_PX, spec.coat, faceKey(ex) ?? 'idle', this.darkSnout);
    this.skullTex.needsUpdate = true;
    this.snoutTex.needsUpdate = true;
  }

  /** 눈 모양: 깜빡임은 납작하게, 웃으면 "∩", 놀라면 크게, 슬프면 반짝이를 크게(글썽) */
  private setEyes(ex: Expression): void {
    const closed = ex === 'happy' || ex === 'win';
    const blink = ex === 'blink';
    const big = ex === 'surprised' ? 1.16 : 1;
    const teary = ex === 'sad' || ex === 'lose';
    for (const e of this.eyes) {
      e.ball.visible = !closed;
      e.arc.visible = closed;
      e.group.scale.set(big, blink ? 0.12 : teary ? 0.94 : big, big);
      e.glints.forEach((g, i) => {
        g.visible = !closed && !blink;
        const s = EYE_R * (i === 0 ? 0.3 : 0.15) * (teary ? 1.3 : ex === 'surprised' ? 1.1 : 1);
        g.scale.setScalar(s);
        const off = (g.userData.off as THREE.Vector3).clone();
        if (ex === 'think') off.add(new THREE.Vector3(0, 0.35, 0)).normalize();
        g.position.copy(e.center).addScaledVector(off, EYE_R * 0.92 * big);
      });
    }
  }

  dispose(): void {
    this.skullTex.dispose();
    this.snoutTex.dispose();
    this.owned.forEach((m) => m.dispose());
    this.geos.forEach((g) => g.dispose());
  }
}
