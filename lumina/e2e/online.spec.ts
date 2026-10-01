import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { startBroker, type TestBroker } from './broker';

/**
 * 온라인 대전 — 브라우저 컨텍스트 둘(방장 기기·친구 기기)을 테스트 프로세스 안의 MQTT 서버(aedes)로 잇는다.
 * 앱은 ?broker=ws://127.0.0.1:포트 로 공개 중계 서버 대신 이 서버를 쓴다 (localhost에서만 받아들임).
 * 기기 둘을 띄우므로 데스크톱 프로젝트에서 한 번만 돈다.
 */
test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, '두 기기 시험은 한 번만');

let broker: TestBroker;
test.beforeAll(async () => {
  broker = await startBroker();
});
test.afterAll(async () => {
  await broker.close();
});
const withBroker = (path: string): string => `${path}${path.includes('?') ? '&' : '?'}broker=${encodeURIComponent(broker.url)}`;

interface Device {
  page: Page;
  ctx: BrowserContext;
  errors: string[];
}

async function device(browser: Browser, path = '/'): Promise<Device> {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_FAILED|fonts\.g/.test(m.text())) errors.push(m.text());
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.addInitScript((s) => {
    try {
      if (sessionStorage.getItem('e2e-init')) return;
      sessionStorage.setItem('e2e-init', '1');
      localStorage.clear();
      localStorage.setItem('lumina.settings.v1', JSON.stringify(s));
    } catch {
      /* 저장소가 막힌 환경 */
    }
  }, { aiSpeed: 'fast', hints: 'unlimited', confirmDraw: false, show3d: false });
  await page.goto(path.includes('broker=') ? path : withBroker(path));
  return { page, ctx, errors };
}

/** 방장: 방을 만들고 코드를 돌려준다 */
async function createRoom(host: Page, game: 'lumina' | 'coda'): Promise<string> {
  await expect(host.locator('.wordmark')).toHaveText('LUMINA');
  await host.locator('.plate-online').click();
  await host.locator('.ol-name').fill('방장');
  await host.locator(`.ol-game[data-game="${game}"]`).click();
  await host.locator('.ol-create').click();
  const codeEl = host.locator('.ol-code');
  await expect(codeEl).toBeVisible();
  return ((await codeEl.getAttribute('aria-label')) ?? '').replace(/\s/g, '');
}

/** 친구: 캐릭터·이름을 고르고 코드로 들어간다 */
async function joinRoom(guest: Page, code: string): Promise<void> {
  await expect(guest.locator('.wordmark')).toHaveText('LUMINA');
  await guest.locator('.plate-online').click();
  await guest.locator('.ol-pick-btn').nth(1).click();
  await guest.locator('.ol-name').fill('친구');
  await guest.locator('.ol-code-input').fill(code.toUpperCase());
  await guest.locator('.ol-join button[type=submit]').click();
}

