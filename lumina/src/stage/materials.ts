/**
 * 3D 무대의 재질 — 두 톤 셀 셰이딩 + 뒤집은 껍질 외곽선 (스티커 화풍).
 * 모든 GPU 자원은 한 무대(StageScene)가 만들고 한꺼번에 버린다.
 */
import * as THREE from 'three';

export const INK = '#141414';

export interface Mats {
  /** 반지름 1 구 — 몸·머리·발·털 뭉치가 모두 이 하나를 늘여 쓴다 */
  readonly unit: THREE.SphereGeometry;
  /** 얼굴 텍스처를 붙일 앞쪽 구면 조각 */
  readonly faceCap: THREE.SphereGeometry;
  readonly bow: THREE.ExtrudeGeometry;
  /** 테이블 레일 아래를 잘라 내는 평면 (캐릭터가 테이블 뒤에 앉아 보이게) */
  readonly clip: THREE.Plane;
  toon(color: string, clipped: boolean): THREE.MeshToonMaterial;
  /** worldThick = 화면에서 보일 외곽선 두께(월드 단위), scale = 메시 배율 */
  outline(worldThick: number, scale: number, clipped: boolean): THREE.MeshBasicMaterial;
  face(tex: THREE.Texture): THREE.MeshBasicMaterial;
  dispose(): void;
}

function makeGradient(): THREE.DataTexture {
  // 그림자 한 단 + 밝은 면 (0.35 → 은은한 회색, 나머지는 하양으로 포화)
  const data = new Uint8Array([90, 180, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
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

export function createMats(clip: THREE.Plane): Mats {
  const gradient = makeGradient();
  const unit = new THREE.SphereGeometry(1, 40, 28);
  // 앞쪽(+Z) 중심, 가로 약 110°, 세로 약 100°, 적도보다 살짝 아래
  const phiLen = 1.92;
  const thetaLen = 1.76;
  const faceCap = new THREE.SphereGeometry(1.008, 36, 28, Math.PI / 2 - phiLen / 2, phiLen, Math.PI / 2 - thetaLen / 2 + 0.07, thetaLen);
  const bow = makeBow();
  const planes = [clip];
  const toons = new Map<string, THREE.MeshToonMaterial>();
  const outlines = new Map<string, THREE.MeshBasicMaterial>();
  const faces: THREE.MeshBasicMaterial[] = [];

  return {
    unit,
    faceCap,
    bow,
    clip,
    toon(color, clipped) {
      const key = `${color}|${clipped}`;
      let m = toons.get(key);
      if (!m) {
        m = new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: gradient });
        if (clipped) m.clippingPlanes = planes;
        toons.set(key, m);
      }
      return m;
    },
    outline(worldThick, scale, clipped) {
      const thick = Math.round((worldThick / Math.max(0.05, scale)) * 1000) / 1000;
      const key = `${thick}|${clipped}`;
      let m = outlines.get(key);
      if (!m) {
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(INK), side: THREE.BackSide });
        if (clipped) mat.clippingPlanes = planes;
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uThick = { value: thick };
          shader.vertexShader =
            'uniform float uThick;\n' +
            shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed += normalize( normal ) * uThick;');
        };
        mat.customProgramCacheKey = () => 'lumina-outline';
        outlines.set(key, mat);
        m = mat;
      }
      return m;
    },
    face(tex) {
      const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      m.clippingPlanes = planes;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -2;
      faces.push(m);
      return m;
    },
    dispose() {
      gradient.dispose();
      unit.dispose();
      faceCap.dispose();
      bow.dispose();
      toons.forEach((m) => m.dispose());
      outlines.forEach((m) => m.dispose());
      faces.forEach((m) => m.dispose());
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
