/**
 * claude.ai 아티팩트의 Claude 연결 — 공개 사이트에서는 없다 (null).
 */
interface SampleOptions {
  modelTier?: 'quick' | 'default' | 'complex';
  cache?: boolean;
  signal?: AbortSignal;
}
export interface Sample {
  json<T>(input: string, options?: SampleOptions): Promise<T>;
}
interface Host {
  use?: (name: string) => Promise<unknown>;
}

let found: Promise<Sample | null> | null = null;

/** 이 화면에서 Claude를 부를 수 있으면 그 함수, 아니면 null (공개 사이트에서는 바로 null) */
export function claudeSample(): Promise<Sample | null> {
  if (found) return found;
  const host = typeof window === 'undefined' ? undefined : (window as unknown as { claude?: Host }).claude;
  found = host?.use
    ? host.use('sample').then(
        (s) => (s && typeof (s as Partial<Sample>).json === 'function' ? (s as Sample) : null),
        () => null,
      )
    : Promise.resolve(null);
  return found;
}

/** 이 화면에서는 다시 부르면 안 되는 실패 */
export const FATAL: ReadonlySet<string> = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);
/** 사용량이 막힌 실패 — 끄고 사람이 다시 켜게 한다 */
export const LIMITED: ReadonlySet<string> = new Set(['rate_limited', 'session_expired']);
