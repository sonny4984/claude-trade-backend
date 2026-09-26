/**
 * 3D 무대 — 테이블 건너편에 앉은 기니피그 친구들.
 *
 * 화면 맞춤: 카메라는 정면을 보고, 캔버스의 "레일 선"(DOM 테이블 레일의 윗선) 픽셀에
 * 월드 y = 0 이 오도록 카메라 높이를 정한다. 카메라와 그 선을 지나는 평면으로
 * 몸통을 잘라 내면 캐릭터가 진짜 테이블 뒤에 앉아 있는 것처럼 보인다.
 * 이름표·말풍선·타일 출발점은 DOM이고, 여기서는 그 좌표(앵커)만 계산해 넘긴다.
 */
import * as THREE from 'three';
import type { CharacterId } from '../characters/roster';
import type { ReactionKind } from '../store/game';
import { createMats, glowTexture, type Mats } from './materials';
import { Guinea, PAW_Z } from './guinea';
import { Particles } from './particles';

export interface Anchor {
  readonly tagX: number;
  readonly tagY: number;
  readonly bubbleX: number;
  readonly bubbleY: number;
  /** 오른쪽 끝 캐릭터는 말풍선을 머리 왼쪽에 */
  readonly bubbleFlip: boolean;
  readonly originX: number;
  readonly originY: number;
}

export interface CastMember {
  readonly seat: number;
  readonly character: CharacterId;
}

const FOV = 24;
const GAP = 2.75;
const HALF_W = 1.45;
const ABOVE = 2.95;
const CONFETTI = ['#9e1b2a', '#1d4e9e', '#c45a12', '#1a1714', '#e2c27f', '#f3e6c8'];

