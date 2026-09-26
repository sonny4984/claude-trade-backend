/**
 * localStorage 안전 래퍼 — 사생활 보호 창·차단된 저장소·아티팩트 미리보기에서도 앱이 깨지지 않게.
 */
export function readJSON<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장이 안 되는 환경이면 조용히 넘어간다 */
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

/** 연속 호출을 묶어 마지막 값만 저장 */
export function throttledWriter(key: string, ms = 250): (value: unknown) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: unknown;
  const flush = (): void => {
    timer = null;
    writeJSON(key, pending);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      if (timer) {
        clearTimeout(timer);
        flush();
      }
    });
  }
  return (value: unknown) => {
    pending = value;
    if (!timer) timer = setTimeout(flush, ms);
  };
}
