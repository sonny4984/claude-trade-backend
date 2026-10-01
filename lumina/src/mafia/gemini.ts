/**
 * 공개 사이트에서: 사용자가 넣은 Gemini API 키로 AI 친구들의 대사를 쓴다.
 * 키는 이 기기(localStorage)에만 두고 Google로만 보낸다 — 온라인 방에는 올리지 않는다 (방장 기기만 부른다).
 * 모델 이름이 자주 바뀌어서, 키로 쓸 수 있는 모델 목록을 받아 가장 새 Flash를 고른다.
 */
import { readJSON, removeKey, writeJSON } from '../store/storage';

const STORE_KEY = 'lumina.gemini.v1';
const API = 'https://generativelanguage.googleapis.com/v1beta';
/** 키 받는 곳 (Google AI Studio) */
export const GEMINI_KEY_URL = 'https://aistudio.google.com/apikey';

export interface GeminiSetup {
  key: string;
  /** 지금 쓰는 모델 (예: gemini-3.5-flash) — 연결할 때 실제로 답하는 모델로 정한다 */
  model: string | null;
  /** 붐빌 때 넘어갈 후보 (좋은 순서) */
  models?: string[];
}

export function loadGemini(): GeminiSetup | null {
  const raw = readJSON<Partial<GeminiSetup>>(STORE_KEY);
  const key = typeof raw?.key === 'string' ? raw.key.trim() : '';
  const models = Array.isArray(raw?.models) ? raw.models.filter((m): m is string => typeof m === 'string').slice(0, 8) : [];
  return key ? { key, model: typeof raw?.model === 'string' ? raw.model : null, models } : null;
}

export function saveGemini(g: GeminiSetup | null): void {
  if (g) writeJSON(STORE_KEY, g);
  else removeKey(STORE_KEY);
}

/** bad-key: 키가 틀림 · rate: 무료 사용량을 잠깐 넘김 · busy: 모델이 붐빔 · missing: 없는 모델 · blocked: 안전 필터 · net: 그 밖 */
export type GeminiCode = 'bad-key' | 'rate' | 'busy' | 'missing' | 'blocked' | 'net';
export class GeminiFail extends Error {
  constructor(readonly code: GeminiCode) {
    super(`gemini: ${code}`);
  }
}

function classify(status: number, body: string): GeminiCode {
  if (status === 429) return 'rate';
  if (status === 503 || status === 500 || status === 502 || status === 504) return 'busy';
  if (status === 404) return 'missing';
  if (status === 401 || status === 403 || (status === 400 && /api[ _]?key/i.test(body))) return 'bad-key';
  return 'net';
}

const version = (name: string): number => parseFloat(name.split('-')[1] ?? '0') || 0;

/** 쓸 수 있는 정식 Flash를 좋은 순서로 (새 판 먼저, 같은 판이면 Lite보다 일반 — 미리보기·이미지·음성 전용은 뺀다) */
export function rankModels(names: readonly string[]): string[] {
  const plain = names.map((n) => n.replace(/^models\//, ''));
  const stable = plain.filter((n) => /^gemini-[\d.]+-flash(-lite)?$/.test(n));
  const pool = stable.length ? stable : plain.filter((n) => /flash/.test(n) && !/(preview|exp|image|tts|audio|live|embed|thinking)/.test(n));
  return [...new Set(pool)].sort((a, b) => version(b) - version(a) || Number(a.includes('lite')) - Number(b.includes('lite')));
}
export const chooseModel = (names: readonly string[]): string | null => rankModels(names)[0] ?? null;

/** 연결 확인용 아주 짧은 질문 */
const PING = 'Reply with only this JSON: {"ok":true}';

/** 키를 확인하고, 후보 모델에 짧게 물어 실제로 답하는 모델을 고른다 (새 모델은 자주 붐빈다) */
export async function connectGemini(key: string, signal?: AbortSignal): Promise<{ model: string; models: string[] }> {
  let r: Response;
  try {
    r = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key }, signal });
  } catch {
    throw new GeminiFail('net');
  }
  const body = await r.text();
  if (!r.ok) throw new GeminiFail(classify(r.status, body));
  let names: string[] = [];
  try {
    const data = JSON.parse(body) as { models?: { name?: unknown; supportedGenerationMethods?: unknown }[] };
    names = (data.models ?? []).filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent')).map((m) => String(m.name ?? ''));
  } catch {
    throw new GeminiFail('net');
  }
  const models = rankModels(names).slice(0, 8);
  if (!models.length) throw new GeminiFail('missing');
  let last: GeminiFail = new GeminiFail('busy');
  for (const model of models.slice(0, 5)) {
    try {
      await ask(key, model, PING, signal ?? new AbortController().signal);
      return { model, models };
    } catch (e) {
      if (!(e instanceof GeminiFail) || e.code === 'bad-key') throw e;
      last = e;
    }
  }
  throw last;
}

