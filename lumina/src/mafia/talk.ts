/**
 * 마피아 대사 — 엔진이 정한 뜻(Act)을 캐릭터 말투에 맞는 문장으로 바꾼다.
 * Claude를 못 쓸 때는 이 문장을 그대로 쓰고, 쓸 때는 이 문장이 '초안'이 된다.
 * 사람이 친 말에서 누구를 의심하고 누구를 믿는지 읽어 내는 것도 여기서 한다.
 */
import { translate, type Lang } from '../i18n';
import { PERSONA, type Act, type Game, type Player, type Role, type Said } from './engine';

type Vars = Record<string, string>;
interface KoSet {
  /** 존댓말 */
  p: readonly string[];
  /** 반말 */
  c: readonly string[];
}

const PAIRS: Record<string, readonly [string, string]> = {
  가: ['이', '가'],
  는: ['은', '는'],
  를: ['을', '를'],
  랑: ['이랑', '랑'],
  야: ['아', '야'],
  와: ['과', '와'],
  예요: ['이에요', '예요'],
  였: ['이었', '였'],
  야말로: ['이야말로', '야말로'],
  라고: ['이라고', '라고'],
  이야: ['이야', '야'],
};

/** 받침에 맞는 조사 (한글이 아니면 받침 없는 쪽) */
export function josa(word: string, kind: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const jong = code >= 0 && code <= 11171 ? code % 28 : 0;
  if (kind === '로') return jong !== 0 && jong !== 8 ? '으로' : '로';
  const p = PAIRS[kind];
  return p ? (jong ? p[0] : p[1]) : kind;
}

/** "{t|가} 수상해요" → "휘기가 수상해요" */
export function fill(tpl: string, v: Vars): string {
  return tpl.replace(/\{(\w+)(?:\|([^}]+))?\}/g, (_m, k: string, j: string | undefined) => {
    const w = v[k] ?? '';
    return j ? w + josa(w, j) : w;
  });
}