export class StageScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  private readonly clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly mats: Mats;
  private readonly rigs = new Map<number, Guinea>();
  private cast: CastMember[] = [];
  private readonly particles: Particles;
  private readonly glow: THREE.Sprite;
  private readonly glowTex: THREE.CanvasTexture;
  private glowX = 0;
  private glowAlpha = 0;
  private current: number | null = null;
  private w = 1;
  private h = 1;
  private rail = 1;
  private D = 10;
  private camY = 1;
  private raf = 0;
  private running = false;
  private last = 0;
  private lastRender = 0;
  private dirty = true;
  private sparkleColors: string[] = ['#e2c27f', '#fff4d6', '#c9a45c'];
  private readonly onLost: (e: Event) => void;
  private readonly canvas: HTMLCanvasElement;
  reduced = false;
  onAnchors: ((a: ReadonlyMap<number, Anchor>) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, onFail: () => void) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.localClippingEnabled = true;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.onLost = (e: Event) => {
      e.preventDefault();
      this.stop();
      onFail();
    };
    canvas.addEventListener('webglcontextlost', this.onLost);

    this.mats = createMats(this.clip);
    // three.js의 물리 기반 조명 단위(÷π)에 맞춰 흰 몸이 흰색으로 보이도록 세기를 잡는다
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.55));
    const hemi = new THREE.HemisphereLight(0xfff8ee, 0x8a7a64, 0.7);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff3e2, 1.9);
    key.position.set(-4, 6, 8);
    this.scene.add(key);

    this.glowTex = glowTexture();
    const gm = new THREE.SpriteMaterial({ map: this.glowTex, color: 0xe2c27f, transparent: true, depthWrite: false, opacity: 0 });
    gm.clippingPlanes = [this.clip];
    this.glow = new THREE.Sprite(gm);
    this.glow.scale.set(3.8, 3.8, 1);
    this.glow.position.set(0, 1.5, -1.6);
    this.glow.renderOrder = -1;
    this.scene.add(this.glow);

    this.particles = new Particles(this.clip);
    this.scene.add(this.particles.group);
  }

  // ─────────────── 배역·배치 ───────────────

  setCast(cast: readonly CastMember[]): void {
    const same = cast.length === this.cast.length && cast.every((c, i) => this.cast[i]?.seat === c.seat && this.cast[i]?.character === c.character);
    if (same) return;
    const keep = new Map<number, Guinea>();
    for (const c of cast) {
      const old = this.rigs.get(c.seat);
      if (old && old.id === c.character) keep.set(c.seat, old);
    }
    this.rigs.forEach((rig, seat) => {
      if (keep.get(seat) !== rig) {
        this.scene.remove(rig.root);
        rig.dispose();
      }
    });
    this.rigs.clear();
    for (const c of cast) {
      const rig = keep.get(c.seat) ?? new Guinea(c.character, this.mats);
      this.rigs.set(c.seat, rig);
      if (!rig.root.parent) this.scene.add(rig.root);
    }
    this.cast = [...cast];
    this.layout();
  }

  resize(w: number, h: number, rail: number): void {
    if (w < 2 || h < 2) return;
    if (Math.abs(w - this.w) < 0.5 && Math.abs(h - this.h) < 0.5 && Math.abs(rail - this.rail) < 0.5) return;
    this.w = w;
    this.h = h;
    this.rail = Math.max(24, Math.min(h, rail));
    this.renderer.setSize(w, h, false);
    this.layout();
  }

  private layout(): void {
    const k = Math.max(1, this.cast.length);
    const needW = (k - 1) * GAP + HALF_W * 2;
    const s = Math.min(this.w / needW, this.rail / ABOVE);
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    this.D = this.h / 2 / (s * tan);
    this.camY = (this.rail - this.h / 2) / s;
    this.camera.aspect = this.w / this.h;
    this.camera.position.set(0, this.camY, this.D);
    this.camera.lookAt(0, this.camY, 0);
    this.camera.near = Math.max(0.1, this.D - 8);
    this.camera.far = this.D + 12;
    this.camera.updateProjectionMatrix();
    // 카메라와 레일 선(z=0, y=0)을 지나는 평면 — 이 아래는 테이블에 가려진다
    const n = new THREE.Vector3(0, this.D, -this.camY).normalize();
    this.clip.setFromNormalAndCoplanarPoint(n, new THREE.Vector3(0, 0, 0));
    const pawBase = (this.camY * PAW_Z) / this.D;
    this.cast.forEach((c, i) => {
      const rig = this.rigs.get(c.seat);
      if (!rig) return;
      rig.root.position.set((i - (k - 1) / 2) * GAP, 0, 0);
      rig.setPawBase(pawBase);
    });
    this.dirty = true;
    this.emitAnchors();
  }

  private project(x: number, y: number, z: number): [number, number] {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return [((v.x + 1) / 2) * this.w, ((1 - v.y) / 2) * this.h];
  }

  private emitAnchors(): void {
    if (!this.onAnchors) return;
    const out = new Map<number, Anchor>();
    const pawBase = (this.camY * PAW_Z) / this.D;
    this.cast.forEach((c) => {
      const rig = this.rigs.get(c.seat);
      if (!rig) return;
      const x = rig.root.position.x;
      const [tagX] = this.project(x, 0, 0);
      const flip = tagX > this.w * 0.62;
      const [bx, by] = this.project(x + (flip ? -0.66 : 0.66), rig.headTop - 0.22, 0.2);
      const [ox, oy] = this.project(x, pawBase + 0.1, PAW_Z + 0.2);
      // 말풍선(높이 약 30px + 꼬리)이 무대 위로 잘리지 않게
      out.set(c.seat, { tagX, tagY: this.rail, bubbleX: bx, bubbleY: Math.max(40, by), bubbleFlip: flip, originX: ox, originY: oy });
    });
    this.onAnchors(out);
  }

  // ─────────────── 상태 ───────────────

  setAccent(color: string): void {
    const c = color.trim();
    if (!c) return;
    try {
      (this.glow.material as THREE.SpriteMaterial).color.set(c);
      this.sparkleColors = [c, '#fff4d6', c];
    } catch {
      /* 해석 못 하는 색 — 기본값 유지 */
    }
    this.dirty = true;
  }

  setCurrent(seat: number | null): void {
    this.current = seat;
    const rig = seat === null ? undefined : this.rigs.get(seat);
    if (rig && this.glowAlpha < 0.02) this.glowX = rig.root.position.x;
    this.dirty = true;
  }

  setThinking(seat: number | null): void {
    this.rigs.forEach((rig, s) => (rig.thinking = s === seat));
    this.dirty = true;
  }

  setMoving(seat: number | null): void {
    this.rigs.forEach((rig, s) => (rig.moving = s === seat));
    this.dirty = true;
  }

  clearOver(): void {
    this.rigs.forEach((rig) => rig.clearOver());
    this.dirty = true;
  }

  react(seat: number, kind: ReactionKind): void {
    const rig = this.rigs.get(seat);
    if (!rig) return;
    const now = performance.now();
    rig.react(kind, now);
    if (!this.reduced) {
      const head = new THREE.Vector3(rig.root.position.x, rig.headTop - 0.2, 0.4);
      if (kind === 'combo') this.particles.sparkle(head, this.sparkleColors, 16);
      else if (kind === 'meld') this.particles.sparkle(head, this.sparkleColors, 10);
      else if (kind === 'win') this.particles.confetti(new THREE.Vector3(rig.root.position.x, rig.headTop + 0.3, 0.3), 2.2, CONFETTI);
    }
    this.dirty = true;
  }

  // ─────────────── 그리기 ───────────────

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private readonly frame = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    let busy = this.dirty || this.particles.alive > 0;
    if (!busy) this.rigs.forEach((r) => (busy = busy || r.busy(now)));
    const target = this.current !== null && this.rigs.has(this.current) ? 1 : 0;
    if (Math.abs(this.glowAlpha - target) > 0.01) busy = true;
    // 가만히 있을 땐 초당 30장이면 충분하다 (움직임 줄이기 설정이면 10장)
    const idleGap = this.reduced ? 100 : 33;
    if (!busy && now - this.lastRender < idleGap) return;
    this.lastRender = now;
    this.dirty = false;

    this.rigs.forEach((r) => r.update(now, this.reduced));
    this.particles.update(dt);
    const rig = this.current === null ? undefined : this.rigs.get(this.current);
    if (rig) this.glowX += (rig.root.position.x - this.glowX) * Math.min(1, dt * 8);
    this.glowAlpha += (target - this.glowAlpha) * Math.min(1, dt * 6);
    const gm = this.glow.material as THREE.SpriteMaterial;
    gm.opacity = this.glowAlpha * 0.55;
    this.glow.position.x = this.glowX;
    this.glow.visible = this.glowAlpha > 0.01;
    this.renderer.render(this.scene, this.camera);
  };

  renderOnce(): void {
    this.rigs.forEach((r) => r.update(performance.now(), this.reduced));
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.stop();
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.rigs.forEach((r) => r.dispose());
    this.rigs.clear();
    this.particles.dispose();
    this.glowTex.dispose();
    (this.glow.material as THREE.Material).dispose();
    this.mats.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
