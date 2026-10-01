import { expect, test, type Page } from '@playwright/test';
import { startBroker, type TestBroker } from './broker';

/**
 * 마피아 — AI 친구들과 한 판: 밤 → 낮 대화(내 말에 지목된 친구가 해명) → 투표 → 다음 밤.
 * 게임 속 상태는 localhost에서만 열리는 시험용 손잡이(window.__mafia)로 읽는다.
 */

interface Hook {
  store: { getState: () => { session: { game: { phase: string; players: { alive: boolean }[] }; online: { mySeat: number } | null } | null } };
}

/** setup: 마피아 준비 설정에 덧붙일 값 · keep: 처음 열 때 저장소에 함께 넣을 값 */
async function open(page: Page, path = '/', home = true, setup: Record<string, unknown> = {}, keep: Record<string, unknown> = {}): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_FAILED|fonts\.g/.test(m.text())) errors.push(m.text());
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript(
    ([extra, more]) => {
      try {
        if (sessionStorage.getItem('e2e-init')) return;
        sessionStorage.setItem('e2e-init', '1');
        localStorage.clear();
        localStorage.setItem('lumina.settings.v1', JSON.stringify({ show3d: false }));
        localStorage.setItem('lumina.mafia.setup.v1', JSON.stringify({ count: 7, me: 'moka', role: 'random', voice: false, claude: false, ...extra }));
        for (const [k, v] of Object.entries(more)) localStorage.setItem(k, JSON.stringify(v));
      } catch {
        /* 저장소가 막힌 환경 */
      }
    },
    [setup, keep] as const,
  );
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

/** 변론·찬반 투표에서 이 화면이 할 일이 있으면 한 번 한다 (변론 마치기 / 찬성 / 지켜보며 넘기기) */
async function verdictStep(page: Page): Promise<void> {
  for (const name of ['변론 마치기', '찬성 (처형)', '투표 보기']) {
    const b = page.getByRole('button', { name, exact: true });
    if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
      await b.click().catch(() => undefined);
      return;
    }
  }
}

/** 모든 화면이 밤(또는 끝)에 이를 때까지 변론·찬반을 진행 */
async function finishVerdict(pages: Page[]): Promise<void> {
  for (let i = 0; i < 80; i++) {
    const st = await Promise.all(pages.map((p) => state(p)));
    if (st.every((x) => x.phase === 'night' || x.phase === 'over')) return;
    for (const p of pages) await verdictStep(p);
    await pages[0]?.waitForTimeout(250);
  }
  throw new Error('찬반 투표가 끝나지 않음');
}

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
  await expect(page.locator('#mf-ai-talk')).toContainText('Gemini로 대화하기');
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
  // 지목 투표 1등은 최후의 변론 → 찬반 투표 (동점이면 바로 밤)
  await finishVerdict([page]);
  await expect(page.locator('.mf-line[data-kind="vote"]').first()).toBeVisible();
  const after = await state(page);
  expect(['night', 'over']).toContain(after.phase);
  if (after.phase === 'night') await expect(page.locator('.mf-head h1')).toContainText('2일째 밤');
  expect(errors).toEqual([]);
});