const KO: Record<string, KoSet> = {
  'react.died': {
    p: ['{t|가} 당하다니… 너무 슬퍼요.', '마피아는 왜 {t|를} 노렸을까요? 분명 이유가 있어요.', '{t}… 꼭 범인을 찾아 줄게요.'],
    c: ['{t|가} 당했어… 진짜 화나.', '마피아가 왜 {t|를} 골랐을까? 뭔가 알고 있었던 거야.', '{t}, 복수해 줄게.'],
  },
  'react.saved': {
    p: ['아무도 안 다쳤어요! 의사가 지켜 줬나 봐요.', '휴, 다들 무사하네요. 의사 최고예요.'],
    c: ['다들 살았네! 의사 잘했어.', '휴, 아무도 안 죽었어. 운이 좋았네.'],
  },
  'react.calm': {
    p: ['첫날 밤은 조용했네요. 이제부터 잘 지켜봐요.', '아직 아무 일도 없었어요. 다들 표정 좀 볼까요?'],
    c: ['첫날은 조용했네. 이제부터야.', '아직은 다 멀쩡하네. 누가 수상한지 보자.'],
  },
  'accuse.checked': {
    p: ['제가 조사했어요. {t|는} 마피아예요!', '{t}, 조사 결과 마피아로 나왔어요. 확실해요.'],
    c: ['내가 조사했어. {t|는} 마피아야!', '{t}, 조사해 보니 마피아였어. 빠져나갈 생각 마.'],
  },
  'accuse.fakeClaim': {
    p: ['{t|는} 가짜 {r|예요}. 진짜 {r|는} {x|였}어요!', '{t} 말은 거짓말이에요. 진짜 {r|는} {x|였}잖아요.'],
    c: ['{t} 거짓말이야. 진짜 {r|는} {x|였}잖아!', '{t|는} 가짜 {r|이야}. 진짜는 {x|였}다고.'],
  },
  'accuse.fakeClaimMe': {
    p: ['{t|는} 가짜예요. 진짜 {r|는} 저예요!', '{t}, 왜 거짓말해요? 진짜 {r|는} 저라고요.'],
    c: ['{t} 가짜야. 진짜 {r|는} 나라고!', '{t}, 거짓말하지 마. {r|는} 나야.'],
  },
  'accuse.claimClash': {
    p: ['{r|가} 둘일 수는 없어요. 저는 {t|가} 가짜 같아요.', '{x|랑} {t} 둘 다 {r}래요. 저는 {t} 쪽이 수상해요.'],
    c: ['{r|가} 둘이라니 말이 안 돼. {t|가} 가짜야.', '{x|랑} {t} 중에 {t|가} 거짓말 같아.'],
  },
  'accuse.votedTown': {
    p: ['{t|가} 수상해요. {xr|였}던 {x}한테 표를 던졌잖아요.', '{x|를} 찍은 게 {t}였죠. {x|는} {xr|였}는데요.'],
    c: ['{t} 수상해. {xr|였}던 {x|를} 찍었잖아.', '{x} 찍은 거 {t}지? {x|는} {xr|였}다고.'],
  },
  'accuse.accusedTown': {
    p: ['{t|가} 몰아간 {x|는} {xr|였}어요. 일부러 그런 거 아닐까요?', '{t}, 그때 {x|를} 그렇게 몰더니… {x|는} {xr|였}잖아요.'],
    c: ['{t|가} {x} 몰아갔는데 {xr|였}잖아. 수상해.', '{t}, {x} 몰아간 거 기억나지? 걔 {xr|였}어.'],
  },
  'accuse.defendedMafia': {
    p: ['{t|는} 마피아였던 {x|를} 감쌌어요. 같은 편 아닐까요?', '{x|를} 끝까지 믿던 게 {t}였죠. 수상해요.'],
    c: ['{t}, 마피아 {x} 편들었잖아. 한패 아냐?', '{x} 감싸던 {t}, 이제 설명해 봐.'],
  },
  'accuse.motive': {
    p: ['{x|가} 전에 {t|를} 의심했었죠. 그래서 당한 것 같아요.', '{x|가} 쓰러지기 전에 {t|를} 지목했어요. 우연일까요?'],
    c: ['{x|가} {t} 의심하다가 당했잖아. 이상해.', '{x|가} {t} 찍더니 바로 당했어. 우연 아니야.'],
  },
  'accuse.quiet': {
    p: ['{t|는} 너무 조용해요. 무슨 생각인지 궁금해요.', '{t}, 왜 아무 말도 안 해요?'],
    c: ['{t} 왜 이렇게 조용해? 수상한데.', '{t}, 말 좀 해 봐.'],
  },
  'accuse.gut': {
    p: ['왠지 {t|가} 마음에 걸려요.', '{t|가} 좀 수상해 보여요.', '{t}… 느낌이 이상해요.'],
    c: ['{t}, 좀 쎄한데?', '난 {t|가} 수상해.', '{t} 눈빛이 이상해.'],
  },
  'trust.checked': {
    p: ['{t|는} 제가 조사했는데 시민이에요.', '{t|는} 믿어도 돼요. 제가 확인했어요.'],
    c: ['{t|는} 시민이야. 내가 확인했어.', '{t|는} 아니야. 내가 조사했거든.'],
  },
  'trust.claimed': {
    p: ['{t}의 경찰 말은 믿을 만해요.', '{t} 말 믿어요. 경찰 맞는 것 같아요.'],
    c: ['{t} 경찰 맞는 것 같아. 믿어.', '난 {t} 말 믿을래.'],
  },
  'trust.votedMafia': {
    p: ['{t|는} 마피아였던 {x}한테 표를 줬어요. 믿어도 될 것 같아요.', '{x|를} 찍은 {t|는} 믿을게요.'],
    c: ['{t|는} 마피아 {x} 찍었잖아. 믿을게.', '{t|는} {x} 찍었어. 시민 맞아.'],
  },
  'trust.gut': {
    p: ['{t|는} 착해 보여요. 아닌 것 같아요.', '{t|는} 믿어 볼게요.'],
    c: ['{t|는} 아닌 것 같아.', '{t|는} 믿어.'],
  },
  'claim.police': { p: ['사실 저 경찰이에요.', '이제 말할게요. 저 경찰이에요.'], c: ['사실 나 경찰이야.', '이제 말할게. 나 경찰이야.'] },
  'claim.policeNone': { p: ['아직 마피아는 못 찾았어요.'], c: ['아직 마피아는 못 찾았어.'] },
  'res.mafia': { p: ['{t|는} 마피아예요!'], c: ['{t|는} 마피아야!'] },
  'res.town': { p: ['{t|는} 시민이에요.'], c: ['{t|는} 시민이야.'] },
  'claim.doctor': { p: ['저 의사예요. 저를 내보내면 다들 위험해져요!', '사실 저 의사예요. 믿어 주세요.'], c: ['나 의사야. 나 내보내면 큰일 나!', '사실 나 의사야. 진짜야.'] },
  'claim.citizen': { p: ['저는 그냥 시민이에요. 정말이에요.'], c: ['나 시민이야, 진짜로.'] },
  defend: { p: ['저 아니에요! 정말 억울해요.', '저 시민이에요. 믿어 주세요.'], c: ['나 아니야! 왜 나야?', '억울해. 나 시민이라고.'] },
  'defend.claimed': { p: ['저 진짜 {r|예요}. 믿어 주세요.', '제가 왜 마피아예요? 저 {r|라고} 했잖아요.'], c: ['나 진짜 {r|이야}. 믿어 줘.', '나 {r|라고} 했잖아. 왜 의심해?'] },
  'defend.claimedCounter': { p: ['저 진짜 {r|예요}. 오히려 {x|가} 수상해요.'], c: ['나 진짜 {r|이야}. {x|야말로} 수상해.'] },
  'defend.x': { p: ['{x}, 저 아니에요. 다시 생각해 봐요.', '{x}, 오해예요. 저 시민이에요.'], c: ['{x|야}, 나 아니라니까.', '{x}, 잘못 짚었어.'] },
  'defend.counter': {
    p: ['저 아니에요. 오히려 저를 몰아가는 {x|가} 수상해요.', '왜 저를요? {x|야말로} 수상해요.'],
    c: ['나 아니야. {x|야말로} 수상하거든?', '{x}, 너 나 몰아가는 거 수상해.'],
  },
  agree: { p: ['{x} 말이 맞아요. {t|가} 수상해요.', '저도 {x|랑} 같은 생각이에요. {t|가} 이상해요.'], c: ['{x} 말이 맞아. {t} 수상해.', '나도 {x} 말에 동의해. {t} 이상해.'] },
  doubt: { p: ['{t|는} 아닌 것 같아요. {x|가} 너무 몰아가요.', '{x}, {t|는} 시민 같은데요?'], c: ['{t|는} 아닌데? {x} 너무 몰아가는 거 아냐?', '{x}, {t|는} 아닌 것 같아.'] },
  ask: { p: ['{t|는} 누가 수상해요?', '{t}, 어떻게 생각해요?'], c: ['{t}, 넌 누가 수상해?', '{t|는} 어떻게 생각해?'] },
  vote: { p: ['{t}한테 투표할게요.', '저는 {t|를} 찍을게요.'], c: ['{t} 찍을게.', '난 {t}!'] },
  'vote.none': { p: ['이번엔 기권할게요.'], c: ['난 기권.'] },
  'last.town': { p: ['저 정말 {r|였}어요… 꼭 이겨 줘요.'], c: ['나 진짜 {r|였}는데… 꼭 이겨!'] },
  'last.townT': { p: ['저 정말 {r|였}어요… {t|를} 꼭 살펴봐 줘요.'], c: ['나 진짜 {r|였}는데… {t|를} 조심해.'] },
  'last.mafia': { p: ['들켰네요… 하지만 아직 끝난 게 아니에요.'], c: ['흥, 들켰네. 그래도 아직 안 끝났어.'] },
  idle: { p: ['음… 아직 잘 모르겠어요.', '다들 수상해 보여요.'], c: ['음… 아직 모르겠어.', '다들 수상해.'] },
  suggest: { p: ['오늘 밤엔 {t} 어때요?'], c: ['오늘 밤엔 {t} 어때?'] },
  'suggest.cop': { p: ['경찰이라고 했잖아요.'], c: ['경찰이라고 했잖아.'] },
  'suggest.threat': { p: ['우리를 의심하고 있어요.'], c: ['우리를 의심하고 있어.'] },
  'me.accuse': { p: ['{t|가} 수상해요.'], c: ['{t|가} 수상해요.'] },
  'me.trust': { p: ['{t|는} 믿어요.'], c: ['{t|는} 믿어요.'] },
  'me.ask': { p: ['다들 누가 제일 수상해요?'], c: ['다들 누가 제일 수상해요?'] },
};

