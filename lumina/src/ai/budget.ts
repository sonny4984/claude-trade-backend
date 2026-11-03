/**
 * Claude 하루 사용량 잠금 — 부를 때마다 글자 수로 토큰을 넉넉히 어림해 쌓고,
 * 하루 한도를 넘으면 그날은 Claude를 부르지 않는다 (다음 날 풀림). 이 기기에서만 센다.
 * claude.ai 아티팩트는 인터넷이 막혀 있어 거기서 Gemini를 부를 수는 없다 — Gemini는 공개 사이트에서.
 */
import { readJSON, writeJSON } from '../store/storage';

/** 바다거북 스프 하루 한도: 질문 120개 남짓 */
export const SOUP_DAILY_TOKENS = 100000;

/** 따로 세는 사용량 묶음 (지금은 스프 하나) */
export type Pool = 'soup';
const POOLS: Record<Pool, { readonly key: string; readonly max: number }> = {
  soup: { key: 'lumina.claude.soup.v1', max: SOUP_DAILY_TOKENS },
};
export const dailyMax = (pool: Pool = 'soup'): number => POOLS[pool].max;
/** 한 번 부를 때마다 더 드는 몫 (앞에 붙는 지시 등, 어림) */
export const CALL_OVERHEAD = 300;

interface Usage {
  day: string;
  used: number;
}

const mem = new Map<Pool, Usage>();

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function load(pool: Pool): Usage {
  const raw = mem.get(pool) ?? readJSON<Usage>(POOLS[pool].key);
  const day = today();
  const used = Number(raw?.used);
  return raw?.day === day && Number.isFinite(used) ? { day, used: Math.max(0, used) } : { day, used: 0 };
}

/** 한글·JSON이 섞인 글: 글자 1개 ≈ 0.9토큰으로 넉넉히 */
export const tokensOf = (chars: number): number => Math.ceil(Math.max(0, chars) * 0.9);

export function claudeUsed(pool: Pool = 'soup'): number {
  return load(pool).used;
}

export function claudeLocked(pool: Pool = 'soup'): boolean {
  return claudeUsed(pool) >= POOLS[pool].max;
}

/** 쓴 만큼 더한다 — 오늘 쓴 양을 돌려준다 */
export function spendClaude(tokens: number, pool: Pool = 'soup'): number {
  const u = load(pool);
  u.used += Math.max(0, Math.round(tokens));
  mem.set(pool, u);
  writeJSON(POOLS[pool].key, u);
  return u.used;
}

/** 시험용: 기억을 비운다 */
export function resetClaudeUsage(pool: Pool = 'soup'): void {
  mem.delete(pool);
  writeJSON(POOLS[pool].key, null);
}