/** 답에서 JSON 하나 꺼내기 (그대로 → 코드 울타리 안 → 첫 { 부터 마지막 } 까지) */
export function parseLoose(text: string): unknown {
  const tries = [text, /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1] ?? '', text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)];
  for (const t of tries) {
    try {
      if (t.trim()) return JSON.parse(t);
    } catch {
      /* 다음 방법 */
    }
  }
  throw new GeminiFail('net');
}

/** 생각 설정을 받지 않는 모델 (한 번 거절당하면 기억) */
const plainModels = new Set<string>();

/** 모델 하나에 묻기 */
async function ask(key: string, model: string, prompt: string, signal: AbortSignal): Promise<unknown> {
  const call = async (think: boolean): Promise<Response> =>
    fetch(`${API}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // 짧은 대사라 오래 생각할 필요가 없다 (빠르게)
        generationConfig: { responseMimeType: 'application/json', temperature: 1, maxOutputTokens: 2048, ...(think ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) },
      }),
      signal,
    });
  let r: Response;
  let body: string;
  try {
    r = await call(!plainModels.has(model));
    body = await r.text();
    if (r.status === 400 && !plainModels.has(model) && /thinking/i.test(body)) {
      plainModels.add(model);
      r = await call(false);
      body = await r.text();
    }
  } catch (e) {
    if ((e as { name?: string } | null)?.name === 'AbortError') throw e;
    throw new GeminiFail('net');
  }
  if (!r.ok) throw new GeminiFail(classify(r.status, body));
  let data: { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]; promptFeedback?: { blockReason?: string } };
  try {
    data = JSON.parse(body) as typeof data;
  } catch {
    throw new GeminiFail('net');
  }
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('');
  if (!text) throw new GeminiFail(data.promptFeedback?.blockReason ? 'blocked' : 'net');
  return parseLoose(text);
}

/** 붐비거나 사용량을 넘긴 모델은 건너뛰고 다음 후보로 (한 번에 셋까지) — 답한 모델을 기억해 다음부터 먼저 쓴다 */
export async function geminiJson(setup: GeminiSetup, prompt: string, signal: AbortSignal): Promise<unknown> {
  const order = [...new Set([setup.model, ...(setup.models ?? [])].filter((m): m is string => !!m))];
  if (!order.length) order.push((await connectGemini(setup.key, signal)).model);
  let last: unknown = new GeminiFail('busy');
  for (const model of order.slice(0, 3)) {
    try {
      const out = await ask(setup.key, model, prompt, signal);
      if (model !== setup.model) saveGemini({ ...setup, model });
      return out;
    } catch (e) {
      last = e;
      if (!(e instanceof GeminiFail) || !(e.code === 'busy' || e.code === 'rate' || e.code === 'missing')) throw e;
    }
  }
  throw last;
}

/** 링크(#gemini=키)로 받은 키 — 주소에서 바로 지우고 돌려준다 (해시는 서버로 가지 않는다) */
export function takeKeyFromUrl(): string | null {
  if (typeof location === 'undefined') return null;
  const m = /(?:^#|&)gemini=([^&]+)/.exec(location.hash);
  if (!m?.[1]) return null;
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    /* 주소를 못 바꾸는 곳 */
  }
  try {
    return decodeURIComponent(m[1]).trim() || null;
  } catch {
    return null;
  }
}