const EN: Record<string, readonly string[]> = {
  'react.died': ['{t} is gone… let’s find who did it.', 'Why {t}? They must have known something.'],
  'react.saved': ['Nobody got hurt! The doctor must have saved someone.', 'Phew, everyone made it. Nice save, doctor.'],
  'react.calm': ['A quiet first night. Let’s watch closely from now on.'],
  'accuse.checked': ['I checked {t}. {t} is Mafia!'],
  'accuse.fakeClaim': ['{t} is lying. The real {r} was {x}!'],
  'accuse.fakeClaimMe': ['{t} is a fake. I’m the real {r}!'],
  'accuse.claimClash': ['There can’t be two {r}s. I think {t} is the fake.'],
  'accuse.votedTown': ['{t} voted for {x}, who was the {xr}. Suspicious.'],
  'accuse.accusedTown': ['{t} pushed {x}, and {x} was the {xr}.'],
  'accuse.defendedMafia': ['{t} defended {x}, who was Mafia. Same team?'],
  'accuse.motive': ['{x} suspected {t} and then got killed. Coincidence?'],
  'accuse.quiet': ['{t} is awfully quiet. What are you thinking?'],
  'accuse.gut': ['Something about {t} feels off.', 'I have a bad feeling about {t}.'],
  'trust.checked': ['I checked {t}. {t} is a citizen.'],
  'trust.claimed': ['I believe {t} is the police.'],
  'trust.votedMafia': ['{t} voted for {x}, who was Mafia. I trust {t}.'],
  'trust.gut': ['{t} seems fine to me.', 'I trust {t}.'],
  'claim.police': ['Okay, I’m the police.'],
  'claim.policeNone': ['No Mafia found yet.'],
  'res.mafia': ['{t} is Mafia!'],
  'res.town': ['{t} is clear.'],
  'claim.doctor': ['I’m the doctor. Don’t vote me out!'],
  'claim.citizen': ['I’m just a citizen, honestly.'],
  defend: ['It’s not me! I’m a citizen.', 'Not me, I promise.'],
  'defend.x': ['{x}, it’s not me. Think again.'],
  'defend.counter': ['Not me. If anything, {x} is suspicious for pushing me.'],
  'defend.claimed': ['I really am the {r}. Trust me.'],
  'defend.claimedCounter': ['I really am the {r}. If anything, {x} is suspicious.'],
  agree: ['{x} is right. {t} is suspicious.'],
  doubt: ['I don’t think it’s {t}. {x} is pushing too hard.'],
  ask: ['{t}, who do you suspect?', '{t}, what do you think?'],
  vote: ['I’m voting {t}.', '{t}.'],
  'vote.none': ['I’ll pass this time.'],
  'last.town': ['I really was the {r}… win this!'],
  'last.townT': ['I really was the {r}… watch {t}!'],
  'last.mafia': ['You got me… but it’s not over.'],
  idle: ['Hmm… not sure yet.', 'Everyone looks suspicious.'],
  suggest: ['How about {t} tonight?'],
  'suggest.cop': ['They said they’re the police.'],
  'suggest.threat': ['They’re onto us.'],
  'me.accuse': ['I think {t} is suspicious.'],
  'me.trust': ['I trust {t}.'],
  'me.ask': ['Who do you all suspect?'],
};

