/**
 * AI 진행자 — 전말을 아는 쪽에서 질문에 예/아니요로 답하고, 정답을 채점한다.
 * 마피아의 연결(claude.ai 아티팩트의 Claude, 공개 사이트의 Gemini 키)을 같이 쓰고, Claude 하루 한도도 같이 센다.
 * 프롬프트는 짧게: 문제 + 전말 + 핵심 + 최근 질문 몇 개 + 이번 질문.
 */
import type { SoupPuzzle } from './puzzles';
import { ANSWERS, VERDICTS, type SoupAnswer, type SoupVerdict } from './engine';
import { CALL_OVERHEAD, claudeLocked, spendClaude, tokensOf } from '../mafia/budget';
import { FATAL, LIMITED, claudeSample } from '../mafia/claude';
import { GeminiFail, geminiJson, loadGemini } from '../mafia/gemini';

export type HostWho = 'claude' | 'gemini';
export type HostFail = 'none' | 'locked' | 'claudeOff' | 'claudeLimit' | 'geminiKey' | 'geminiLimit' | 'geminiBusy' | 'blocked' | 'net';

export class HostError extends Error {
  constructor(readonly code: HostFail) {
    super(`soup host: ${code}`);
  }
}

/** 이 화면에서 쓸 수 있는 진행자 (Claude 먼저, 안 되면 Gemini) */
export async function hostAvailable(): Promise<HostWho | null> {
  if (!claudeLocked('soup') && (await claudeSample())) return 'claude';
  if (loadGemini()?.model) return 'gemini';
  return null;
}

/** 한 번 막힌 Claude는 이 화면에서 다시 부르지 않는다 */
let claudeDead = false;

async function callJson(prompt: string, signal: AbortSignal): Promise<{ out: unknown; who: HostWho }> {
  const sample = !claudeDead && !claudeLocked('soup') ? await claudeSample() : null;
  if (sample) {
    try {
      spendClaude(CALL_OVERHEAD + tokensOf(prompt.length), 'soup');
      const out = await sample.json<unknown>(prompt, { modelTier: 'quick', cache: false, signal });
      spendClaude(tokensOf(JSON.stringify(out ?? '').length), 'soup');
      return { out, who: 'claude' };
    } catch (e) {
      if ((e as { name?: string } | null)?.name === 'AbortError') throw e;
      const code = String((e as { code?: unknown } | null)?.code ?? '');
      if (FATAL.has(code)) claudeDead = true;
      // Gemini가 있으면 그쪽으로 넘어간다
      if (!loadGemini()?.model) throw new HostError(FATAL.has(code) ? 'claudeOff' : LIMITED.has(code) ? 'claudeLimit' : 'net');
    }
  }
  const gem = loadGemini();
  if (!gem?.model) throw new HostError(claudeLocked('soup') ? 'locked' : 'none');
  // 죽음이 나오는 고전 문제도 답하도록 안전 필터를 끄고, 잠깐 끊긴 거면 한 번 더 묻는다
  for (let attempt = 0; ; attempt++) {
    try {
      return { out: await geminiJson(gem, prompt, signal, { relaxed: true }), who: 'gemini' };
    } catch (e) {
      if (!(e instanceof GeminiFail)) throw e;
      if (e.code === 'net' && attempt === 0) continue;
      throw new HostError(e.code === 'bad-key' ? 'geminiKey' : e.code === 'rate' ? 'geminiLimit' : e.code === 'busy' ? 'geminiBusy' : e.code === 'blocked' ? 'blocked' : 'net');
    }
  }
}

/** 질문에 답하게 하는 글 (테스트에서 내용을 확인한다) — 짧게: 지난 질문은 보내지 않는다 (답은 전말만 보고 정하면 된다) */
export function askPrompt(p: SoupPuzzle, question: string): string {
  return [
    '바다거북 스프(지어낸 옛 추리 퍼즐) 진행자. 전말은 절대 말하지 마.',
    `[문제] ${p.story}`,
    `[전말] ${p.answer}`,
    `[핵심] ${p.keys.map((k, i) => `${i + 1}) ${k}`).join(' ')}`,
    `[질문] ${question}`,
    'a: 전말에 비추어 대체로 맞으면 yes, 틀렸거나 전말에 없으면 no. 예/아니요로 답할 수 없는 질문이면 no + note "예/아니요로 물어봐 주세요".',
    'note: 보통 빈 글, 핵심을 짚었을 때만 12자 이내 칭찬. k: yes이고 핵심을 짚었으면 그 번호들, 아니면 [].',
    'JSON만: {"a":"yes|no","note":"","k":[]}',
  ].join('\n');
}

/** 정답을 채점하게 하는 글 */
export function guessPrompt(p: SoupPuzzle, guess: string): string {
  return [
    '바다거북 스프(지어낸 옛 추리 퍼즐) 진행자. 참가자의 정답을 채점해.',
    `[문제] ${p.story}`,
    `[전말] ${p.answer}`,
    `[핵심] ${p.keys.map((k, i) => `${i + 1}) ${k}`).join(' ')}`,
    `[참가자의 정답] ${guess}`,
    '핵심이 모두(뜻이 같으면 인정) 있으면 correct, 절반 이상 close, 아니면 wrong.',
    'note: correct면 빈 글, 아니면 무엇이 빠졌는지만 25자 이내 (전말 내용은 쓰지 마). k: 정답에 든 핵심 번호들.',
    'JSON만: {"v":"correct|close|wrong","note":"","k":[]}',
  ].join('\n');
}

const NOTE_MAX = 60;
/** 핵심 번호 읽기 (1부터 → 0부터), 이상하면 빈 목록 */
export function readKeys(x: unknown, count: number): number[] {
  if (!Array.isArray(x)) return [];
  return [...new Set(x.map((v) => Number(v) - 1).filter((v) => Number.isInteger(v) && v >= 0 && v < count))];
}

const clean = (x: unknown): string => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX) : '');

/** 답을 고른다 — 예로 읽을 수 없으면 아니요로 */
export function readAnswer(out: unknown): { a: SoupAnswer; note: string } {
  const o = (out ?? {}) as { a?: unknown; answer?: unknown; note?: unknown };
  const raw = String(o.a ?? o.answer ?? '').toLowerCase().trim();
  const a = (ANSWERS as readonly string[]).includes(raw) ? (raw as SoupAnswer) : raw.startsWith('y') || raw === '예' ? 'yes' : 'no';
  return { a, note: clean(o.note) };
}

export function readVerdict(out: unknown): { v: SoupVerdict; note: string } {
  const o = (out ?? {}) as { v?: unknown; verdict?: unknown; note?: unknown };
  const raw = String(o.v ?? o.verdict ?? '').toLowerCase().trim();
  const v = (VERDICTS as readonly string[]).includes(raw) ? (raw as SoupVerdict) : 'wrong';
  return { v, note: v === 'correct' ? '' : clean(o.note) };
}

export async function aiAnswer(p: SoupPuzzle, question: string, signal: AbortSignal): Promise<{ a: SoupAnswer; note: string; keys: number[]; who: HostWho }> {
  const { out, who } = await callJson(askPrompt(p, question), signal);
  return { ...readAnswer(out), keys: readKeys((out as { k?: unknown } | null)?.k, p.keys.length), who };
}

export async function aiJudge(p: SoupPuzzle, guess: string, signal: AbortSignal): Promise<{ v: SoupVerdict; note: string; keys: number[]; who: HostWho }> {
  const { out, who } = await callJson(guessPrompt(p, guess), signal);
  return { ...readVerdict(out), keys: readKeys((out as { k?: unknown } | null)?.k, p.keys.length), who };
}
