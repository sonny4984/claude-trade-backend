import { describe, expect, it } from 'vitest';
import { PUZZLES, puzzleById } from '../puzzles';
import { candidates, guessers, newSoup, pending, pickPuzzle, pointsFor, soupReduce, tally, validSoup, type SoupState } from '../engine';
import { askPrompt, guessPrompt, readAnswer, readVerdict } from '../host';

const players = [
  { name: '나', character: 'moka' as const },
  { name: '여자친구', character: 'ginini' as const },
  { name: '동생', character: 'pponi' as const },
];

function ok(s: SoupState, a: Parameters<typeof soupReduce>[1]): SoupState {
  const r = soupReduce(s, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('바다거북 스프 문제', () => {
  it('40개 넘게, id가 겹치지 않고 모두 갖춰져 있다', () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(PUZZLES.map((p) => p.id)).size).toBe(PUZZLES.length);
    for (const p of PUZZLES) {
      expect(p.title.trim(), p.id).not.toBe('');
      expect(p.story.length, p.id).toBeGreaterThan(20);
      expect(p.answer.length, p.id).toBeGreaterThan(20);
      expect(p.keys.length, p.id).toBeGreaterThanOrEqual(1);
      expect(p.keys.every((k) => k.trim().length > 0), p.id).toBe(true);
      expect(p.hints).toHaveLength(3);
      expect(p.hints.every((h) => h.trim().length > 0), p.id).toBe(true);
      expect([1, 2, 3]).toContain(p.level);
      expect(['mild', 'dark']).toContain(p.spice);
      expect(puzzleById(p.id)).toBe(p);
    }
  });
  it('순한맛이 기본으로 충분하고, 난이도마다 하나 이상', () => {
    const mild = candidates({ spice: 'mild', level: 0 });
    expect(mild.length).toBeGreaterThanOrEqual(25);
    expect(mild.every((p) => p.spice === 'mild')).toBe(true);
    for (const level of [1, 2, 3] as const) expect(candidates({ spice: 'all', level }).length).toBeGreaterThan(0);
    expect(candidates({ spice: 'all', level: 0 })).toHaveLength(PUZZLES.length);
  });
  it('원조 바다거북 스프는 매운맛이다', () => {
    expect(puzzleById('seaturtle')?.spice).toBe('dark');
  });
});

describe('pickPuzzle', () => {
  it('나온 문제는 피하고, 다 나오면 처음부터', () => {
    const f = { spice: 'mild' as const, level: 1 as const };
    const all = candidates(f).map((p) => p.id);
    const played = all.slice(0, -1);
    expect(pickPuzzle(f, played, 0.99)?.id).toBe(all[all.length - 1]);
    expect(all).toContain(pickPuzzle(f, all, 0.5)?.id);
  });
});