const NARRATE: Record<string, { ko: string; en: string }> = {
  start: { ko: '{n}명이 모였어요. 이 중 마피아는 {m}명이에요.', en: '{n} players. {m} of them are Mafia.' },
  myRole: { ko: '당신은 {r|예요}. {d}', en: 'You are the {r}. {d}' },
  mates: { ko: '동료 마피아: {list}', en: 'Your fellow Mafia: {list}' },
  night: { ko: '{d}일째 밤이 되었어요.', en: 'Night {d} falls.' },
  quiet: { ko: '첫날 밤이에요. 마피아는 서로 얼굴만 확인해요.', en: 'First night: the Mafia only meet each other.' },
  died: { ko: '아침이 밝았어요. 밤사이 {t|가} 쓰러졌어요. {t|는} {r|였}어요.', en: 'Morning. {t} was killed in the night. {t} was the {r}.' },
  saved: { ko: '아침이 밝았어요. 마피아가 노렸지만 의사가 지켜 냈어요!', en: 'Morning. The Mafia struck, but the doctor saved them!' },
  calm: { ko: '아침이 밝았어요. 조용한 밤이었어요.', en: 'Morning. A quiet night.' },
  checkMafia: { ko: '조사 결과: {t|는} 마피아예요!', en: 'Result: {t} is Mafia!' },
  checkTown: { ko: '조사 결과: {t|는} 마피아가 아니에요.', en: 'Result: {t} is not Mafia.' },
  vote: { ko: '투표 시간이에요. 쫓아낼 친구를 골라요.', en: 'Time to vote. Pick who leaves.' },
  out: { ko: '{t|가} {c}표로 쫓겨났어요.', en: '{t} was voted out with {c} votes.' },
  reveal: { ko: '{t|는} {r|였}어요.', en: '{t} was the {r}.' },
  tie: { ko: '표가 갈려서 아무도 나가지 않았어요.', en: 'Tied vote. Nobody leaves.' },
  townWin: { ko: '시민 승리! 마피아를 모두 찾아냈어요.', en: 'Town wins! All Mafia found.' },
  mafiaWin: { ko: '마피아 승리! 마피아가 마을을 차지했어요.', en: 'Mafia wins! They took over the town.' },
  youDied: { ko: '당신은 쓰러졌어요. 이제 지켜보기만 할 수 있어요.', en: 'You’re out. You can only watch now.' },
};

