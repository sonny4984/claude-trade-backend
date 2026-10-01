import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiNight, aiVerdict, aiVote, living, newGame, plan, record, resolveNight, resolveVerdict, resolveVote, rolesFor, suspicion, toVerdict, type Act, type Game, type Side } from '../engine';
import { cutify, fill, josa, lineFor, parseHuman } from '../talk';
import { GeminiFail, chooseModel, connectGemini, geminiJson, parseLoose, rankModels } from '../gemini';
import { buildPrompt, polishPick } from '../claude';
import { DAILY_TOKENS, claudeLocked, claudeUsed, resetClaudeUsage, spendClaude, tokensOf } from '../budget';

/** AI끼리 한 판 — 밤 → 낮 토론 세 번 → 투표 */
function autoplay(seed: number, count: number): { winner: Side | null; days: number; lines: number } {
  const g = newGame({ count, me: 'hwigi', seed, allAi: true });
  let lines = 0;
  while (!g.winner && g.day < 15) {
    resolveNight(g, aiNight(g));
    if (g.winner) break;
    for (const k of ['open', 'more', 'more'] as const) lines += plan(g, { k }).length;
    const accused = resolveVote(
      g,
      living(g).map((p) => ({ day: g.day, by: p.id, t: aiVote(g, p.id) })),
    );
    if (accused === null) continue;
    lines += plan(g, { k: 'defense', by: accused }).length;
    toVerdict(g);
    resolveVerdict(
      g,
      living(g)
        .filter((p) => p.id !== accused)
        .map((p) => ({ by: p.id, yes: aiVerdict(g, p.id) })),
    );
  }
  return { winner: g.winner, days: g.day, lines };
}

describe('마피아 규칙', () => {
  it('인원별 역할: 마피아 1~3, 경찰 하나, 의사는 6명·8명', () => {
    const count = (n: number, role: string): number => rolesFor(n).filter((r) => r === role).length;
    expect([5, 6, 7, 8].map((n) => rolesFor(n).length)).toEqual([5, 6, 7, 8]);
    expect([5, 6, 7, 8].map((n) => count(n, 'mafia'))).toEqual([1, 2, 2, 3]);
    expect([5, 6, 7, 8].map((n) => count(n, 'police'))).toEqual([1, 1, 1, 1]);
    expect([5, 6, 7, 8].map((n) => count(n, 'doctor'))).toEqual([0, 1, 0, 1]);
  });

  it('고른 역할을 받는다', () => {
    for (const role of ['mafia', 'police', 'doctor', 'citizen'] as const) expect(newGame({ count: 8, me: 'moka', myRole: role, seed: 3 }).players[0]?.role).toBe(role);
  });

  it('지목 투표 1등은 변론대에 서고, 찬반에서 찬성이 많아야 처형된다', () => {
    const g = newGame({ count: 7, me: 'moka', seed: 8, allAi: true });
    g.phase = 'vote';
    expect(resolveVote(g, [{ day: 1, by: 0, t: 2 }, { day: 1, by: 1, t: 2 }, { day: 1, by: 3, t: 4 }])).toBe(2);
    expect(g.phase).toBe('defense');
    const said = plan(g, { k: 'defense', by: 2 });
    expect(said[0]?.by).toBe(2);
    expect(['plea', 'claim']).toContain(said[0]?.act.k);
    toVerdict(g);
    expect(resolveVerdict(g, [{ by: 0, yes: true }, { by: 1, yes: false }, { by: 3, yes: false }])).toMatchObject({ executed: false, yes: 1, no: 2 });
    expect(g.players[2]?.alive).toBe(true);
    expect(g.phase).toBe('night');
    // 동점이면 아무도 변론대에 서지 않는다
    g.phase = 'vote';
    expect(resolveVote(g, [{ day: 2, by: 0, t: 2 }, { day: 2, by: 1, t: 3 }])).toBeNull();
    expect(g.phase).toBe('night');
  });

  it('AI끼리 수백 판: 모두 끝나고, 어느 쪽도 일방적으로 이기지 않는다', () => {
    for (const count of [5, 6, 7, 8]) {
      let town = 0;
      const N = 150;
      for (let s = 1; s <= N; s++) {
        const r = autoplay(s * 7919 + count, count);
        expect(r.winner).not.toBeNull();
        expect(r.days).toBeLessThan(15);
        expect(r.lines).toBeGreaterThan(0);
        if (r.winner === 'town') town++;
      }
      expect(town / N).toBeGreaterThan(0.35);
      expect(town / N).toBeLessThan(0.75);
    }
  }, 60_000);
});