describe('soupReduce — AI 진행자', () => {
  const start = (): SoupState => newSoup({ players, host: 'ai', puzzle: 'elevator', filter: { spice: 'mild', level: 0 } });

  it('질문 → 답, 차례가 돈다', () => {
    let s = start();
    expect(guessers(s)).toEqual([0, 1, 2]);
    s = ok(s, { type: 'ask', by: 0, text: '  남자는 키가 작나요? ' });
    expect(s.log[0]).toMatchObject({ n: 1, by: 0, kind: 'ask', text: '남자는 키가 작나요?', reply: null });
    expect(s.turn).toBe(1);
    expect(pending(s)).toHaveLength(1);
    s = ok(s, { type: 'reply', n: 1, reply: 'yes', note: '좋은 질문이에요!' });
    expect(s.log[0]?.reply).toBe('yes');
    expect(s.log[0]?.note).toBe('좋은 질문이에요!');
    expect(pending(s)).toHaveLength(0);
  });
  it('빈 글·긴 글·없는 사람·답 종류가 틀리면 막는다', () => {
    const s = start();
    expect(soupReduce(s, { type: 'ask', by: 0, text: '  ' })).toEqual({ ok: false, error: 'empty' });
    expect(soupReduce(s, { type: 'ask', by: 0, text: 'x'.repeat(141) })).toEqual({ ok: false, error: 'long' });
    expect(soupReduce(s, { type: 'ask', by: 7, text: '예?' })).toEqual({ ok: false, error: 'who' });
    expect(soupReduce(s, { type: 'quick', by: 0, reply: 'yes' })).toEqual({ ok: false, error: 'host' });
    const q = ok(s, { type: 'ask', by: 0, text: '비와 상관있나요?' });
    expect(soupReduce(q, { type: 'reply', n: 1, reply: 'correct' })).toEqual({ ok: false, error: 'reply' });
    expect(soupReduce(q, { type: 'reply', n: 9, reply: 'yes' })).toEqual({ ok: false, error: 'entry' });
    const done = ok(q, { type: 'reply', n: 1, reply: 'yes' });
    expect(soupReduce(done, { type: 'reply', n: 1, reply: 'no' })).toEqual({ ok: false, error: 'entry' });
  });
  it('정답을 맞히면 끝나고 힌트만큼 점수가 줄어든다', () => {
    let s = start();
    s = ok(s, { type: 'hint' });
    expect(s.hints).toBe(1);
    s = ok(s, { type: 'guess', by: 2, text: '키가 작아서 버튼이 안 닿고 비 오면 우산으로 누른다' });
    s = ok(s, { type: 'reply', n: 1, reply: 'correct' });
    expect(s.phase).toBe('over');
    expect(s.solvedBy).toBe(2);
    expect(s.scores).toEqual([0, 0, pointsFor(1)]);
    expect(pointsFor(0)).toBe(3);
    expect(pointsFor(3)).toBe(1);
    expect(soupReduce(s, { type: 'ask', by: 0, text: '또?' })).toEqual({ ok: false, error: 'phase' });
  });
  it('거의 맞음은 계속, 힌트는 셋까지, 포기하면 공개', () => {
    let s = start();
    s = ok(s, { type: 'guess', by: 0, text: '키가 작다' });
    s = ok(s, { type: 'reply', n: 1, reply: 'close' });
    expect(s.phase).toBe('play');
    s = ok(ok(ok(s, { type: 'hint' }), { type: 'hint' }), { type: 'hint' });
    expect(soupReduce(s, { type: 'hint' })).toEqual({ ok: false, error: 'hints' });
    s = ok(s, { type: 'reveal' });
    expect(s.phase).toBe('over');
    expect(s.solvedBy).toBeNull();
    expect(s.scores).toEqual([0, 0, 0]);
  });
  it('다음 문제: 기록·힌트를 비우고 점수는 남긴다', () => {
    let s = start();
    s = ok(s, { type: 'guess', by: 1, text: '우산' });
    s = ok(s, { type: 'reply', n: 1, reply: 'correct' });
    expect(soupReduce(s, { type: 'next', puzzle: 'nope' })).toEqual({ ok: false, error: 'puzzle' });
    s = ok(s, { type: 'next', puzzle: 'hiccup' });
    expect(s).toMatchObject({ puzzle: 'hiccup', phase: 'play', hints: 0, round: 2, solvedBy: null, log: [] });
    expect(s.scores).toEqual([0, 3, 0]);
    expect(s.played).toEqual(['elevator', 'hiccup']);
    expect(validSoup(s)).toBe(true);
  });
  it('tally는 질문·예·정답 시도를 센다', () => {
    let s = start();
    s = ok(s, { type: 'ask', by: 0, text: 'a?' });
    s = ok(s, { type: 'reply', n: 1, reply: 'yes' });
    s = ok(s, { type: 'ask', by: 1, text: 'b?' });
    s = ok(s, { type: 'reply', n: 2, reply: 'no' });
    s = ok(s, { type: 'guess', by: 2, text: 'c' });
    expect(tally(s)).toEqual({ asks: 2, yes: 1, guesses: 1 });
  });
});

