/**
 * Claude 하루 사용량 잠금 — 대사를 받을 때마다 글자 수로 토큰을 넉넉히 어림해 쌓고,
 * 하루 한도를 넘으면 그날은 Claude를 부르지 않는다 (다음 날 풀림). 이 기기에서만 센다.
 * claude.ai 아티팩트는 인터넷이 막혀 있어 거기서 Gemini를 부를 수는 없다 — 잠기면 기본 대사로 하고,
 * Gemini는 공개 사이트에서 쓰라고 알려 준다.
 */
import { readJSON, writeJSON } from '../store/storage';

const KEY = 'lumina.claude.usage.v1';
/** 하루 한도: 절약 모드 대답 20번쯤 (한 판에 5~10번이면 2~4판) */
export const DAILY_TOKENS = 20000;
/** 한 번 부를 때마다 더 드는 몫 (앞에 붙는 지시 등, 어림) */
export const CALL_OVERHEAD = 300;

interface Usage {
  day: string;
  used: number;
}

let mem: Usage | null = null;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function load(): Usage {
  const raw = mem ?? readJSON<Usage>(KEY);
  const day = today();
  const used = Number(raw?.used);
  return raw?.day === day && Number.isFinite(used) ? { day, used: Math.max(0, used) } : { day, used: 0 };
}

/** 한글·JSON이 섞인 글: 글자 1개 ≈ 0.9토큰으로 넉넉히 */
export const tokensOf = (chars: number): number => Math.ceil(Math.max(0, chars) * 0.9);

export function claudeUsed(): number {
  return load().used;
}

export function claudeLocked(): boolean {
  return claudeUsed() >= DAILY_TOKENS;
}

/** 쓴 만큼 더한다 — 오늘 쓴 양을 돌려준다 */
export function spendClaude(tokens: number): number {
  const u = load();
  u.used += Math.max(0, Math.round(tokens));
  mem = u;
  writeJSON(KEY, u);
  return u.used;
}

/** 시험용: 기억을 비운다 */
export function resetClaudeUsage(): void {
  mem = null;
  writeJSON(KEY, null);
}