test('Gemini 키를 연결하면 AI 친구들이 Gemini가 쓴 말로 대꾸한다 (절약 모드: 내가 말할 때만, 한 친구만)', async ({ page }) => {
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
  // 절약 모드는 기본으로 켜져 있다
  await expect(page.getByRole('checkbox', { name: /절약 모드/ })).toBeChecked();
  const probes = prompts.length;
  await page.getByRole('radio', { name: '7명' }).click();
  await page.getByRole('radio', { name: '시민', exact: true }).click();
  await page.getByRole('radio', { name: '끄기' }).click();
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.mf-claude', { hasText: 'Gemini' })).toBeVisible();

  // 아침 인사는 기본 대사 (Gemini를 부르지 않는다)
  await page.getByRole('button', { name: '잠들기' }).click();
  await expect(page.locator('.mf-line[data-kind="say"]').first()).toBeVisible();
  await expect(page.locator('.mf-line[data-kind="say"]').first()).not.toContainText('제미나이가 쓴 말');
  expect(prompts.length).toBe(probes);
  if ((await state(page)).alive) {
    if (await page.locator('.mf-skip').isVisible()) await page.locator('.mf-skip').click();
    const before = await page.locator('.mf-line[data-kind="say"]').count();
    await page.getByPlaceholder('하고 싶은 말').fill('다들 오늘 아침 뭐 먹었어?');
    await page.getByRole('button', { name: '보내기' }).click();
    await expect(page.locator('.mf-line[data-kind="say"]').nth(before)).toContainText('제미나이가 쓴 말');
    expect(prompts.length).toBe(probes + 1);
    const last = prompts[prompts.length - 1] ?? '';
    expect(last).toContain('기니피그');
    expect(last).toContain('자유 대화');
    expect(last).toContain('다들 오늘 아침 뭐 먹었어?');
    // 대답하는 친구 한 명만
    expect([...last.matchAll(/\{"id":\d+,"name"/g)].length).toBe(1);
  }
  expect(errors).toEqual([]);
});

test('Gemini 키 링크(#gemini=키)로 열면 키가 들어가고 주소에서는 지워진다', async ({ page }) => {
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { models: [{ name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }] } });
    return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] } });
  });
  const errors = await open(page, '/#gemini=link-key', false);
  await expect(page.locator('.mafia-setup')).toBeVisible();
  await expect(page.locator('.mf-gemini')).toContainText('연결됨 · gemini-3.5-flash');
  expect(page.url()).not.toContain('link-key');
  expect(await page.evaluate(() => localStorage.getItem('lumina.gemini.v1'))).toContain('link-key');
  expect(errors).toEqual([]);
});

