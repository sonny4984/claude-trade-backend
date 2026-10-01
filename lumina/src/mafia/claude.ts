/**
 * AI 친구들의 대사 다듬기 — 프롬프트와 답 받기는 Claude·Gemini가 같이 쓰고, 여기에는 claude.ai 아티팩트의 Claude 연결도 있다.
 * 누구를 의심·변호하고 무슨 역할을 주장할지는 게임 두뇌가 정하고, 대사를 쓰는 쪽에는 살아 있는 친구들의
 * 진짜 역할을 보내지 않는다 (공개된 사실 + 초안 문장 + 최근 대화만). 사람이 무언가 한 뒤에만 부르고, 실패하면 초안을 그대로 쓴다.
 */
import type { Lang } from '../i18n';
import { PERSONA, accuseWhy, opinion, suspicion, type Game, type Said, type Why } from './engine';
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
  ko: { polite: '상냥한 존댓말 ("~용")', casual: '활발한 반말 ("꾸잉!")', cute: '애교 많은 존댓말 ("뀨잉~", "~용")', cool: '짧고 시크한 반말 ("…뀨.")' },
  en: { polite: 'sweet and polite', casual: 'bouncy and casual', cute: 'extra cute', cool: 'short and cool' },
} as const;

export interface HistoryLine {
  name: string;
  text: string;
}

/** 대사를 써 주는 쪽 (Claude 또는 Gemini): 프롬프트를 받아 JSON 하나를 돌려준다 */
export type JsonWriter = (prompt: string, signal: AbortSignal) => Promise<unknown>;

export const claudeWriter =
  (sample: Sample): JsonWriter =>
  (prompt, signal) =>
    sample.json(prompt, { modelTier: 'quick', cache: false, signal });

const REASON = {
  ko: {
    votedTown: '{x}에게 투표했는데 {x}는 {xr}였음',
    accusedTown: '{x}를 몰았는데 {x}는 {xr}였음',
    defendedMafia: '마피아였던 {x}를 감쌌음',
    fakeClaim: '역할을 속인 것 같음',
    claimClash: '{x}와 역할 주장이 겹침',
    motive: '죽은 {x}가 의심하던 친구',
    quiet: '말이 너무 없음',
    gut: '그냥 느낌이 이상함',
    checked: '느낌이 이상함',
    claimed: '느낌이 이상함',
    votedMafia: '느낌이 이상함',
  },
  en: {
    votedTown: 'voted for {x}, who was the {xr}',
    accusedTown: 'pushed {x}, who was the {xr}',
    defendedMafia: 'defended {x}, who was Mafia',
    fakeClaim: 'seems to have faked a role',
    claimClash: 'role claim clashes with {x}',
    motive: 'the killed {x} suspected them',
    quiet: 'too quiet',
    gut: 'just a hunch',
    checked: 'a hunch',
    claimed: 'a hunch',
    votedMafia: 'a hunch',
  },
} as const satisfies Record<Lang, Record<Why, string>>;

/**
 * 그 친구가 지금 의심하는 둘과 (모두가 아는) 이유 — 대사를 똑똑하게 쓰라고 넘긴다.
 * 순위는 그 친구의 생각이지만, 이유는 공개된 사실로만 적어서 비밀(역할·조사 결과)이 새지 않는다.
 * 마피아는 동료를 빼고 시민 눈에 수상한 순서로.
 */
export function notesFor(g: Game, i: number, lang: Lang): string {
  const me = g.players[i];
  if (!me) return '';
  const rank = me.role === 'mafia' ? suspicion(g, null) : opinion(g, i);
  const top = g.players
    .filter((p) => p.alive && p.id !== i && !(me.role === 'mafia' && p.role === 'mafia'))
    .sort((a, b) => (rank[b.id] ?? 0) - (rank[a.id] ?? 0))
    .slice(0, 2);
  return top
    .map((p) => {
      const r = accuseWhy(g, null, p.id);
      const xr = r.x === undefined ? undefined : g.players[r.x]?.role;
      const why = REASON[lang][r.why].replace(/\{x\}/g, r.x === undefined ? '' : nameOf(g, r.x, lang)).replace(/\{xr\}/g, xr ? roleName(xr, lang) : '');
      return `${nameOf(g, p.id, lang)}(${why})`;
    })
    .join(', ');
}

/**
 * 대사를 써 달라는 글. brief(절약 모드)면 규칙을 줄이고 최근 대화도 6줄만 —
 * 한 번에 드는 양을 반쯤으로 줄인다 (부르는 횟수는 store가 줄인다).
 */