describe('마피아 추리', () => {
  /** 0번이 시민(관찰자)인 7인 판: 1·2번이 마피아, 3번 경찰 */
  function fixed(): Game {
    const g = newGame({ count: 7, me: 'moka', seed: 11, allAi: true });
    const roles = ['citizen', 'mafia', 'mafia', 'police', 'doctor', 'citizen', 'citizen'] as const;
    g.players.forEach((p, i) => (p.role = roles[i] ?? 'citizen'));
    g.phase = 'day';
    return g;
  }

  it('경찰 주장이 하나뿐이면 지목된 친구를 크게 의심한다', () => {
    const g = fixed();
    const before = suspicion(g, 0)[1] ?? 0;
    record(g, 3, { k: 'claim', role: 'police', res: [[1, true]] });
    expect(suspicion(g, 0)[1]).toBeGreaterThan(Math.max(0.6, before * 2));
  });

  it('진짜 경찰은 자기를 사칭한 친구를 마피아로 본다', () => {
    const g = fixed();
    record(g, 2, { k: 'claim', role: 'police', res: [[5, true]] });
    expect(suspicion(g, 3)[2]).toBeGreaterThan(0.85);
    // 공개 정보만 보면 주장 하나뿐이라 아직 믿는 쪽
    expect(suspicion(g, null)[5]).toBeGreaterThan(suspicion(g, null)[2] ?? 1);
  });

  it('죽은 진짜 경찰이 밝혀지면 사칭한 친구가 들킨다', () => {
    const g = fixed();
    record(g, 2, { k: 'claim', role: 'police', res: [[5, true]] });
    g.players[3]!.alive = false;
    g.deaths.push({ day: 1, who: 3, cause: 'night', role: 'police' });
    expect(suspicion(g, 0)[2]).toBeGreaterThan(0.9);
  });

  it('마피아로 밝혀진 친구를 감싼 친구가 의심받는다', () => {
    const g = fixed();
    record(g, 2, { k: 'trust', t: 1, why: 'gut' });
    resolveVote(g, [
      { day: 1, by: 0, t: 1 },
      { day: 1, by: 3, t: 1 },
      { day: 1, by: 2, t: 4 },
    ]);
    toVerdict(g);
    resolveVerdict(g, [
      { by: 0, yes: true },
      { by: 3, yes: true },
      { by: 2, yes: false },
    ]);
    const s = suspicion(g, 0);
    expect(s[1]).toBe(1);
    expect(s[2]).toBeGreaterThan(s[5] ?? 1);
  });
});

