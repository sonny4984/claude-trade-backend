/**
 * 3D 무대의 재질 — 실제 기니피그처럼 부드러운 털.
 *  · coat(): 털색 + 품종 무늬(머리·몸 공간의 타원체 조각, 경계는 털처럼 들쭉날쭉) + 털결 + 아구티 깨알 무늬
 *  · 털 껍질(shell): 같은 구를 바깥으로 여러 겹 겹쳐 가닥만 남겨서 가장자리가 보송보송하게
 *  · 가장자리 은은한 빛(털에 빛이 스치는 느낌)
 * 모든 GPU 자원은 한 무대(StageScene)나 초상화 렌더러가 만들고 한꺼번에 버린다 (털옷 재질은 기니피그가 버린다).
 */
import * as THREE from 'three';

/** 털 껍질 겹 수 (초상화는 한 번만 그리니 촘촘하게, 계속 그리는 무대는 가볍게) */
export const SHELLS = { portrait: 12, stage: 7 } as const;

export interface LookPatch {
  readonly c: readonly [number, number, number];
  readonly r: readonly [number, number, number];
  readonly color: string;
  /** 진하기 (볼터치처럼 옅게 칠할 때) */
  readonly a?: number;
}

export interface CoatLook {
  readonly base: string;
  /** 이 부위 공간(머리 또는 몸)의 무늬 — 뒤에 올수록 위에 칠한다 */
  readonly patches: readonly LookPatch[];
  /** 아구티 깨알 무늬 0~1 */
  readonly ticked: number;
  readonly seed: number;
}

export interface CoatOptions {
  /** 이 메시의 단위 구 좌표 → 부위 공간 (머리·몸 무늬가 여러 조각에 이어지게) */
  readonly part: THREE.Matrix4;
  readonly clipped: boolean;
  /** 털 껍질이면 털 길이 (단위 구 기준) */
  readonly fur?: number;
  /** 얼굴 앞쪽에는 털 껍질을 덮지 않는다 (눈·눈썹이 가리지 않게) */
  readonly faceMask?: boolean;
  /** 털 길이를 들쭉날쭉하게 (아비시니안 소용돌이 1, 테디 0.35) */
  readonly messy?: number;
  /** 가장자리 빛 세기 */
  readonly rim?: number;
  readonly roughness?: number;
}

export interface Mats {
  /** 반지름 1 구 — 몸·머리·발·털 뭉치가 모두 이 하나를 늘여 쓴다 */
  readonly unit: THREE.SphereGeometry;
  /** 같은 구를 SHELLS 겹 쌓은 털 껍질 (aShell = 1/SHELLS … 1) */
  readonly furUnit: THREE.BufferGeometry;
  /** 머리 앞쪽 구면 조각 (눈썹·볏 무늬를 그린 텍스처) */
  readonly skullCap: THREE.SphereGeometry;
  /** 주둥이 앞쪽 구면 조각 (코·입) */
  readonly snoutCap: THREE.SphereGeometry;
  readonly bow: THREE.ExtrudeGeometry;
  /** 테이블 레일 아래를 잘라 내는 평면 (캐릭터가 테이블 뒤에 앉아 보이게) */
  readonly clip: THREE.Plane;
  readonly planes: THREE.Plane[];
  /** 반짝이는 눈·코·리본처럼 무늬 없는 재질 (색별로 나눠 쓴다) */
  plain(color: string, o?: { clipped?: boolean; roughness?: number; gloss?: boolean; metal?: number }): THREE.Material;
  /** 얼굴 그림(텍스처)을 붙일 재질 */
  decal(tex: THREE.Texture): THREE.MeshStandardMaterial;
  dispose(): void;
}

/** 값 노이즈 (정점·조각 셰이더 공용) */
const NOISE = /* glsl */ `
float lumHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float lumNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(lumHash(i), lumHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(lumHash(i + vec3(0.0, 1.0, 0.0)), lumHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(lumHash(i + vec3(0.0, 0.0, 1.0)), lumHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(lumHash(i + vec3(0.0, 1.0, 1.0)), lumHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}`;

