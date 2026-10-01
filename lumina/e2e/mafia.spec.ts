import { expect, test, type Page } from '@playwright/test';
import { startBroker, type TestBroker } from './broker';

/**
 * 마피아 — AI 친구들과 한 판: 밤 → 낮 대화(내 말에 지목된 친구가 해명) → 투표 → 다음 밤.
 * 게임 속 상태는 localhost에서만 열리는 시험용 손잡이(window.__mafia)로 읽는다.
 */

interface Hook {
  store: { getState: () => { session: { game: { phase: string; players: { alive: boolean }[] }; online: { mySeat: number } | null } | null } };
}

async function open(page: Page, path = '/', home = true): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_FAILED|fonts\.g/.test(m.text())) errors.push(m.text());
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript(() => {
    try {
      if (sessionStorage.getItem('e2e-init')) return;
      sessionStorage.setItem('e2e-init', '1');
      localStorage.clear();
      localStorage.setItem('lumina.settings.v1', JSON.stringify({ show3d: false }));
      localStorage.setItem('lumina.mafia.setup.v1', JSON.stringify({ count: 7, me: 'moka', role: 'random', voice: false, claude: false }));
    } catch {
      /* 저장소가 막힌 환경 */
    }
  });
  await page.goto(path);
  if (home) await expect(page.locator('.wordmark')).toHaveText('LUMINA');
  return errors;
}

const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __mafia: Hook }).__mafia.store.getState().session;
    const seat = s?.online?.mySeat ?? 0;
    return { phase: s?.game.phase ?? '', alive: s?.game.players[seat]?.alive ?? false };
  });

/** 밤: 고를 게 있으면 첫 친구를 골라 정하고, 아니면 잠든다 */
async function actNight(page: Page): Promise<void> {
  if (!(await state(page)).alive) return;
  const sleep = page.getByRole('button', { name: '잠들기' });
  if (await sleep.isVisible()) return sleep.click();
  await page.locator('.mf-tile[aria-disabled="false"]').first().click();
  await page.getByRole('button', { name: /(노리기|조사하기|지키기)$/ }).click();
}

test('마피아: AI 친구들과 밤·낮 대화·투표', async ({ page }) => {
  const errors = await open(page);
  await page.locator('.plate-mafia').click();
  await expect(page.locator('.mafia-setup')).toBeVisible();
  await page.getByRole('radio', { name: '7명' }).click();
  await page.getByRole('radio', { name: '시민', exact: true }).click();
  // claude.ai 밖에서는 Claude 대신 Gemini 연결 칸이 보인다
  await expect(page.locator('.mf-gemini')).toContainText('Gemini로 대화하기');
  await page.getByRole('button', { name: '시작하기' }).click();

  await expect(page.locator('.mafia-screen')).toBeVisible();
  await expect(page.locator('.mf-tile')).toHaveCount(7);
  await expect(page.locator('.mf-line[data-kind="secret"]').first()).toContainText('시민');

  // 밤: 시민은 잠든다 → 아침이 밝고 AI 친구들이 말한다
  await page.getByRole('button', { name: '잠들기' }).click();
  await expect(page.locator('.mf-line[data-kind="sys"]', { hasText: '아침이 밝았어요' })).toBeVisible();
  await expect(page.locator('.mf-line[data-kind="say"]').first()).toBeVisible();

  if ((await state(page)).alive) {
    // 살아 있는 AI 친구 하나를 의심하면 그 친구가 해명한다
    if (await page.locator('.mf-skip').isVisible()) await page.locator('.mf-skip').click();
    const tile = page.locator('.mf-tile:not([data-me]):not([data-dead])').first();
    const name = (await tile.locator('.mf-name').innerText()).trim();
    const before = await page.locator('.mf-line[data-kind="say"]').count();
    await page.getByPlaceholder('하고 싶은 말').fill(`${name} 수상해`);
    await page.getByRole('button', { name: '보내기' }).click();
    await expect(page.locator('.mf-line[data-mine]').last()).toContainText(`${name} 수상해`);
    await expect(page.locator('.mf-line[data-kind="say"]').nth(before)).toContainText(name);

    // 빠른 말: 친구를 고르고 "믿어"
    await tile.click();
    await page.getByRole('button', { name: `${name} 믿어` }).click();
    await expect(page.locator('.mf-line[data-mine]').last()).toContainText(`${name}`);
    await page.getByRole('button', { name: '투표하러 가기' }).click();
    await expect(page.locator('.mf-head h1')).toContainText('투표');
    await page.locator('.mf-tile:not([data-me]):not([data-dead])').first().click();
    await page.getByRole('button', { name: /에게 투표$/ }).click();
  } else {
    await page.getByRole('button', { name: '투표 보기' }).click();
    await page.getByRole('button', { name: '투표 보기' }).click();
  }
  await expect(page.locator('.mf-line[data-kind="vote"]').first()).toBeVisible();
  const after = await state(page);
  expect(['night', 'over']).toContain(after.phase);
  if (after.phase === 'night') await expect(page.locator('.mf-head h1')).toContainText('2일째 밤');
  expect(errors).toEqual([]);
});