describe('마피아 대사', () => {
  it('받침에 맞는 조사', () => {
    expect(fill('{t|가} 수상해요', { t: '휘기' })).toBe('휘기가 수상해요');
    expect(fill('{r|는} {x|였}어요', { r: '경찰', x: '모카' })).toBe('경찰은 모카였어요');
    expect(fill('{r|였}어요', { r: '시민' })).toBe('시민이었어요');
    expect(josa('경찰', '로')).toBe('로');
    expect(josa('시민', '로')).toBe('으로');
  });

  it('모든 발언이 두 언어로 빈칸 없이 문장이 된다', () => {
    const g = newGame({ count: 8, me: 'moka', seed: 5 });
    const acts: Act[] = [
      ...(['checked', 'fakeClaim', 'claimClash', 'votedTown', 'accusedTown', 'defendedMafia', 'motive', 'quiet', 'gut'] as const).map((why): Act => ({ k: 'accuse', t: 2, why, x: 3 })),
      { k: 'accuse', t: 2, why: 'fakeClaim', x: 1 },
      ...(['checked', 'claimed', 'votedMafia', 'gut'] as const).map((why): Act => ({ k: 'trust', t: 2, why, x: 3 })),
      { k: 'claim', role: 'police', res: [[2, true], [3, false]] },
      { k: 'claim', role: 'police', res: [] },
      { k: 'claim', role: 'doctor' },
      { k: 'claim', role: 'citizen' },
      { k: 'defend' },
      { k: 'defend', x: 2 },
      { k: 'defend', x: 2, counter: true },
      { k: 'agree', t: 2, x: 3 },
      { k: 'doubt', t: 2, x: 3 },
      { k: 'ask', t: 2 },
      { k: 'react', ev: 'died', t: 2 },
      { k: 'react', ev: 'saved' },
      { k: 'react', ev: 'calm' },
      { k: 'vote', t: 2 },
      { k: 'vote', t: null },
      { k: 'last', role: 'citizen', t: 2 },
      { k: 'last', role: 'police' },
      { k: 'last', role: 'mafia' },
      { k: 'chat', to: 0 },
      { k: 'plea' },
      { k: 'plea', t: 2 },
      { k: 'verdict', t: 2, yes: true },
      { k: 'verdict', t: 2, yes: false },
      { k: 'idle' },
    ];
    for (const lang of ['ko', 'en'] as const)
      for (const by of [1, 2, 3, 4, 5, 6, 7])
        for (const act of acts) {
          const text = lineFor(g, { day: 1, by, act }, lang);
          expect(text.length, JSON.stringify(act)).toBeGreaterThan(3);
          expect(text).not.toMatch(/[{}]|undefined/);
        }
  });

  it('사람이 친 말에서 의심·믿음·역할 주장을 읽는다', () => {
    const g = newGame({ count: 8, me: 'moka', seed: 9 });
    const id = (c: string): number => g.players.find((p) => p.character === c)?.id ?? -1;
    const hwigi = id('hwigi');
    const ginini = id('ginini');
    const pponi = id('pponi');
    expect(parseHuman(g, '휘기가 마피아 같아', 0).acts).toEqual([{ k: 'accuse', t: hwigi, why: 'gut' }]);
    expect(parseHuman(g, '기니니는 마피아 아닌 것 같아', 0).acts).toEqual([{ k: 'trust', t: ginini, why: 'gut' }]);
    expect(parseHuman(g, '휘기 말고 기니니가 수상해', 0).acts).toEqual([{ k: 'accuse', t: ginini, why: 'gut' }]);
    expect(parseHuman(g, '나 경찰인데 뽀니 조사했더니 마피아였어', 0).acts).toEqual([{ k: 'claim', role: 'police', res: [[pponi, true]] }]);
    expect(parseHuman(g, 'Hwigi is sus', 0).acts).toEqual([{ k: 'accuse', t: hwigi, why: 'gut' }]);
    expect(parseHuman(g, '휘기 왜 그렇게 생각해?', 0)).toMatchObject({ acts: [], why: hwigi });
    expect(parseHuman(g, '다들 누가 수상해?', 0)).toMatchObject({ acts: [], ask: true });
  });

  it('사람이 누구를 의심하면 그 친구가 해명하고 다른 친구가 거든다', () => {
    const g = newGame({ count: 7, me: 'moka', seed: 21, myRole: 'citizen' });
    resolveNight(g, aiNight(g));
    const t = living(g).find((p) => !p.human)?.id ?? 1;
    const act: Act = { k: 'accuse', t, why: 'gut' };
    record(g, 0, act);
    const said = plan(g, { k: 'human', by: 0, acts: [act], ask: false, why: null });
    expect(said[0]?.by).toBe(t);
    expect(said.length).toBeGreaterThanOrEqual(2);
    expect(['agree', 'doubt']).toContain(said[1]?.act.k);
  });
});