export const nameOf = (g: Game, i: number, lang: Lang): string => g.players[i]?.name || translate(lang, `character.${g.players[i]?.character ?? 'hwigi'}`);
export const roleName = (role: Role, lang: Lang): string => translate(lang, `mafia.roles.${role}`);

export function narrate(key: string, v: Vars, lang: Lang): string {
  const n = NARRATE[key];
  return n ? fill(lang === 'ko' ? n.ko : n.en, v) : key;
}

function choose(key: string, v: Vars, casual: boolean, cool: boolean, lang: Lang, rnd: () => number): string {
  if (lang === 'en') {
    const xs = EN[key] ?? EN.idle ?? [''];
    return fill(xs[Math.floor(rnd() * xs.length)] ?? '', v);
  }
  const set = KO[key] ?? KO.idle;
  let xs = (casual ? set?.c : set?.p) ?? [''];
  // 시크한 친구는 짧은 말 중에서
  if (cool) xs = [...xs].sort((a, b) => a.length - b.length).slice(0, Math.ceil(xs.length / 2));
  return fill(xs[Math.floor(rnd() * xs.length)] ?? '', v);
}

/** t가 거짓으로(또는 둘이 겹치게) 주장한 역할 */
function claimedRole(g: Game, t: number): Role {
  return g.claims.find((c) => c.by === t && c.role !== 'citizen')?.role ?? 'police';
}