test('Gemini 키를 연결하면 AI 친구들이 Gemini가 쓴 말로 대꾸한다 (일상 대화는 자유 대화로)', async ({ page }) => {
  const prompts: string[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ json: { models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent'] }] } });
    expect(req.headers()['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(req.postData() ?? '{}') as { contents: { parts: { text: string }[] }[] };
    const prompt = body.contents[0]?.parts[0]?.text ?? '';
    prompts.push(prompt);
    const ids = [...prompt.matchAll(/\{"id":(\d+)/g)].map((m) => Number(m[1]));
    const text = JSON.stringify({ lines: ids.map((id) => ({ id, text: `꾸잉! 제미나이가 쓴 말 ${id}` })) });
    return route.fulfill({ json: { candidates: [{ content: { parts: [{ text }] } }] } });
  });
  const errors = await open(page);
  await page.locator('.plate-mafia').click();
  await page.getByPlaceholder('Gemini API 키 붙여넣기').fill('test-key');
  await page.getByRole('button', { name: '연결', exact: true }).click();
  await expect(page.locator('.mf-gemini')).toContainText('연결됨 · gemini-3.8-flash');
  await page.getByRole('radio', { name: '7명' }).click();
  await page.getByRole('radio', { name: '시민', exact: true }).click();
  await page.getByRole('radio', { name: '끄기' }).click();
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.mf-claude', { hasText: 'Gemini' })).toBeVisible();

  await page.getByRole('button', { name: '잠들기' }).click();
  await expect(page.locator('.mf-line[data-kind="say"]').first()).toContainText('제미나이가 쓴 말');
  expect(prompts[0]).toContain('기니피그');
  if ((await state(page)).alive) {
    if (await page.locator('.mf-skip').isVisible()) await page.locator('.mf-skip').click();
    const before = await page.locator('.mf-line[data-kind="say"]').count();
    await page.getByPlaceholder('하고 싶은 말').fill('다들 오늘 아침 뭐 먹었어?');
    await page.getByRole('button', { name: '보내기' }).click();
    await expect(page.locator('.mf-line[data-kind="say"]').nth(before)).toContainText('제미나이가 쓴 말');
    const last = prompts[prompts.length - 1] ?? '';
    expect(last).toContain('자유 대화');
    expect(last).toContain('다들 오늘 아침 뭐 먹었어?');
  }
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

  test('방장과 친구 둘이 AI 둘과 한 판: 각자 역할, 셋 다 정해야 아침, 서로의 말, 모두 모여야 투표', async ({ browser }) => {
    const withBroker = (p: string): string => `${p}${p.includes('?') ? '&' : '?'}broker=${encodeURIComponent(broker.url)}`;
    const hostCtx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const host = await hostCtx.newPage();
    const errors = [await open(host, withBroker('/'))];
    await host.locator('.plate-online').click();
    await host.locator('.ol-name').fill('방장');
    await host.locator('.ol-game[data-game="mafia"]').click();
    await host.locator('.ol-create').click();
    const link = await host.locator('.ol-link').inputValue();
    const path = link.replace(/^https?:\/\/[^/]+/, '');
    const guests: Page[] = [];
    const contexts = [hostCtx];
    for (const name of ['여자친구', '동생']) {
      const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
      contexts.push(ctx);
      const g = await ctx.newPage();
      errors.push(await open(g, path.includes('broker=') ? path : withBroker(path), false));
      await g.locator('.ol-name').fill(name);
      await g.locator('.ol-enter').click();
      guests.push(g);
      await expect(host.locator('.ol-seat:not(.ol-seat-empty)')).toHaveCount(guests.length + 1);
    }
    await expect(host.locator('.ol-note', { hasText: 'AI 친구가 채워요' })).toBeVisible();
    await host.getByRole('button', { name: '시작하기' }).click();
    const all = [host, ...guests];

    // 모두 같은 판 (사람 셋 + AI 둘), 각자 자기 역할만 안다
    for (const p of all) {
      await expect(p.locator('.mafia-screen')).toBeVisible();
      await expect(p.locator('.mf-tile')).toHaveCount(5);
      await expect(p.locator('.mf-line[data-kind="secret"]').first()).toContainText('당신은');
      await expect(p.locator('.mf-tile[data-human]')).toHaveCount(2);
    }

    // 밤: 셋 다 정해야 아침이 온다 (둘만 정하면 아직 밤)
    await actNight(host);
    await actNight(guests[0] as Page);
    await expect(host.locator('.mf-head h1')).toContainText('밤');
    await actNight(guests[1] as Page);
    for (const p of all) await expect(p.locator('.mf-line[data-kind="sys"]', { hasText: '아침이 밝았어요' })).toBeVisible();

    const st = await Promise.all(all.map((p) => state(p)));
    if (st[0]?.phase === 'day') {
      const alive = all.filter((_, i) => st[i]?.alive);
      // 서로의 말이 보인다
      const speaker = alive[alive.length - 1];
      if (speaker) {
        await speaker.getByPlaceholder('하고 싶은 말').fill('다들 누가 수상해?');
        await speaker.getByRole('button', { name: '보내기' }).click();
        for (const p of all) await expect(p.locator('.mf-line[data-kind="chat"]', { hasText: '다들 누가 수상해?' })).toBeVisible();
      }
      // 투표: 살아 있는 사람이 모두 "투표하러 가기"를 눌러야 넘어간다
      for (const p of alive) await p.getByRole('button', { name: /^투표하러 가기/ }).click();
      for (const p of all) await expect(p.locator('.mf-head h1')).toContainText('투표');
      for (const p of alive) {
        await p.locator('.mf-tile[aria-disabled="false"]').first().click();
        await p.getByRole('button', { name: /에게 투표$/ }).click();
      }
      for (const p of all) await expect(p.locator('.mf-line[data-kind="vote"]').first()).toBeVisible();
      for (const p of all) expect(['night', 'over']).toContain((await state(p)).phase);
    }
    for (const e of errors) expect(e).toEqual([]);
    for (const c of contexts) await c.close();
  });
});