describe('기니피그 말투', () => {
  it('말끝 "요"가 "용"이 되고 앞에 꾸잉 소리가 붙는다', () => {
    expect(cutify('저 의사 맞는데요!', 'hwigi', 'ko', () => 0)).toMatch(/^꾸잉(꾸잉)?! 저 의사 맞는데용!$/);
    // 소리도 안 붙이고 "요"도 그대로 두는 경우
    expect(cutify('저 아니에요.', 'pponi', 'ko', () => 0.99)).toBe('저 아니에요.');
    // 말 중간의 "요"는 건드리지 않는다
    expect(cutify('요즘 수상해요', 'moka', 'ko', () => 0.5)).toBe('요즘 수상해용');
  });

  it('사람이 게임 얘기가 아닌 말을 하면 불린 친구가 자유롭게 대꾸한다', () => {
    const g = newGame({ count: 7, me: 'moka', seed: 4, myRole: 'citizen' });
    resolveNight(g, aiNight(g));
    const friend = living(g).find((p) => !p.human);
    const nm = { hwigi: '휘기', ginini: '기니니', pponi: '뽀니', moka: '모카', dubu: '두부', kongi: '콩이', bori: '보리', nuri: '누리' }[friend?.character ?? 'hwigi'];
    const p = parseHuman(g, `${nm}야 오늘 뭐 먹었어?`, 0);
    expect(p.acts).toEqual([]);
    expect(p.mentions).toEqual([friend?.id]);
    const said = plan(g, { k: 'human', by: 0, acts: [], ask: false, why: null, mentions: p.mentions });
    expect(said[0]).toMatchObject({ by: friend?.id, act: { k: 'chat', to: 0 } });
  });
});

describe('절약 모드', () => {
  it('사람이 말을 걸 때만, 맨 먼저 대답하는 친구 한 명만 다듬는다', () => {
    expect(polishPick(3, false, false)).toEqual([0, 1, 2]);
    expect(polishPick(3, true, false)).toEqual([0, 1, 2]);
    expect(polishPick(3, true, true)).toEqual([0]);
    expect(polishPick(3, false, true)).toEqual([]);
    expect(polishPick(0, true, true)).toEqual([]);
  });

  it('짧은 글: 규칙을 줄이고 최근 대화 6줄만, 방금 한 말은 한 번만', () => {
    const g = newGame({ count: 7, me: 'moka', seed: 4, myRole: 'citizen' });
    resolveNight(g, aiNight(g));
    const said = plan(g, { k: 'human', by: 0, acts: [], ask: false, why: null, mentions: [] });
    const history = Array.from({ length: 14 }, (_, k) => ({ name: '휘기', text: `옛날 이야기 ${k}` }));
    const latest = { name: '모카(사람)', text: '다들 오늘 아침 뭐 먹었어?' };
    history.push(latest);
    const full = buildPrompt(g, said, ['초안'], history, 'ko', latest);
    const brief = buildPrompt(g, said.slice(0, 1), ['초안'], history, 'ko', latest, true);
    expect(brief.length).toBeLessThan(full.length * 0.55);
    expect(brief).toContain('옛날 이야기 13');
    expect(brief).toContain('옛날 이야기 8');
    expect(brief).not.toContain('옛날 이야기 7');
    expect(brief.split('다들 오늘 아침 뭐 먹었어?').length - 1).toBe(1);
    expect(brief).toContain('자유 대화');
    expect([...brief.matchAll(/\{"id":\d+,"name"/g)].length).toBe(1);
    expect(buildPrompt(g, said.slice(0, 1), ['draft'], history, 'en', latest, true)).toContain('Only JSON');
  });
});

describe('Claude 하루 한도', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetClaudeUsage();
  });

  it('쓴 만큼 쌓이고, 한도를 넘으면 잠기고, 다음 날 풀린다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 21, 0));
    resetClaudeUsage();
    expect(tokensOf(1000)).toBe(900);
    spendClaude(DAILY_TOKENS - 500);
    expect(claudeLocked()).toBe(false);
    spendClaude(600);
    expect(claudeUsed()).toBe(DAILY_TOKENS + 100);
    expect(claudeLocked()).toBe(true);
    vi.setSystemTime(new Date(2026, 9, 2, 7, 0));
    expect(claudeUsed()).toBe(0);
    expect(claudeLocked()).toBe(false);
  });
});

