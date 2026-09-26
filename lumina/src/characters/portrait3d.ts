/**
 * 3D 초상화로 가는 다리. three.js 청크는 필요할 때 늦게 불러오고,
 * 그전까지(또는 WebGL이 없으면) 2D 초상화를 쓴다.
 */
import { useEffect, useState } from 'react';
import { useSettings } from '../store/settings';
import { portraitURL, type Expression } from './draw2d';
import type { CharacterId } from './roster';
import type { PortraitRenderer } from '../stage/portraits';

let impl: PortraitRenderer | null = null;
let loading: Promise<PortraitRenderer | null> | null = null;
let glChecked: boolean | null = null;

export function webglOK(): boolean {
  if (glChecked !== null) return glChecked;
  try {
    const c = document.createElement('canvas');
    glChecked = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    glChecked = false;
  }
  return glChecked;
}

/** 이미 불러온 3D 초상화 렌더러 (없으면 null) */
export function portrait3d(): PortraitRenderer | null {
  return impl;
}

export function loadPortrait3d(): Promise<PortraitRenderer | null> {
  if (impl) return Promise.resolve(impl);
  if (!webglOK()) return Promise.resolve(null);
  if (!loading) {
    loading = import('../stage/portraits')
      .then((m) => (impl = m.portraitRenderer))
      .catch(() => null);
  }
  return loading;
}

/** 초상화 URL — 3D가 준비되면 3D로 바뀐다 */
export function usePortrait(id: CharacterId, ex: Expression = 'idle', size = 128): string {
  const use3d = useSettings((s) => s.show3d);
  const [url, setUrl] = useState(() => (use3d && impl?.peek(id, ex, size)) || portraitURL(id, ex, size));
  useEffect(() => {
    if (!use3d) {
      setUrl(portraitURL(id, ex, size));
      return;
    }
    const hit = impl?.peek(id, ex, size);
    if (hit) {
      setUrl(hit);
      return;
    }
    let alive = true;
    setUrl(portraitURL(id, ex, size));
    void loadPortrait3d().then((r) =>
      r?.request(id, ex, size).then((u) => {
        if (alive && u) setUrl(u);
      }),
    );
    return () => {
      alive = false;
    };
  }, [id, ex, size, use3d]);
  return url;
}
