/**
 * 반짝이(큰 수·등록)와 색종이(승리). 종류마다 인스턴스 메시 하나.
 */
import * as THREE from 'three';

interface P {
  life: number;
  age: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  w: number;
  h: number;
}

const GRAVITY = -5.5;

/** 네 갈래 별 (반짝이) */
function starTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#fff';
    g.beginPath();
    const r1 = 31;
    const r2 = 7;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? r1 : r2;
      const x = 32 + Math.cos(a) * r;
      const y = 32 + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Pool {
  readonly mesh: THREE.InstancedMesh;
  readonly items: P[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private next = 0;
  alive = 0;

  constructor(
    clip: THREE.Plane,
    count: number,
    private readonly drag: number,
    private readonly gravity: number,
    private readonly twinkle: boolean,
    map?: THREE.Texture,
  ) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    if (map) {
      mat.map = map;
      mat.transparent = true;
      mat.depthWrite = false;
    }
    mat.clippingPlanes = [clip];
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < count; i++) {
      this.items.push({ life: 0, age: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), w: 0.1, h: 0.1 });
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.color.set('#ffffff'));
    }
  }

  take(color: string): P {
    const i = this.next;
    this.next = (this.next + 1) % this.items.length;
    this.mesh.setColorAt(i, this.color.set(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return this.items[i] as P;
  }

  update(dt: number): void {
    let alive = 0;
    let dirty = false;
    const hide = (i: number): void => {
      this.dummy.position.set(0, 0, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    };
    this.items.forEach((p, i) => {
      if (p.life <= 0) return;
      p.age += dt;
      dirty = true;
      if (p.age >= p.life) {
        p.life = 0;
        hide(i);
        return;
      }
      alive++;
      if (p.age < 0) {
        hide(i);
        return;
      }
      p.vel.multiplyScalar(this.drag);
      p.vel.y += this.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      const q = p.age / p.life;
      const s = this.twinkle ? Math.sin(Math.PI * Math.min(1, q * 1.1)) : q > 0.85 ? (1 - q) / 0.15 : 1;
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.copy(p.rot);
      this.dummy.scale.set(p.w * s, p.h * s, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
    this.alive = alive;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    const m = this.mesh.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.dispose();
    this.mesh.dispose();
  }
}

export class Particles {
  readonly group = new THREE.Group();
  private readonly sparks: Pool;
  private readonly paper: Pool;

  constructor(clip: THREE.Plane) {
    this.sparks = new Pool(clip, 64, 0.93, GRAVITY * 0.3, true, starTexture());
    this.paper = new Pool(clip, 120, 0.985, GRAVITY * 0.55, false);
    this.group.add(this.sparks.mesh, this.paper.mesh);
  }

  get alive(): number {
    return this.sparks.alive + this.paper.alive;
  }

  /** 머리 위로 톡톡 튀는 반짝이 */
  sparkle(at: THREE.Vector3, colors: readonly string[], n = 12): void {
    for (let k = 0; k < n; k++) {
      const p = this.sparks.take(colors[k % colors.length] as string);
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 1.3 + Math.random() * 1.2;
      p.life = 0.75 + Math.random() * 0.35;
      p.age = -Math.random() * 0.08;
      p.pos.copy(at);
      p.vel.set(Math.cos(a) * sp, Math.sin(a) * sp * 0.8 + 1.1, 0.3);
      p.rot.set(0, 0, Math.random() * 0.6);
      p.spin.set(0, 0, (Math.random() - 0.5) * 5);
      p.w = p.h = 0.2 + Math.random() * 0.14;
    }
    this.sparks.alive = Math.max(this.sparks.alive, 1);
  }

  /** 승리 색종이 */
  confetti(at: THREE.Vector3, spread: number, colors: readonly string[], n = 46): void {
    for (let k = 0; k < n; k++) {
      const p = this.paper.take(colors[k % colors.length] as string);
      p.life = 1.6 + Math.random() * 0.9;
      p.age = -Math.random() * 0.25;
      p.pos.set(at.x + (Math.random() - 0.5) * spread, at.y + Math.random() * 0.4, at.z + (Math.random() - 0.3) * 0.8);
      p.vel.set((Math.random() - 0.5) * 2.6, 2.6 + Math.random() * 2.4, (Math.random() - 0.2) * 1.2);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8);
      p.w = 0.1 + Math.random() * 0.05;
      p.h = 0.16 + Math.random() * 0.06;
    }
    this.paper.alive = Math.max(this.paper.alive, 1);
  }

  update(dt: number): void {
    this.sparks.update(dt);
    this.paper.update(dt);
  }

  dispose(): void {
    this.sparks.dispose();
    this.paper.dispose();
  }
}
