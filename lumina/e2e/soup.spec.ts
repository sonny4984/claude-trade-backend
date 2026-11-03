import { expect, test, type Page } from '@playwright/test';
import { startBroker, type TestBroker } from './broker';

/**
 * 바다거북 스프 — 한 폰으로 돌아가며: 사람 진행자(전말 몰래 보기·답 단추·말로 한 질문),
 * AI 진행자(Gemini 응답을 가짜로 바꿔 질문 답·정답 채점), AI가 없을 때 시작 막기.
 */

async function open(page: Page, keep: Record<string, unknown> = {}, path = '/?seed=3', setup = true): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_FAILED|fonts\.g/.test(m.text())) errors.push(m.text());
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript((more) => {
    try {
      if (sessionStorage.getItem('e2e-init')) return;
      sessionStorage.setItem('e2e-init', '1');
      localStorage.clear();
      localStorage.setItem('lumina.settings.v1', JSON.stringify({ show3d: false }));
      for (const [k, v] of Object.entries(more)) localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* 저장소가 막힌 환경 */
    }
  }, keep);
  await page.goto(path);
  if (!setup) return errors;
  await expect(page.locator('.wordmark')).toHaveText('LUMINA');
  await page.locator('.plate-soup').click();
  await expect(page.locator('.soup-setup')).toBeVisible();
  return errors;
}

test('바다거북 스프: 사람 진행자와 한 폰으로', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('radio', { name: '사람 진행자' }).click();
  await page.getByRole('button', { name: '시작' }).click();
  await expect(page.locator('.game.soup')).toBeVisible();
  await expect(page.locator('.soup-host-chip')).toHaveText('진행: 나');
  await expect(page.locator('.soup-story-text')).not.toBeEmpty();

  // 진행자만: 꾹 누르는 동안만 전말이 보인다
  await expect(page.locator('.soup-progress')).toHaveCount(0);
  await expect(page.locator('.soup-answer')).toHaveCount(0);
  const peek = page.locator('.soup-peek');
  const box = await peek.boundingBox();
  if (!box) throw new Error('no peek button');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator('.soup-answer')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.soup-answer')).toHaveCount(0);

  // 진행자는 묻는 사람 목록에 없다
  const askers = page.locator('.soup-asker');
  await expect(askers).toHaveText(['여자친구', '동생']);
  await askers.filter({ hasText: '여자친구' }).click();
  await page.locator('.soup-input .text-input').fill('사람이 나오나요?');
  await page.locator('.soup-ask').click();
  const first = page.locator('.soup-entry').first();
  await expect(first.locator('.soup-q')).toHaveText('사람이 나오나요?');
  await first.locator('.soup-reply-btns').getByRole('button', { name: '예', exact: true }).click();
  await expect(first.locator('.soup-reply')).toHaveText('예');

  // 말로 한 질문: 답 단추만
  await page.locator('.soup-quick').getByRole('button', { name: '아니요' }).click();
  await expect(page.locator('.soup-entry').nth(1).locator('.soup-q')).toHaveText('(말로 한 질문)');
  await expect(page.locator('.soup-entry').nth(1).locator('.soup-reply')).toHaveText('아니요');

  // 힌트 하나 → 정답 → 2점
  await page.locator('.soup-hint').click();
  await expect(page.locator('.soup-hints li')).toHaveCount(1);
  await askers.filter({ hasText: '동생' }).click();
  await page.locator('.soup-input .text-input').fill('전말은 이거예요');
  await page.locator('.soup-guess').click();
  const guess = page.locator('.soup-entry[data-kind="guess"]');
  await guess.getByRole('button', { name: '정답!' }).click();
  await expect(page.locator('.soup-result h2')).toHaveText('동생 정답! +2점');
  await expect(page.locator('.soup-answer')).toBeVisible();

  await page.locator('.soup-next').click();
  await expect(page.locator('.hud-turn-text')).toHaveText('2번째 문제');
  await expect(page.locator('.soup-entry')).toHaveCount(0);

  // 나갔다 와도 이어서
  await page.reload();
  await expect(page.locator('.wordmark')).toHaveText('LUMINA');
  await page.locator('.plate-soup').click();
  await page.getByRole('button', { name: /이어서 하기/ }).click();
  await expect(page.locator('.hud-turn-text')).toHaveText('2번째 문제');
  expect(errors).toEqual([]);
});