describe('soupReduce — 사람 진행자', () => {
  const start = (): SoupState => newSoup({ players, host: 'human', hostSeat: 1, puzzle: 'goldfish', filter: { spice: 'mild', level: 0 } });
  it('진행자는 묻지 못하고 차례에서 빠진다', () => {
    const s = start();
    expect(guessers(s)).toEqual([0, 2]);
    expect(s.turn).toBe(0);
    expect(soupReduce(s, { type: 'ask', by: 1, text: '예?' })).toEqual({ ok: false, error: 'who' });
    const q = ok(s, { type: 'ask', by: 0, text: '물고기인가요?' });
    expect(q.turn).toBe(2);
  });
  it('말로 한 질문은 quick으로 답만 남긴다', () => {
    let s = start();
    s = ok(s, { type: 'quick', by: 2, reply: 'partly' });
    expect(s.log[0]).toMatchObject({ by: 2, kind: 'ask', text: '', reply: 'partly' });
    expect(s.turn).toBe(0);
    expect(soupReduce(s, { type: 'quick', by: 1, reply: 'yes' })).toEqual({ ok: false, error: 'who' });
  });
  it('사람 진행은 둘 이상이어야 한다', () => {
    expect(() => newSoup({ players: players.slice(0, 1), host: 'human', puzzle: 'goldfish', filter: { spice: 'mild', level: 0 } })).toThrow();
  });
  it('validSoup는 망가진 저장본을 거른다', () => {
    const s = start();
    expect(validSoup(s)).toBe(true);
    expect(validSoup({ ...s, puzzle: 'zzz' })).toBe(false);
    expect(validSoup({ ...s, hostSeat: 5 })).toBe(false);
    expect(validSoup({ ...s, hints: 4 })).toBe(false);
    expect(validSoup({ ...s, scores: [0] })).toBe(false);
    expect(validSoup(null)).toBe(false);
  });
});

describe('AI 진행자 프롬프트와 답 읽기', () => {
  const p = puzzleById('elevator');
  if (!p) throw new Error('no puzzle');
  it('질문 프롬프트에는 전말·핵심·최근 질문·이번 질문이 들어 있다', () => {
    const s = ok(newSoup({ players, host: 'ai', puzzle: 'elevator', filter: { spice: 'mild', level: 0 } }), { type: 'ask', by: 0, text: '키가 작나요?' });
    const log = ok(s, { type: 'reply', n: 1, reply: 'yes' }).log;
    const prompt = askPrompt(p, '우산이 중요한가요?', log);
    expect(prompt).toContain(p.story);
    expect(prompt).toContain(p.answer);
    expect(prompt).toContain(p.keys[0] ?? '');
    expect(prompt).toContain('Q: 키가 작나요? → 예');
    expect(prompt).toContain('[이번 질문] 우산이 중요한가요?');
    expect(prompt).toContain('"a":"yes|no|irrelevant|partly"');
    expect(prompt.length).toBeLessThan(1600);
  });
  it('채점 프롬프트에는 번호 매긴 핵심과 참가자 답이 들어 있다', () => {
    const prompt = guessPrompt(p, '키가 작아서');
    expect(prompt).toContain('1) ' + p.keys[0]);
    expect(prompt).toContain('[참가자의 정답] 키가 작아서');
    expect(prompt).toContain('"v":"correct|close|wrong"');
  });
  it('readAnswer는 이상한 답을 너그럽게 읽는다', () => {
    expect(readAnswer({ a: 'yes', note: ' 좋은   질문 ' })).toEqual({ a: 'yes', note: '좋은 질문' });
    expect(readAnswer({ answer: 'No.' }).a).toBe('no');
    expect(readAnswer({ a: '예' }).a).toBe('yes');
    expect(readAnswer({ a: 'PARTLY' }).a).toBe('partly');
    expect(readAnswer({ a: '???' }).a).toBe('irrelevant');
    expect(readAnswer(null).a).toBe('irrelevant');
    expect(readAnswer({ a: 'yes', note: 'x'.repeat(200) }).note).toHaveLength(60);
  });
  it('readVerdict는 모르면 wrong, 맞으면 한마디를 지운다', () => {
    expect(readVerdict({ v: 'correct', note: '전말은…' })).toEqual({ v: 'correct', note: '' });
    expect(readVerdict({ verdict: 'close', note: '왜 7층인지가 빠졌어요' })).toEqual({ v: 'close', note: '왜 7층인지가 빠졌어요' });
    expect(readVerdict({ v: 'maybe' }).v).toBe('wrong');
  });
});
