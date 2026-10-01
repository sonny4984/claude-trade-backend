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
  /** 고른 모델 (예: gemini-3.8-flash) — 연결할 때 정한다 */
  model: string | null;
}

export function loadGemini(): GeminiSetup | null {
  const raw = readJSON<Partial<GeminiSetup>>(STORE_KEY);
  const key = typeof raw?.key === 'string' ? raw.key.trim() : '';
  return key ? { key, model: typeof raw?.model === 'string' ? raw.model : null } : null;
}

export function saveGemini(g: GeminiSetup | null): void {
  if (g) writeJSON(STORE_KEY, g);
  else removeKey(STORE_KEY);
}

/** bad-key: 키가 틀림 · rate: 무료 사용량을 잠깐 넘김 · blocked: 안전 필터 · net: 그 밖 (연결·서버) */
export type GeminiCode = 'bad-key' | 'rate' | 'blocked' | 'net';
export class GeminiFail extends Error {
  constructor(readonly code: GeminiCode) {
    super(`gemini: ${code}`);
  }
}

function classify(status: number, body: string): GeminiCode {
  if (status === 429) return 'rate';
  if (status === 401 || status === 403 || (status === 400 && /api[ _]?key/i.test(body))) return 'bad-key';
  return 'net';
}

const version = (name: string): number => parseFloat(name.split('-')[1] ?? '0') || 0;

/** 쓸 수 있는 모델 중 가장 새 정식 Flash (미리보기·이미지·음성 전용은 빼고, 같은 판이면 Lite보다 일반) */
export function chooseModel(names: readonly string[]): string | null {
  const plain = names.map((n) => n.replace(/^models\//, ''));
  const stable = plain.filter((n) => /^gemini-[\d.]+-flash(-lite)?$/.test(n));
  const pool = stable.length ? stable : plain.filter((n) => /flash/.test(n) && !/(preview|exp|image|tts|audio|live|embed|thinking)/.test(n));
  return [...pool].sort((a, b) => version(b) - version(a) || Number(a.includes('lite')) - Number(b.includes('lite')))[0] ?? null;
}

/** 키를 확인하고 쓸 모델을 고른다 */
export async function connectGemini(key: string, signal?: AbortSignal): Promise<string> {
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
  const model = chooseModel(names);
  if (!model) throw new GeminiFail('net');
  return model;
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

/** 프롬프트를 보내고 JSON 답을 받는다 */
export async function geminiJson(setup: GeminiSetup, prompt: string, signal: AbortSignal): Promise<unknown> {
  const model = setup.model ?? (await connectGemini(setup.key, signal));
  const call = async (think: boolean): Promise<Response> =>
    fetch(`${API}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': setup.key },
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
