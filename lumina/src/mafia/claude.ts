/**
 * claude.ai 아티팩트 안에서만: AI 친구들의 대사를 Claude가 대화 흐름에 맞게 다듬는다.
 * 누구를 의심·변호하고 무슨 역할을 주장할지는 게임 두뇌가 정하고, Claude에게는 살아 있는 친구들의
 * 진짜 역할을 보내지 않는다 (공개된 사실 + 초안 문장만). 보는 사람의 Claude 사용량을 쓰므로
 * 사람이 버튼을 누른 뒤에만 부르고, 실패하면 초안을 그대로 쓴다. 다른 곳(공개 사이트)에서는 꺼져 있다.
 */
import type { Lang } from '../i18n';
import { PERSONA, type Game, type Said } from './engine';
import { nameOf, roleName } from './talk';

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

const STYLE = {
  ko: { polite: '차분한 존댓말', casual: '활발한 반말', cute: '귀여운 존댓말 (가끔 "뀨")', cool: '짧고 시크한 반말' },
  en: { polite: 'calm and polite', casual: 'energetic and casual', cute: 'cute and sweet', cool: 'short and cool' },
} as const;

export interface HistoryLine {
  name: string;
  text: string;
}

export function buildPrompt(g: Game, said: readonly Said[], drafts: readonly string[], history: readonly HistoryLine[], lang: Lang): string {
  const ko = lang === 'ko';
  const nm = (i: number): string => nameOf(g, i, lang);
  const alive = g.players
    .filter((p) => p.alive)
    .map((p) => nm(p.id) + (p.human ? (ko ? '(사람 플레이어)' : ' (human player)') : ''))
    .join(', ');
  const facts =
    g.deaths
      .map((d) =>
        ko
          ? `${d.day}일째 ${d.cause === 'night' ? '밤에 쓰러짐' : '투표로 쫓겨남'}: ${nm(d.who)} — ${roleName(d.role, lang)}`
          : `Day ${d.day} ${d.cause === 'night' ? 'killed at night' : 'voted out'}: ${nm(d.who)} — ${roleName(d.role, lang)}`,
      )
      .join('\n') || (ko ? '아직 없음' : 'none yet');
  const claims = g.claims.filter((c) => c.role !== 'citizen').map((c) => `${nm(c.by)} → ${roleName(c.role, lang)}`);
  const talk = history
    .slice(-14)
    .map((h) => `${h.name}: ${h.text}`)
    .join('\n');
  const items = said.map((s, id) => JSON.stringify({ id, name: nm(s.by), style: STYLE[lang][PERSONA[g.players[s.by]?.character ?? 'hwigi'].style], draft: drafts[id] ?? '' }));
  const lines = ko
    ? [
        '너는 마피아 게임에 나오는 귀여운 기니피그 친구들의 대사를 다듬는 작가야.',
        '[초안]마다 그 캐릭터가 할 말을 자연스러운 구어체로 다시 써. 지켜야 할 것:',
        '- 초안의 뜻(누구를 의심하는지, 누구를 믿는지, 무슨 역할이라고 주장하는지, 조사 결과)은 바꾸거나 빼지 마.',
        '- 초안에 없는 역할·조사 결과·사실을 지어내지 마. 살아 있는 친구의 진짜 역할은 아무도 몰라.',
        '- 한 줄에 1~2문장, 60자 이내. 이모지, 따옴표, 괄호 설명 없이 대사만.',
        '- 바로 앞 대화(특히 사람 플레이어의 말)에 대꾸하듯 이어지게 써도 좋아. 같은 표현을 되풀이하지 마.',
        '',
        `[상황] ${g.day}일째 낮. 살아 있는 친구: ${alive}`,
        `[밝혀진 사실]\n${facts}`,
        claims.length ? `[역할 주장] ${claims.join(', ')}` : '',
        talk ? `[최근 대화]\n${talk}` : '',
        `[초안]\n${items.join('\n')}`,
        '',
        '답은 JSON 하나만: {"lines":[{"id":0,"text":"..."}]} — 초안의 id마다 한 줄씩.',
      ]
    : [
        'You write lines for cute guinea pig characters in a Mafia (social deduction) game.',
        'Rewrite each [draft] as natural spoken dialogue for that character. Rules:',
        '- Keep the meaning exactly: who they suspect, who they trust, what role they claim, any investigation result.',
        '- Never invent roles, results or facts that are not in the draft. Nobody knows the living players’ true roles.',
        '- One or two sentences, under 120 characters. No emoji, quotes or stage directions.',
        '- You may respond to the latest conversation (especially the human player). Do not repeat phrases.',
        '',
        `[Situation] Day ${g.day}. Alive: ${alive}`,
        `[Revealed]\n${facts}`,
        claims.length ? `[Role claims] ${claims.join(', ')}` : '',
        talk ? `[Recent talk]\n${talk}` : '',
        `[Drafts]\n${items.join('\n')}`,
        '',
        'Reply with only JSON: {"lines":[{"id":0,"text":"..."}]} — one line per draft id.',
      ];
  return lines.filter(Boolean).join('\n');
}

/** Claude가 다듬은 대사 (빠진 줄은 초안 그대로) */
export async function polish(sample: Sample, g: Game, said: readonly Said[], drafts: readonly string[], history: readonly HistoryLine[], lang: Lang, signal: AbortSignal): Promise<string[]> {
  const r = await sample.json<{ lines?: { id?: unknown; text?: unknown }[] }>(buildPrompt(g, said, drafts, history, lang), { modelTier: 'quick', cache: false, signal });
  const out = [...drafts];
  for (const l of Array.isArray(r?.lines) ? r.lines : []) {
    const k = Number(l?.id);
    const text = typeof l?.text === 'string' ? l.text.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '') : '';
    if (Number.isInteger(k) && k >= 0 && k < out.length && text) out[k] = text.slice(0, 160);
  }
  return out;
}