test('Claude 하루 한도: 넘으면 내일까지 잠그고 기본 대사로 (아티팩트)', async ({ page }) => {
  // claude.ai 아티팩트 흉내: Claude를 부를 수 있고, 오늘 한도를 거의 다 쓴 상태
  await page.addInitScript(() => {
    const w = window as unknown as { claude: unknown; __calls: number };
    w.__calls = 0;
    const json = async (prompt: string): Promise<unknown> => {
      w.__calls++;
      const ids = [...prompt.matchAll(/\{"id":(\d+),"name"/g)].map((m) => Number(m[1]));
      return { lines: ids.map((id) => ({ id, text: `꾸잉! 클로드가 쓴 말 ${id}` })) };
    };
    w.claude = { use: async (name: string) => (name === 'sample' ? { json } : null) };
  });
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const errors = await open(page, '/', true, { claude: true, role: 'mafia' }, { 'lumina.claude.usage.v1': { day, used: 19500 } });
  const calls = (): Promise<number> => page.evaluate(() => (window as unknown as { __calls: number }).__calls);
  await page.locator('.plate-mafia').click();
  await expect(page.locator('#mf-ai-talk')).toContainText('오늘 Claude 사용: 약 19,500 / 20,000 토큰');
  await page.getByRole('radio', { name: '7명' }).click();
  await page.getByRole('button', { name: '시작하기' }).click();
  await expect(page.locator('.mf-claude[aria-pressed="true"]')).toBeVisible();
  // 마피아라 밤에 살아남는다: 노릴 친구를 고르면 아침
  await actNight(page);
  await expect(page.locator('.mf-line[data-kind="sys"]', { hasText: '아침이 밝았어요' })).toBeVisible();
  expect(await calls()).toBe(0);
  if (await page.locator('.mf-skip').isVisible()) await page.locator('.mf-skip').click();

  // 한 번은 Claude가 쓰고, 그걸로 한도를 넘어 잠긴다
  let before = await page.locator('.mf-line[data-kind="say"]').count();
  await page.getByPlaceholder('하고 싶은 말').fill('다들 오늘 아침 뭐 먹었어?');
  await page.getByRole('button', { name: '보내기' }).click();
  await expect(page.locator('.mf-line[data-kind="say"]').nth(before)).toContainText('클로드가 쓴 말');
  expect(await calls()).toBe(1);
  await expect(page.locator('.mf-note')).toContainText('내일까지 잠갔어요');
  await expect(page.locator('.mf-claude')).toBeDisabled();

  // 잠긴 뒤에는 부르지 않는다
  if (await page.locator('.mf-skip').isVisible()) await page.locator('.mf-skip').click();
  before = await page.locator('.mf-line[data-kind="say"]').count();
  await page.getByPlaceholder('하고 싶은 말').fill('그럼 점심은?');
  await page.getByRole('button', { name: '보내기' }).click();
  await expect(page.locator('.mf-line[data-kind="say"]').nth(before)).toBeVisible();
  await expect(page.locator('.mf-line[data-kind="say"]').nth(before)).not.toContainText('클로드가 쓴 말');
  expect(await calls()).toBe(1);
  expect(errors).toEqual([]);
});

test('기니피그 목소리: 아이폰처럼 손을 뗄 때만 소리를 깨워도 들리고, 무음 모드에서도 재생으로', async ({ page }) => {
  // 아이폰 흉내: 누르는 순간(pointerdown)에는 소리를 못 깨우고, 클릭·손 떼기·키 입력에서만 깨운다
  await page.addInitScript(() => {
    const ok = new Set(['click', 'pointerup', 'touchend', 'keydown']);
    const Real = window.AudioContext;
    const w = window as unknown as { __ac: { on: boolean; started: number } | null };
    w.__ac = null;
    class Phone extends Real {
      on = false;
      started = 0;
      constructor(o?: AudioContextOptions) {
        super(o);
        w.__ac = this;
      }
      override get state(): AudioContextState {
        return this.on ? 'running' : 'suspended';
      }
      override resume(): Promise<void> {
        if (window.event && ok.has(window.event.type)) this.on = true;
        return Promise.resolve();
      }
      override createOscillator(): OscillatorNode {
        const o = super.createOscillator();
        const start = o.start.bind(o);
        o.start = (t?: number) => {
          this.started++;
          start(t);
        };
        return o;
      }
    }
    window.AudioContext = Phone;
    Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true });
  });
  const errors = await open(page, '/', true, { voice: 'squeak', role: 'citizen' });
  const audio = () =>
    page.evaluate(() => {
      const w = window as unknown as { __ac: { on: boolean; started: number } | null };
      return { on: w.__ac?.on ?? false, started: w.__ac?.started ?? 0, session: (navigator as unknown as { audioSession: { type: string } }).audioSession.type };
    });
  await page.locator('.plate-mafia').click();
  await expect(page.locator('.mafia-setup')).toBeVisible();
  await expect.poll(async () => (await audio()).session).toBe('playback');
  await page.getByRole('radio', { name: '7명' }).click();
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.getByRole('button', { name: '잠들기' }).click();
  await expect(page.locator('.mf-line[data-kind="say"]').first()).toBeVisible();
  await expect.poll(async () => (await audio()).started, { timeout: 8000 }).toBeGreaterThan(0);
  expect((await audio()).on).toBe(true);
  // 목소리를 끄면 무음 모드를 다시 따른다
  await page.locator('.mf-head [data-voice]').click();
  await expect.poll(async () => (await audio()).session).toBe('auto');
  expect(errors).toEqual([]);
});

test('기니피그 목소리는 실제로 소리가 난다 (들어 보기를 녹음해 크기 재기)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __off: OfflineAudioContext | null };
    w.__off = null;
    class Tape extends OfflineAudioContext {
      constructor() {
        super(1, 48000 * 3, 48000);
        w.__off = this;
      }
      override get state(): AudioContextState {
        return 'running';
      }
      override resume(): Promise<void> {
        return Promise.resolve();
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = Tape;
  });
  const errors = await open(page, '/', true, { voice: 'squeak' });
  await page.locator('.plate-mafia').click();
  await page.getByRole('button', { name: '들어 보기' }).click();
  const level = await page.evaluate(async () => {
    const off = (window as unknown as { __off: OfflineAudioContext }).__off;
    const buf = await off.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0;
    let sum = 0;
    for (const x of d) {
      peak = Math.max(peak, Math.abs(x));
      sum += x * x;
    }
    return { peak, rms: Math.sqrt(sum / d.length) };
  });
  expect(level.peak).toBeGreaterThan(0.05);
  expect(level.rms).toBeGreaterThan(0.005);
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
      // 변론대에 선 친구가 있으면 최후의 변론과 찬반 투표 (살아 있는 사람이 모두 정해야 끝난다)
      await finishVerdict(all);
      for (const p of all) expect(['night', 'over']).toContain((await state(p)).phase);
    }
    for (const e of errors) expect(e).toEqual([]);
    for (const c of contexts) await c.close();
  });
});