/** 털옷 재질 (기니피그마다 따로 만들고 기니피그가 버린다) */
export function coatMaterial(look: CoatLook, o: CoatOptions, planes: THREE.Plane[]): THREE.MeshStandardMaterial {
  const shell = o.fur !== undefined;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: o.roughness ?? 0.92, metalness: 0 });
  if (o.clipped) mat.clippingPlanes = planes;
  const N = 8;
  const pc = Array.from({ length: N }, () => new THREE.Vector3());
  const pr = Array.from({ length: N }, () => new THREE.Vector3(1, 1, 1));
  const pcol = Array.from({ length: N }, () => new THREE.Vector4());
  look.patches.slice(0, N).forEach((p, i) => {
    pc[i]?.set(...p.c);
    pr[i]?.set(...p.r);
    const c = new THREE.Color(p.color);
    pcol[i]?.set(c.r, c.g, c.b, p.a ?? 1);
  });
  const uniforms = {
    uPart: { value: o.part.clone() },
    uBase: { value: new THREE.Color(look.base) },
    uN: { value: Math.min(N, look.patches.length) },
    uPC: { value: pc },
    uPR: { value: pr },
    uPCol: { value: pcol },
    uTick: { value: look.ticked },
    uSeed: { value: look.seed },
    uRim: { value: o.rim ?? 0.38 },
    uFur: { value: o.fur ?? 0 },
    uFaceMask: { value: o.faceMask ? 1 : 0 },
    uMessy: { value: o.messy ?? 0 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (shell) {
      shader.vertexShader = '#define LUM_SHELL\n' + shader.vertexShader;
      shader.fragmentShader = '#define LUM_SHELL\n' + shader.fragmentShader;
    }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform mat4 uPart;
uniform float uSeed;
varying vec3 vCoat;
varying vec3 vUnit;
#ifdef LUM_SHELL
attribute float aShell;
uniform float uFur;
uniform float uFaceMask;
uniform float uMessy;
varying float vShell;
${NOISE}
#endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vUnit = position;
vCoat = (uPart * vec4(position, 1.0)).xyz;
#ifdef LUM_SHELL
  float lumMask = mix(1.0, 1.0 - smoothstep(0.05, 0.5, normal.z), uFaceMask);
  // 아비시니안처럼 털이 뭉쳐 삐죽삐죽: 낮은 주파수 노이즈로 털 길이를 바꾼다
  float lumClump = lumNoise(position * 3.3 + uSeed);
  float lumLen = uFur * (1.0 + uMessy * (2.4 * lumClump * lumClump - 0.62));
  transformed += normal * lumLen * aShell * lumMask;
  vShell = aShell;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uBase;
uniform int uN;
uniform vec3 uPC[${N}];
uniform vec3 uPR[${N}];
uniform vec4 uPCol[${N}];
uniform float uTick;
uniform float uSeed;
uniform float uRim;
varying vec3 vCoat;
varying vec3 vUnit;
#ifdef LUM_SHELL
varying float vShell;
#endif
${NOISE}
vec3 lumCoat(vec3 p) {
  vec3 col = uBase;
  float n = lumNoise(p * 4.0 + uSeed) * 0.6 + lumNoise(p * 9.0 - uSeed) * 0.4;
  for (int i = 0; i < ${N}; i++) {
    if (i >= uN) break;
    vec3 d = (p - uPC[i]) / uPR[i];
    float k = length(d) + (n - 0.5) * 0.3;
    float a = (1.0 - smoothstep(0.84, 1.0, k)) * uPCol[i].a;
    col = mix(col, uPCol[i].rgb, a);
  }
  return col;
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
#ifdef LUM_SHELL
  // 털 껍질은 가장자리에서만 보인다: 카메라를 똑바로 보는 곳과 가닥이 없는 곳은 바로 버린다 (무거운 계산 전에)
  if (normalize(vNormal).z > 0.82) discard;
  float strand = lumNoise(vUnit * 58.0 + uSeed);
  if (strand < 0.2 + vShell * 0.7) discard;
#endif
  vec3 coat = lumCoat(vCoat);
  // 털결: 가는 결을 따라 밝기가 조금씩 다르다
  float streak = lumNoise(vUnit * vec3(30.0, 74.0, 30.0) + uSeed);
  coat *= 0.92 + 0.13 * streak;
  // 아구티: 털 끝마다 진하고 옅은 깨알 무늬
  float tick = lumNoise(vUnit * 90.0 + uSeed * 3.0);
  coat *= mix(1.0, mix(0.7, 1.22, step(0.5, tick)), uTick);
#ifdef LUM_SHELL
  coat *= mix(0.84, 1.07, vShell);
#endif
  diffuseColor.rgb = coat;
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  float lumNdv = saturate(dot(normal, normalize(vViewPosition)));
  outgoingLight += pow(1.0 - lumNdv, 2.4) * uRim * diffuseColor.rgb;
}
#include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => (shell ? 'lumina-coat-shell' : 'lumina-coat');
  return mat;
}

function makeBow(): THREE.ExtrudeGeometry {
  const wing = (dir: 1 | -1): THREE.Shape => {
    const s = new THREE.Shape();
    s.moveTo(dir * 0.03, 0);
    s.lineTo(dir * 0.2, 0.115);
    s.quadraticCurveTo(dir * 0.265, 0, dir * 0.2, -0.115);
    s.lineTo(dir * 0.03, 0);
    return s;
  };
  const knot = new THREE.Shape();
  knot.absellipse(0, 0, 0.055, 0.06, 0, Math.PI * 2, false, 0);
  const geo = new THREE.ExtrudeGeometry([wing(-1), wing(1), knot], {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.014,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geo.translate(0, 0, -0.035);
  return geo;
}

/** 단위 구를 n겹 쌓은 털 껍질 — 겹마다 aShell(바깥일수록 1에 가깝게) */
function makeFur(base: THREE.SphereGeometry, n: number): THREE.BufferGeometry {
  const pos = base.getAttribute('position');
  const nor = base.getAttribute('normal');
  const idx = base.getIndex();
  const vCount = pos.count;
  const iCount = idx ? idx.count : 0;
  const P = new Float32Array(vCount * n * 3);
  const Nn = new Float32Array(vCount * n * 3);
  const S = new Float32Array(vCount * n);
  const I = new Uint32Array(iCount * n);
  for (let k = 0; k < n; k++) {
    P.set(pos.array as Float32Array, k * vCount * 3);
    Nn.set(nor.array as Float32Array, k * vCount * 3);
    S.fill((k + 1) / n, k * vCount, (k + 1) * vCount);
    if (idx) for (let j = 0; j < iCount; j++) I[k * iCount + j] = (idx.array[j] as number) + k * vCount;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
  g.setAttribute('aShell', new THREE.BufferAttribute(S, 1));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.8);
  return g;
}

/** 무대·초상화 공통 조명: 따뜻한 위쪽 빛 + 반대쪽 채움 빛 + 뒤에서 털 가장자리를 비추는 빛 */
export function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0xfff8f0, 1.0));
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0xb49c80, 0.85));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.1);
  key.position.set(-3.5, 6, 7);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe4ecff, 0.75);
  fill.position.set(5, 1.5, 5);
  scene.add(fill);
  const back = new THREE.DirectionalLight(0xffffff, 1.3);
  back.position.set(0, 4, -7);
  scene.add(back);
}

