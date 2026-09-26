/**
 * 3D 초상화 — 무대와 같은 기니피그 모델을 화면 밖 캔버스에 한 장씩 찍어 이미지로 쓴다.
 * (홈·대국 준비·결과·공유 카드가 3D 캐릭터와 같은 얼굴을 갖도록)
 * 한 프레임에 한 장씩만 그려 메인 스레드를 오래 붙잡지 않는다.
 */
import * as THREE from 'three';
import type { CharacterId } from '../characters/roster';
import type { Expression } from '../characters/draw2d';
import { createMats, type Mats } from './materials';
import { Guinea } from './guinea';

let renderer: THREE.WebGLRenderer | null = null;
let mats: Mats | null = null;
let scene: THREE.Scene | null = null;
let broken = false;
const rigs = new Map<CharacterId, Guinea>();
const urls = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 80);

function setup(): boolean {
  if (renderer) return true;
  if (broken) return false;
  try {
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      broken = true;
      renderer = null;
    });
    // 초상화는 자르지 않는다 (아주 아래쪽 평면)
    mats = createMats(new THREE.Plane(new THREE.Vector3(0, 1, 0), 100));
    scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.55));
    scene.add(new THREE.HemisphereLight(0xfff8ee, 0x8a7a64, 0.7));
    const key = new THREE.DirectionalLight(0xfff3e2, 1.9);
    key.position.set(-4, 6, 8);
    scene.add(key);
    return true;
  } catch {
    broken = true;
    renderer = null;
    return false;
  }
}

/** 정사각형 초상화를 그린 WebGL 캔버스 (바로 drawImage 하거나 URL로 바꿔 쓴다) */
function draw(id: CharacterId, ex: Expression, size: number): HTMLCanvasElement | null {
  if (!setup() || !renderer || !scene || !mats) return null;
  let rig = rigs.get(id);
  if (!rig) {
    rig = new Guinea(id, mats);
    rigs.set(id, rig);
  }
  rigs.forEach((r) => scene?.remove(r.root));
  scene.add(rig.root);
  rig.pose(ex);
  // 머리 꼭대기부터 앞발 조금 아래까지 (가슴 위 흉상)
  const top = rig.headTop + 0.14;
  const bottom = -0.42;
  const h = top - bottom;
  const cy = (top + bottom) / 2;
  const d = h / 2 / Math.tan(THREE.MathUtils.degToRad(10));
  camera.position.set(d * 0.15, cy + d * 0.05, d);
  camera.lookAt(0, cy, 0);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.render(scene, camera);
  return renderer.domElement;
}

function urlNow(id: CharacterId, ex: Expression, size: number): string | null {
  const key = `${id}|${ex}|${size}`;
  const hit = urls.get(key);
  if (hit) return hit;
  const c = draw(id, ex, size);
  if (!c) return null;
  try {
    const u = c.toDataURL('image/png');
    urls.set(key, u);
    return u;
  } catch {
    return null;
  }
}

const queue: (() => void)[] = [];
let pumping = false;
function pump(): void {
  if (pumping) return;
  pumping = true;
  const step = (): void => {
    const job = queue.shift();
    if (!job) {
      pumping = false;
      return;
    }
    job();
    window.setTimeout(step, 16);
  };
  window.setTimeout(step, 0);
}

export const portraitRenderer = {
  /** 이미 만든 초상화 (없으면 null) */
  peek(id: CharacterId, ex: Expression, size: number): string | null {
    return urls.get(`${id}|${ex}|${size}`) ?? null;
  },
  /** 차례를 기다려 초상화를 만든다 */
  request(id: CharacterId, ex: Expression, size: number): Promise<string | null> {
    const key = `${id}|${ex}|${size}`;
    const hit = urls.get(key);
    if (hit) return Promise.resolve(hit);
    const p = pending.get(key);
    if (p) return p;
    const job = new Promise<string | null>((resolve) => {
      queue.push(() => {
        pending.delete(key);
        resolve(urlNow(id, ex, size));
      });
      pump();
    });
    pending.set(key, job);
    return job;
  },
  /** 공유 카드처럼 바로 그려야 할 때 (동기) */
  canvas: draw,
};

export type PortraitRenderer = typeof portraitRenderer;