export function buildPrompt(g: Game, said: readonly Said[], drafts: readonly string[], history: readonly HistoryLine[], lang: Lang, latest?: HistoryLine, brief = false): string {
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
    .filter((h, k, all) => !(brief && latest && k === all.length - 1 && h.name === latest.name && h.text === latest.text))
    .slice(brief ? -6 : -16)
    .map((h) => `${h.name}: ${h.text}`)
    .join('\n');
  const items = said.map((s, id) => {
    const free = s.act.k === 'chat';
    return JSON.stringify({
      id,
      name: nm(s.by),
      style: STYLE[lang][PERSONA[g.players[s.by]?.character ?? 'hwigi'].style],
      kind: free ? (ko ? '자유 대화' : 'free chat') : ko ? '뜻' : 'meaning',
      ...(s.act.k === 'chat' ? { to: nm(s.act.to) } : {}),
      ...(s.act.k === 'plea' || s.act.k === 'defend' ? { mood: ko ? '억울함 (진짜 죽을 것처럼)' : 'desperate' } : {}),
      notes: notesFor(g, s.by, lang),
      draft: drafts[id] ?? '',
    });
  });
  const rules = brief
    ? ko
      ? [
          '귀여운 기니피그 마피아 게임 대사를 써. 말끝 "~용", 가끔 "꾸잉"·"뀨". 무섭거나 거친 말 금지.',
          '- 뜻: 초안의 뜻(의심·믿음·역할 주장·조사 결과)은 그대로, 자연스럽게. 자유 대화: to에게 그 캐릭터답게 대답 (일상 얘기도 좋아).',
          '- 없는 역할·사실 지어내지 마. 1~2문장, 70자 이내, 이모지 없이 대사만.',
          '- 억울함이면 과장된 맹세로 웃기게 (예: "마피아면 건초 3달치 바칠게용!"). notes의 근거를 들어 똑똑하게.',
        ]
      : [
          'Write lines for cute guinea pigs in a Mafia game. Cute, sometimes "squeak"; never scary or rude.',
          '- meaning: keep the draft’s meaning (suspect, trust, claim, result), make it natural. free chat: answer "to" in character (small talk is fine).',
          '- Never invent roles or facts. 1–2 sentences, under 120 characters, no emoji.',
          '- desperate: swear funny oaths (e.g. "If I’m Mafia, take my hay!"). Use notes as evidence.',
        ]
    : null;
  const lines = rules
    ? [
        ...rules,
        ko ? `[상황] ${g.day}일째. 살아 있음: ${alive}` : `[Situation] Day ${g.day}. Alive: ${alive}`,
        g.deaths.length ? (ko ? `[밝혀진 사실]\n${facts}` : `[Revealed]\n${facts}`) : '',
        claims.length ? (ko ? `[역할 주장] ${claims.join(', ')}` : `[Role claims] ${claims.join(', ')}`) : '',
        talk ? (ko ? `[최근 대화]\n${talk}` : `[Recent talk]\n${talk}`) : '',
        latest ? (ko ? `[방금 사람이 한 말] ${latest.name}: ${latest.text}` : `[Human just said] ${latest.name}: ${latest.text}`) : '',
        ko ? `[할 말]\n${items.join('\n')}` : `[To say]\n${items.join('\n')}`,
        ko ? 'JSON만: {"lines":[{"id":0,"text":"..."}]}' : 'Only JSON: {"lines":[{"id":0,"text":"..."}]}',
      ]
    : ko
    ? [
        '너는 마피아 게임에 나오는 귀여운 기니피그 친구들의 대사를 쓰는 작가야.',
        '모두 기니피그라서 말투가 귀여워. 존댓말 친구는 "~용", "~해용", "~이에용" 같은 말끝을 자주 쓰고, 다들 "꾸잉", "뀨", "꾸르르" 같은 기니피그 소리를 가끔 섞어 (예: "꾸잉, 전 의사 맞는데용!"). 무섭거나 거친 말은 쓰지 마.',
        '[할 말]의 친구마다 대사 한 줄을 써. 지켜야 할 것:',
        '- kind가 "뜻"이면 초안의 뜻(누구를 의심하는지, 누구를 믿는지, 무슨 역할이라고 하는지, 조사 결과)을 바꾸거나 빼지 말고 자연스럽게 다시 써.',
        '- kind가 "자유 대화"면 to에게 그 캐릭터답게 자연스럽게 대답해. 게임 얘기가 아니어도 좋아 (먹이, 기분, 취미, 날씨 같은 일상 이야기). 물어보면 대답하고, 가끔 되물어도 돼. 초안은 참고만 해.',
        '- 없는 역할·조사 결과·사실을 지어내지 마. 살아 있는 친구의 진짜 역할은 아무도 몰라 (자기 역할을 밝히라고 하면 시치미를 떼거나 둘러대).',
        '- 한 줄에 1~2문장, 70자 이내. 이모지와 괄호 설명 없이 대사만.',
        '- 바로 앞 대화에 이어지게 쓰고, 같은 표현을 되풀이하지 마.',
        '- 의심받거나 변론대에 서면(mood가 "억울함") 진짜 죽을 것처럼 억울해하고, 과장된 맹세로 웃기게 버텨 (예: "제가 마피아면 제 3달치 건초를 다 바칠게용!", "쳇바퀴를 걸고 맹세해용!"). 건초·당근·쳇바퀴 같은 기니피그다운 농담을 섞어.',
        '- 똑똑하게 말해: notes에 그 친구가 지금 의심하는 친구와 이유(투표 기록, 역할 주장, 누가 누구를 감쌌는지)가 있어. 의심하거나 대답할 때 그런 근거를 들어.',
        '',
        `[상황] ${g.day}일째 낮. 살아 있는 친구: ${alive}`,
        `[밝혀진 사실]\n${facts}`,
        claims.length ? `[역할 주장] ${claims.join(', ')}` : '',
        talk ? `[최근 대화]\n${talk}` : '',
        latest ? `[방금 사람이 한 말] ${latest.name}: ${latest.text}` : '',
        `[할 말]\n${items.join('\n')}`,
        '',
        '답은 JSON 하나만: {"lines":[{"id":0,"text":"..."}]} — [할 말]의 id마다 한 줄씩.',
      ]
    : [
        'You write lines for cute guinea pig characters in a Mafia (social deduction) game.',
        'They are guinea pigs, so they talk cutely and sometimes add guinea pig sounds like "squeak" or "wheek". Never scary or rude.',
        'Write one line for each entry in [To say]. Rules:',
        '- kind "meaning": keep the draft’s meaning exactly (who they suspect or trust, what role they claim, any result), just make it natural.',
        '- kind "free chat": reply naturally to "to" in character. Everyday small talk is fine (food, mood, hobbies, weather). Answer questions; sometimes ask back. The draft is only a hint.',
        '- Never invent roles, results or facts. Nobody knows the living players’ true roles (if asked to reveal a role, dodge playfully).',
        '- One or two sentences, under 120 characters. No emoji or stage directions.',
        '- Follow on from the latest conversation and do not repeat phrases.',
        '- When accused or on the stand (mood "desperate"), act like their life depends on it and swear funny oaths (e.g. "If I’m Mafia, I’ll give up three months of hay!"). Add guinea pig jokes (hay, carrots, the wheel).',
        '- Sound smart: notes lists who that character suspects and why (votes, role claims, who defended whom). Use that evidence when accusing or answering.',
        '',
        `[Situation] Day ${g.day}. Alive: ${alive}`,
        `[Revealed]\n${facts}`,
        claims.length ? `[Role claims] ${claims.join(', ')}` : '',
        talk ? `[Recent talk]\n${talk}` : '',
        latest ? `[Human just said] ${latest.name}: ${latest.text}` : '',
        `[To say]\n${items.join('\n')}`,
        '',
        'Reply with only JSON: {"lines":[{"id":0,"text":"..."}]} — one line per id.',
      ];
  return lines.filter(Boolean).join('\n');
}