export function createMats(clip: THREE.Plane, shells: number = SHELLS.stage): Mats {
  const unit = new THREE.SphereGeometry(1, 48, 36);
  const furUnit = makeFur(new THREE.SphereGeometry(1, 40, 30), shells);
  // 머리 앞쪽: 가로 약 115°, 위로 깊게 (이마 위 볏까지)
  const skullCap = new THREE.SphereGeometry(1.006, 40, 32, Math.PI / 2 - 1.0, 2.0, 0.3, 1.75);
  // 주둥이 앞쪽: 코와 입
  const snoutCap = new THREE.SphereGeometry(1.012, 32, 28, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.9, 1.75);
  const bow = makeBow();
  const planes = [clip];
  const plains = new Map<string, THREE.Material>();
  const decals: THREE.Material[] = [];

  return {
    unit,
    furUnit,
    skullCap,
    snoutCap,
    bow,
    clip,
    planes,
    plain(color, o = {}) {
      const key = `${color}|${o.clipped ?? true}|${o.roughness ?? 0.6}|${o.gloss ?? false}|${o.metal ?? 0}`;
      let m = plains.get(key);
      if (!m) {
        const mat = o.gloss
          ? new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: o.roughness ?? 0.1, clearcoat: 1, clearcoatRoughness: 0.06 })
          : new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: o.roughness ?? 0.6, metalness: o.metal ?? 0 });
        if (o.clipped ?? true) mat.clippingPlanes = planes;
        plains.set(key, mat);
        m = mat;
      }
      return m;
    },
    decal(tex) {
      const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.7 });
      m.clippingPlanes = planes;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -2;
      decals.push(m);
      return m;
    },
    dispose() {
      unit.dispose();
      furUnit.dispose();
      skullCap.dispose();
      snoutCap.dispose();
      bow.dispose();
      plains.forEach((m) => m.dispose());
      decals.forEach((m) => m.dispose());
    },
  };
}

/** 현재 차례 캐릭터 뒤의 따뜻한 빛 */
export function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.3)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
