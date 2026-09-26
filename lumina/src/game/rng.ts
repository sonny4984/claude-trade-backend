/**
 * 결정적 난수 (mulberry32). 상태는 숫자 하나라 저장·복구·재현이 쉽다.
 * 같은 시드 → 같은 셔플 → 같은 게임. 온라인 확장 시 서버가 같은 시드로 검증할 수 있다.
 */
export interface Rng {
  next(): number; // [0, 1)
  int(n: number): number; // [0, n)
  readonly state: () => number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n: number) => Math.floor(next() * n),
    state: () => s,
  };
}

/** Fisher–Yates. 원본은 건드리지 않는다. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}

export function randomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}