/** 대사를 다듬어 받는다 (빠진 줄은 초안 그대로) */
export async function polish(write: JsonWriter, g: Game, said: readonly Said[], drafts: readonly string[], history: readonly HistoryLine[], lang: Lang, signal: AbortSignal, latest?: HistoryLine, brief = false): Promise<string[]> {
  const r = (await write(buildPrompt(g, said, drafts, history, lang, latest, brief), signal)) as { lines?: { id?: unknown; text?: unknown }[] } | null;
  const out = [...drafts];
  for (const l of Array.isArray(r?.lines) ? r.lines : []) {
    const k = Number(l?.id);
    const text = typeof l?.text === 'string' ? l.text.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '') : '';
    if (Number.isInteger(k) && k >= 0 && k < out.length && text) out[k] = text.slice(0, 160);
  }
  return out;
}

/**
 * 이번 차례에 다듬을 대사 (said의 번호).
 * 절약 모드면 사람이 말을 걸었을 때만, 맨 먼저 대답하는 친구 한 명만 (plan이 바로 대답할 친구를 맨 앞에 둔다).
 * 아침 인사·더 듣기·변론은 기본 대사 그대로.
 */
export function polishPick(count: number, human: boolean, saver: boolean): number[] {
  if (!saver) return Array.from({ length: count }, (_, k) => k);
  return human && count > 0 ? [0] : [];
}