test('온라인 루미큐브: 방 만들기 → 코드로 참가 → 친구의 첫 등록이 방장 판에 그대로', async ({ browser }) => {
  // 시드 2: 방장·친구·AI 셋이면 친구(1번 자리)가 먼저 두고 첫 차례에 등록할 수 있다 (scripts/online-check.ts)
  const host = await device(browser, '/?seed=2');
  const code = await createRoom(host.page, 'lumina');
  expect(code).toMatch(/^[a-z0-9]{6}$/);

  // 초대 링크: 친구는 링크를 열면 바로 입장 화면 → 캐릭터 고르고 "입장하기"
  const link = await host.page.locator('.ol-link').inputValue();
  expect(link).toContain(`room=${code}`);
  const guest = await device(browser, link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(guest.page.locator('.ol-invited')).toBeVisible();
  await guest.page.locator('.ol-pick-btn').nth(1).click();
  await guest.page.locator('.ol-name').fill('친구');
  await guest.page.locator('.ol-enter').click();

  // 로비: 둘 다 두 자리를 본다 → 방장이 AI를 앉히면 친구 화면에도 셋
  const seats = (p: Page) => p.locator('.ol-seat:not(.ol-seat-empty)');
  await expect(seats(host.page)).toHaveCount(2);
  await expect(seats(guest.page)).toHaveCount(2);
  await expect(guest.page.locator('.ol-wait')).toBeVisible();
  await host.page.locator('.add-seat').click();
  await expect(seats(guest.page)).toHaveCount(3);

  // 시작 → 두 기기 모두 게임 화면, 각자 자기 패 14장 (서로 다른 패)
  await host.page.locator('.ol-foot .btn-primary').click();
  await expect(host.page.locator('.game')).toBeVisible();
  await expect(guest.page.locator('.game')).toBeVisible();
  await expect(host.page.locator('.rack .tile')).toHaveCount(14);
  await expect(guest.page.locator('.rack .tile')).toHaveCount(14);
  const rackOf = async (p: Page) => (await p.locator('.rack .tile').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile-id')))).sort().join(',');
  expect(await rackOf(host.page)).not.toBe(await rackOf(guest.page));
  await expect(host.page.locator('.hud .ol-chip')).toContainText(code.toUpperCase());

  // 친구 차례: 방장은 못 두고, 친구는 힌트로 첫 등록을 만들어 낸다
  await expect(guest.page.locator('.draw-btn')).toBeEnabled();
  await expect(host.page.locator('.draw-btn')).toBeDisabled();
  // 온라인 판에는 힌트 단추가 없다 — 시험용 손잡이로 힌트 풀이를 그대로 놓는다
  expect(await guest.page.evaluate(() => (window as unknown as { __lumina: { proposeHint: () => boolean } }).__lumina.proposeHint())).toBe(true);
  const placed = await guest.page.locator('.felt .tile').count();
  expect(placed).toBeGreaterThan(0);
  await guest.page.locator('.commit-btn').click();

  // 방장 판에 같은 타일들이 올라오고, 친구 패는 그만큼 줄어든다
  await expect(host.page.locator('.felt .tile')).toHaveCount(placed);
  await expect(guest.page.locator('.rack .tile')).toHaveCount(14 - placed);
  const tableOf = async (p: Page) => (await p.locator('.felt .tile').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile-id')))).sort().join(',');
  expect(await tableOf(host.page)).toBe(await tableOf(guest.page));

  // AI 차례가 지나 방장 차례 → 방장이 뽑으면 친구 화면의 더미 수가 준다
  await expect(host.page.locator('.draw-btn')).toBeEnabled({ timeout: 45_000 });
  const pool = async (p: Page) => Number(await p.locator('.hud-pool b').innerText());
  const before = await pool(guest.page);
  await host.page.locator('.draw-btn').click();
  await expect.poll(() => pool(guest.page)).toBe(before - 1);
  await expect(host.page.locator('.rack .tile')).toHaveCount(15);

  // 다시 친구 차례: 뽑기도 방장을 거쳐 반영된다
  await expect(guest.page.locator('.draw-btn')).toBeEnabled({ timeout: 45_000 });
  const n = await guest.page.locator('.rack .tile').count();
  await guest.page.locator('.draw-btn').click();
  await expect(guest.page.locator('.rack .tile')).toHaveCount(n + 1);

  // 방장이 나가면 친구 화면에 "방을 닫았어요"
  await host.page.locator('.hud .icon-btn').first().click();
  await host.page.locator('.sheet .btn-ghost').click();
  await host.page.locator('.sheet .btn-danger').click();
  await expect(host.page.locator('.home')).toBeVisible();
  await expect(guest.page.locator('.ol-notice')).toContainText('방장이 방을 닫았어요');

  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
  await host.ctx.close();
  await guest.ctx.close();
});

/** 다빈치 코드 한 수: 지금 둘 수 있는 쪽이면 두고 무엇을 했는지 돌려준다 */
async function codaStep(p: Page): Promise<string | null> {
  // 처음 고르기·차례 뽑기: 더미에서 한 색을 가져온다
  const heap = p.locator('button.pile-heap');
  if (await heap.count()) {
    await heap.first().click();
    return 'draw';
  }
  const gap = p.locator('.code-gap');
  if (await gap.count()) {
    await gap.first().click();
    return 'place';
  }
  const stop = p.locator('.coda-actions .moves .btn-secondary');
  if (await stop.count()) {
    await stop.click();
    return 'stop';
  }
  const target = p.locator('.code-row button.ctile');
  if (await target.count()) {
    await target.first().click();
    const key = p.locator('.numpad button:not([disabled])');
    await expect(key.first()).toBeVisible();
    await key.first().click();
    return 'guess';
  }
  const own = p.locator('.my-code button.ctile, .mycode button.ctile');
  if (await own.count()) {
    await own.first().click();
    return 'reveal';
  }
  return null;
}

test('온라인 다빈치 코드: 친구의 추리를 방장이 판정하고 두 화면이 같은 판을 본다', async ({ browser }) => {
  const host = await device(browser, '/?seed=5');
  const guest = await device(browser);
  const code = await createRoom(host.page, 'coda');
  // 코드를 손으로 쳐서 들어가는 길
  await joinRoom(guest.page, code);
  await expect(host.page.locator('.ol-seat:not(.ol-seat-empty)')).toHaveCount(2);
  await host.page.locator('.ol-foot .btn-primary').click();
  await expect(host.page.locator('.coda')).toBeVisible();
  await expect(guest.page.locator('.coda')).toBeVisible();

  // 줄에 놓인 타일만 (뽑아 들고 있는 타일은 그 사람 화면에만 보인다)
  const revealed = (p: Page) => p.locator('.code-tiles .ctile[data-revealed]').count();
  let guestGuesses = 0;
  for (let i = 0; i < 40 && guestGuesses < 2; i++) {
    for (const [who, p] of [
      ['host', host.page],
      ['guest', guest.page],
    ] as const) {
      const did = await codaStep(p);
      if (did === 'guess' && who === 'guest') guestGuesses++;
      if (did) {
        // 방장의 판정(뜸 들이기 포함)과 문서 전달을 기다린다
        await p.waitForTimeout(1100);
        await expect.poll(async () => (await revealed(host.page)) === (await revealed(guest.page)), { timeout: 8000 }).toBe(true);
      }
    }
    if (await host.page.locator('.result').count()) break;
  }
  expect(guestGuesses).toBeGreaterThan(0);
  // 같은 판: 공개된 타일 수와 차례 표시가 같다
  expect(await revealed(host.page)).toBe(await revealed(guest.page));
  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
  await host.ctx.close();
  await guest.ctx.close();
});

/** 오목판의 교차점 (x, y)를 누른다 — 두 번 누르면 놓인다 */
async function goTap(p: Page, x: number, y: number, twice = true): Promise<void> {
  const box = await p.locator('.go-board').boundingBox();
  if (!box) throw new Error('no board');
  const cx = box.x + ((x + 1) / 16) * box.width;
  const cy = box.y + ((y + 1) / 16) * box.height;
  await p.mouse.click(cx, cy);
  if (twice) {
    await p.waitForTimeout(120);
    await p.mouse.click(cx, cy);
  }
}

test('온라인 오목: 초대 링크로 들어온 친구와 번갈아 두면 두 화면에 같은 돌이 놓인다', async ({ browser }) => {
  const host = await device(browser);
  await expect(host.page.locator('.wordmark')).toHaveText('LUMINA');
  await host.page.locator('.plate-online').click();
  await host.page.locator('.ol-name').fill('방장');
  await host.page.locator('.ol-game[data-game="gomoku"]').click();
  await host.page.locator('.ol-create').click();
  const link = await host.page.locator('.ol-link').inputValue();
  const guest = await device(browser, link.replace(/^https?:\/\/[^/]+/, ''));
  await guest.page.locator('.ol-name').fill('친구');
  await guest.page.locator('.ol-enter').click();
  await expect(host.page.locator('.ol-seat:not(.ol-seat-empty)')).toHaveCount(2);
  // 오목은 두 자리뿐 — AI 추가 버튼이 없다
  await expect(host.page.locator('.add-seat')).toHaveCount(0);
  await host.page.locator('.ol-foot .btn-primary').click();
  await expect(host.page.locator('.gomoku')).toBeVisible();
  await expect(guest.page.locator('.gomoku')).toBeVisible();

  // 방장(흑)이 먼저: 한가운데
  await goTap(host.page, 7, 7);
  await expect(host.page.locator('.go-stone')).toHaveCount(1);
  await expect(guest.page.locator('.go-stone')).toHaveCount(1);
  // 친구(백): 첫 번 누르면 미리보기만, 두 번째에 놓인다 → 방장이 판정해 두 화면에 같이
  await goTap(guest.page, 8, 8, false);
  await expect(guest.page.locator('.go-preview')).toHaveCount(1);
  await expect(guest.page.locator('.go-stone')).toHaveCount(1);
  await goTap(guest.page, 8, 8, false);
  await expect(host.page.locator('.go-stone')).toHaveCount(2);
  await expect(guest.page.locator('.go-stone')).toHaveCount(2);
  await expect(host.page.locator('.go-stone[data-stone="2"]')).toHaveCount(1);
  // 차례가 아닌 쪽은 둘 수 없다
  await goTap(guest.page, 3, 3);
  await expect(guest.page.locator('.go-stone')).toHaveCount(2);
  expect(host.errors).toEqual([]);
  expect(guest.errors).toEqual([]);
  await host.ctx.close();
  await guest.ctx.close();
});