function claimText(g: Game, a: Extract<Act, { k: 'claim' }>, lang: Lang, rnd: () => number, casual: boolean, cool: boolean): string {
  const say = (key: string, v: Vars = {}): string => choose(key, v, casual, cool, lang, rnd);
  if (a.role !== 'police') return say(`claim.${a.role === 'mafia' ? 'citizen' : a.role}`);
  const res = (a.res ?? []).map(([t, m]) => say(m ? 'res.mafia' : 'res.town', { t: nameOf(g, t, lang) }));
  return [say('claim.police'), ...(res.length ? res : [say('claim.policeNone')])].join(' ');
}

/** 발언 하나를 그 친구 말투의 문장으로 */
export function lineFor(g: Game, s: Said, lang: Lang, rnd: () => number = Math.random): string {
  const p = g.players[s.by] as Player;
  const style = PERSONA[p.character].style;
  const casual = style === 'casual' || style === 'cool';
  const cool = style === 'cool';
  const nm = (i: number | undefined): string => (i === undefined ? '' : nameOf(g, i, lang));
  const say = (key: string, v: Vars = {}): string => choose(key, v, casual, cool, lang, rnd);
  const a = s.act;
  let text: string;
  switch (a.k) {
    case 'accuse': {
      const xr = a.x === undefined ? undefined : g.players[a.x]?.role;
      const v = { t: nm(a.t), x: nm(a.x), r: roleName(claimedRole(g, a.t), lang), xr: xr ? roleName(xr, lang) : '' };
      text = say((a.why === 'fakeClaim' || a.why === 'claimClash') && a.x === s.by ? 'accuse.fakeClaimMe' : `accuse.${a.why}`, v);
      break;
    }
    case 'trust':
      text = say(`trust.${['checked', 'claimed', 'votedMafia'].includes(a.why) ? a.why : 'gut'}`, { t: nm(a.t), x: nm(a.x) });
      break;
    case 'claim':
      text = claimText(g, a, lang, rnd, casual, cool);
      break;
    case 'defend': {
      // 경찰·의사라고 밝힌 친구는 그 역할로 해명한다
      const mine = g.claims.find((c) => c.by === s.by && c.role !== 'citizen');
      if (mine) text = say(a.counter && a.x !== undefined ? 'defend.claimedCounter' : 'defend.claimed', { r: roleName(mine.role, lang), x: nm(a.x) });
      else text = a.x === undefined ? say('defend') : say(a.counter ? 'defend.counter' : 'defend.x', { x: nm(a.x) });
      break;
    }
    case 'agree':
    case 'doubt':
      text = say(a.k, { t: nm(a.t), x: nm(a.x) });
      break;
    case 'ask':
      text = say('ask', { t: nm(a.t) });
      break;
    case 'react':
      text = say(`react.${a.ev}`, { t: nm(a.t) });
      break;
    case 'vote':
      text = a.t === null ? say('vote.none') : say('vote', { t: nm(a.t) });
      break;
    case 'last':
      text = a.role === 'mafia' ? say('last.mafia') : say(a.t === undefined ? 'last.town' : 'last.townT', { r: roleName(a.role, lang), t: nm(a.t) });
      break;
    default:
      text = say('idle');
  }
  if (style === 'cute' && lang === 'ko' && rnd() < 0.3 && /요[.!]?$/.test(text)) text = text.replace(/[.!]?$/, ' 뀨!');
  return text;
}

/** 사람이 빠른 버튼으로 한 말 */
export function humanLine(g: Game, act: Act | null, lang: Lang): string {
  const say = (key: string, v: Vars = {}): string => choose(key, v, false, false, lang, () => 0);
  if (!act) return say('me.ask');
  if (act.k === 'accuse') return say('me.accuse', { t: nameOf(g, act.t, lang) });
  if (act.k === 'trust') return say('me.trust', { t: nameOf(g, act.t, lang) });
  if (act.k === 'claim') return claimText(g, act, lang, () => 0, false, false);
  return say('idle');
}