test('바다거북 스프: AI 진행자 (Gemini 응답 흉내)', async ({ page }) => {
  const prompts: string[] = [];
  await page.route(/generativelanguage\.googleapis\.com/, async (r) => {
    const body = (r.request().postDataJSON() ?? {}) as { contents?: { parts?: { text?: string }[] }[] };
    const prompt = body.contents?.[0]?.parts?.[0]?.text ?? '';
    prompts.push(prompt);
    const out = prompt.includes('[참가자의 정답]') ? { v: 'correct', note: '' } : { a: 'yes', note: '좋은 질문이에요!', k: [1] };
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }) });
  });
  const errors = await open(page, { 'lumina.gemini.v1': { key: 'e2e-not-a-key', model: 'gemini-e2e', models: ['gemini-e2e'] } });
  await expect(page.locator('.soup-start')).toBeEnabled();
  await page.locator('.soup-start').click();
  await expect(page.locator('.soup-host-chip')).toHaveText(/AI 진행/);
  await expect(page.locator('.soup-peek')).toHaveCount(0);

  await page.locator('.soup-input .text-input').fill('날씨와 상관있나요?');
  await page.locator('.soup-ask').click();
  await expect(page.locator('.soup-entry').first().locator('.soup-reply')).toContainText('예');
  await expect(page.locator('.soup-entry').first().locator('.soup-reply small')).toHaveText('좋은 질문이에요!');
  await expect(page.locator('.soup-host-chip')).toHaveText('AI 진행 · Gemini');
  // 진척도: 짚은 핵심 하나가 켜지고 기록에 '핵심!'
  await expect(page.locator('.soup-progress b')).toHaveText(/^1\/\d$/);
  await expect(page.locator('.soup-hit-tag')).toHaveText('핵심!');

  await page.locator('.soup-input .text-input').fill('이렇게 된 거예요');
  await page.locator('.soup-guess').click();
  await expect(page.locator('.soup-result h2')).toHaveText(/정답! \+3점/);
  expect(prompts.some((p) => p.includes('[이번 질문] 날씨와 상관있나요?'))).toBe(true);
  expect(prompts.some((p) => p.includes('[참가자의 정답] 이렇게 된 거예요'))).toBe(true);
  expect(errors).toEqual([]);
});

test('바다거북 스프: AI가 없으면 AI 진행은 시작할 수 없다', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('.soup-warn')).toBeVisible();
  await expect(page.locator('.soup-start')).toBeDisabled();
  // 순한맛 기본, 매운맛을 켜면 문제가 늘어난다
  const count = page.locator('.soup-setup .mf-sub').filter({ hasText: '고를 수 있는 문제' });
  const before = await count.textContent();
  await page.getByText('매운맛 문제 포함').click();
  await expect(count).not.toHaveText(before ?? '');
  await page.getByRole('radio', { name: '사람 진행자' }).click();
  await expect(page.locator('.soup-start')).toBeEnabled();
  expect(errors).toEqual([]);
});

test.describe('온라인', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, '두 기기 시험은 한 번만');
  let broker: TestBroker;
  test.beforeAll(async () => {
    broker = await startBroker();
  });
  test.afterAll(async () => {
    await broker.close();
  });

  test('방장이 진행자, 친구가 묻고 맞힌다', async ({ browser }) => {
    const withBroker = (p: string): string => `${p}${p.includes('?') ? '&' : '?'}broker=${encodeURIComponent(broker.url)}`;
    const hostCtx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const host = await hostCtx.newPage();
    const errors = [await open(host, {}, withBroker('/?seed=3'), false)];
    await expect(host.locator('.wordmark')).toHaveText('LUMINA');
    await host.locator('.plate-online').click();
    await host.locator('.ol-name').fill('방장');
    await host.locator('.ol-game[data-game="soup"]').click();
    await host.locator('.ol-create').click();
    const link = await host.locator('.ol-link').inputValue();
    const path = link.replace(/^https?:\/\/[^/]+/, '');
    const gctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const guest = await gctx.newPage();
    errors.push(await open(guest, {}, path.includes('broker=') ? path : withBroker(path), false));
    await guest.locator('.ol-name').fill('여자친구');
    await guest.locator('.ol-enter').click();
    await expect(host.locator('.ol-seat:not(.ol-seat-empty)')).toHaveCount(2);
    await host.getByText('방장이 진행자').click();
    await host.getByRole('button', { name: '시작하기' }).click();

    for (const p of [host, guest]) await expect(p.locator('.game.soup')).toBeVisible();
    // 방장(진행자)만 전말 보기 단추가 있고 질문 칸이 없다
    await expect(host.locator('.soup-peek')).toBeVisible();
    await expect(host.locator('.soup-input')).toHaveCount(0);
    await expect(guest.locator('.soup-peek')).toHaveCount(0);
    const story = await host.locator('.soup-story-text').textContent();
    await expect(guest.locator('.soup-story-text')).toHaveText(story ?? '');

    await guest.locator('.soup-input .text-input').fill('동물이 나오나요?');
    await guest.locator('.soup-ask').click();
    await expect(host.locator('.soup-entry .soup-q')).toHaveText('동물이 나오나요?');
    await expect(guest.locator('.soup-entry .soup-reply')).toContainText('진행자의 답을 기다려요');
    await host.locator('.soup-reply-btns').getByRole('button', { name: '아니요' }).click();
    await expect(guest.locator('.soup-entry .soup-reply')).toHaveText('아니요');

    await guest.locator('.soup-hint').click();
    await expect(host.locator('.soup-hints li')).toHaveCount(1);
    await guest.locator('.soup-input .text-input').fill('이런 일이에요');
    await guest.locator('.soup-guess').click();
    await host.locator('.soup-entry[data-kind="guess"]').getByRole('button', { name: '정답!' }).click();
    for (const p of [host, guest]) await expect(p.locator('.soup-result h2')).toHaveText('여자친구 정답! +2점');
    // 손님은 전말을 보고, 다음 문제는 방장이 연다
    await expect(guest.locator('.soup-answer')).toBeVisible();
    await expect(guest.locator('.soup-next')).toHaveCount(0);
    await host.locator('.soup-next').click();
    for (const p of [host, guest]) await expect(p.locator('.hud-turn-text')).toHaveText('2번째 문제');
    await hostCtx.close();
    await gctx.close();
    expect(errors.flat()).toEqual([]);
  });
});