describe('Gemini', () => {
  it('가장 새 정식 Flash를 고른다 (미리보기·이미지 빼고, 같은 판이면 Lite보다 일반)', () => {
    expect(chooseModel(['models/gemini-3.5-flash', 'models/gemini-3.8-flash', 'models/gemini-3.8-flash-lite', 'models/gemini-3-flash-preview', 'models/gemini-3.9-flash-image'])).toBe('gemini-3.8-flash');
    expect(chooseModel(['models/gemini-3.5-flash-lite'])).toBe('gemini-3.5-flash-lite');
    expect(chooseModel(['models/text-embedding-004'])).toBeNull();
    expect(rankModels(['models/gemini-3.1-flash-lite', 'models/gemini-3.5-flash', 'models/gemini-flash-latest', 'models/gemini-3.8-flash-tts'])).toEqual(['gemini-3.5-flash', 'gemini-3.1-flash-lite']);
  });

  it('답에서 JSON을 꺼낸다', () => {
    expect(parseLoose('{"lines":[]}')).toEqual({ lines: [] });
    expect(parseLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseLoose('여기요 {"a":2} 끝')).toEqual({ a: 2 });
  });

  it('대사를 받고, 생각 설정을 거절하면 빼고 다시 묻고, 실패는 이유별로', async () => {
    const calls: { url: string; body: string }[] = [];
    const reply = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status });
    const ok = { candidates: [{ content: { parts: [{ text: '{"lines":[{"id":0,"text":"꾸잉 안녕!"}]}' }] } }] };
    let queue: Response[] = [reply(400, { error: { message: 'Unknown name "thinkingConfig"' } }), reply(200, ok)];
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? '') });
      return queue.shift() ?? reply(500, {});
    }) as typeof fetch;
    try {
      const signal = new AbortController().signal;
      const setup = { key: 'k', model: 'gemini-3.8-flash' };
      expect(await geminiJson(setup, '안녕', signal)).toEqual({ lines: [{ id: 0, text: '꾸잉 안녕!' }] });
      expect(calls[0]?.body).toContain('thinkingConfig');
      expect(calls[1]?.body).not.toContain('thinkingConfig');
      expect(calls[1]?.url).toContain('/models/gemini-3.8-flash:generateContent');
      queue = [reply(429, { error: { message: 'quota' } })];
      await expect(geminiJson(setup, '안녕', signal)).rejects.toMatchObject({ code: 'rate' });
      queue = [reply(400, { error: { message: 'API key not valid' } })];
      await expect(geminiJson(setup, '안녕', signal)).rejects.toBeInstanceOf(GeminiFail);
      // 붐비면(503) 다음 후보 모델로 넘어간다
      calls.length = 0;
      queue = [reply(503, { error: { status: 'UNAVAILABLE' } }), reply(200, ok)];
      expect(await geminiJson({ key: 'k', model: 'gemini-3.8-flash', models: ['gemini-3.8-flash', 'gemini-3.5-flash'] }, '안녕', signal)).toEqual({ lines: [{ id: 0, text: '꾸잉 안녕!' }] });
      expect(calls.map((c) => c.url.replace(/.*models\//, ''))).toEqual(['gemini-3.8-flash:generateContent', 'gemini-3.5-flash:generateContent']);
      // 연결할 때도 실제로 답하는 모델을 고른다
      calls.length = 0;
      queue = [reply(200, { models: ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }), reply(503, {}), reply(200, { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] })];
      expect(await connectGemini('k')).toEqual({ model: 'gemini-3.5-flash', models: ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'] });
    } finally {
      globalThis.fetch = real;
    }
  });
});