/** 마피아 동료 AI가 밤에 사람에게 귀띔하는 말 */
export function suggestLine(g: Game, by: number, t: number, lang: Lang): string {
  const style = PERSONA[(g.players[by] as Player).character].style;
  const casual = style === 'casual' || style === 'cool';
  const say = (key: string, v: Vars = {}): string => choose(key, v, casual, false, lang, Math.random);
  const cop = g.claims.some((c) => c.by === t && c.role === 'police');
  const threat = g.said.some((s) => s.by === t && (s.act.k === 'accuse' || s.act.k === 'agree') && g.players[s.act.t]?.role === 'mafia');
  return [say('suggest', { t: nameOf(g, t, lang) }), cop ? say('suggest.cop') : threat ? say('suggest.threat') : ''].filter(Boolean).join(' ');
}

// ── 사람이 친 말 읽기 ─────────────────────────────────────

export interface Parsed {
  acts: Act[];
  /** "누가 수상해?" 같은 질문 */
  ask: boolean;
  /** "휘기 왜?" — 이유를 물어본 친구 */
  why: number | null;
}

const BAD = /(마피아|범인|수상|의심|이상해|거짓|찍|투표|내보내|쫓아|죽이|mafia|sus|liar|lying|vote)/;
const GOOD = /(시민|믿|착해|결백|innocent|trust|citizen|clear)/;
const NEG = /(아니|아닌|아냐|않|못|안 같|not|n't)/;
const ME = '(?:나|저|내가|제가)\\s*(?:는|가|도)?\\s*(?:사실\\s*|그냥\\s*)?';
const CLAIM: [Role, RegExp][] = [
  ['police', new RegExp(`${ME}경찰|i(?:'| a)m (?:the )?(?:police|cop)`)],
  ['doctor', new RegExp(`${ME}의사|i(?:'| a)m (?:the )?doctor`)],
  ['citizen', new RegExp(`${ME}시민|i(?:'| a)m (?:just )?(?:a )?citizen`)],
];

function tone(s: string): 'bad' | 'good' | null {
  const neg = NEG.test(s);
  if (BAD.test(s)) return neg ? 'good' : 'bad';
  if (GOOD.test(s)) return neg ? 'bad' : 'good';
  return null;
}

/** by: 말한 사람 자리 (자기 자신은 지목하지 않는다) */
export function parseHuman(g: Game, text: string, by: number): Parsed {
  const low = text.toLowerCase().replace(/’/g, "'");
  const hits: { id: number; at: number }[] = [];
  for (const p of g.players) {
    if (p.id === by) continue;
    for (const nm of [p.name, translate('ko', `character.${p.character}`), translate('en', `character.${p.character}`)]) {
      // 한 글자 이름("나" 같은)은 다른 말에 섞여 있어서 찾지 않는다
      const at = nm && nm.length >= 2 ? low.indexOf(nm.toLowerCase()) : -1;
      if (at >= 0) {
        hits.push({ id: p.id, at });
        break;
      }
    }
  }
  hits.sort((a, b) => a.at - b.at);
  const seg = (k: number): string => low.slice(hits[k]?.at ?? 0, hits[k + 1]?.at ?? low.length);
  const why = /(왜|why)/.test(low) && hits.length ? (hits[0]?.id ?? null) : null;
  const acts: Act[] = [];
  const claim = CLAIM.find(([, re]) => re.test(low))?.[0];
  if (claim === 'police') {
    const res = hits.flatMap((h, k): [number, boolean][] => {
      const t = tone(seg(k));
      return t ? [[h.id, t === 'bad']] : [];
    });
    acts.push({ k: 'claim', role: 'police', res });
  } else {
    if (claim) acts.push({ k: 'claim', role: claim });
    if (why === null)
      hits.forEach((h, k) => {
        const t = tone(seg(k));
        if (t) acts.push(t === 'bad' ? { k: 'accuse', t: h.id, why: 'gut' } : { k: 'trust', t: h.id, why: 'gut' });
      });
  }
  const ask = !acts.length && why === null && /(누가|누구|어떻게 생각|who|what do you think|thoughts)/.test(low);
  return { acts, ask, why };
}
