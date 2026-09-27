import { expect, test, type Page } from '@playwright/test';
import { startBroker, type TestBroker } from './broker';

/**
 * 불과 얼음 — 혼자 하기(움직이기·바꾸기·통과·다음 단계)와 온라인(두 기기의 몸·사탕·다시 하기가 맞는지).
 * 캔버스 속 위치는 localhost에서만 열리는 시험용 손잡이(window.__fireice)로 읽는다.
 */

interface Hook {
  runtime: { world: { bodies: Record<'fire' | 'ice', { x: number; y: number; atDoor: boolean }>; gems: boolean[]; level: { door: Record<'fire' | 'ice', { x: number; y: number }> } } | null; puppet: unknown };
  store: { getState: () => { session: { attempt: number; level: number; status: string } | null } };
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
    } catch {
      /* 저장소가 막힌 환경 */
    }
  });
  await page.goto(path);
  if (home) await expect(page.locator('.wordmark')).toHaveText('LUMINA');
  return errors;
}

const body = (page: Page, el: 'fire' | 'ice') => page.evaluate((e) => (window as unknown as { __fireice: Hook }).__fireice.runtime.world?.bodies[e].x ?? -1, el);
const session = (page: Page) => page.evaluate(() => (window as unknown as { __fireice: Hook }).__fireice.store.getState().session);

/** 조건이 맞을 때까지 오른쪽/왼쪽으로 달린다 — 터치 기기는 화면 버튼, 아니면 키보드 */
async function runUntil(page: Page, dir: 'left' | 'right', touch: boolean, done: () => Promise<boolean>): Promise<void> {
  let release: () => Promise<void>;
  if (touch) {
    const btn = page.locator(`.fi-pad-btn[data-k="${dir}"]`).first();
    const box = await btn.boundingBox();
    if (!box) throw new Error('no pad button');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    release = () => page.mouse.up();
  } else {
    const key = dir === 'left' ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.down(key);
    release = () => page.keyboard.up(key);
  }
  try {
    await expect.poll(done, { timeout: 8000, intervals: [50] }).toBe(true);
  } finally {
    await release();
  }
}

test('불과 얼음 혼자 하기: 움직이고, 바꾸고, 둘 다 문에 서면 통과 → 다음 단계가 열린다', async ({ page }, info) => {
  const touch = info.project.name === 'phone';
  const errors = await open(page);
  await page.locator('.plate-fireice').click();
  await expect(page.locator('.fi-level')).toHaveCount(6);
  await expect(page.locator('.fi-level').nth(1)).toBeDisabled();
  await page.locator('.screen-foot .btn-primary').click();
  await expect(page.locator('.fireice')).toBeVisible();
  await expect(page.locator('.fi-canvas')).toBeVisible();

  // 불이 오른쪽으로
  const f0 = await body(page, 'fire');
  await runUntil(page, 'right', touch, async () => (await body(page, 'fire')) > f0 + 1);
  // 얼음으로 바꿔 왼쪽으로 (불은 그대로)
  const i0 = await body(page, 'ice');
  const f1 = await body(page, 'fire');
  if (touch) await page.locator('.fi-swap').click();
  else await page.keyboard.press('ArrowDown');
  await runUntil(page, 'left', touch, async () => (await body(page, 'ice')) < i0 - 1);
  expect(Math.abs((await body(page, 'fire')) - f1)).toBeLessThan(0.3);

  // 둘을 문 앞으로 옮기면 통과 창
  await page.evaluate(() => {
    const w = (window as unknown as { __fireice: Hook }).__fireice.runtime.world;
    if (!w) return;
    for (const el of ['fire', 'ice'] as const) {
      const d = w.level.door[el];
      w.bodies[el].x = d.x + 0.16;
      w.bodies[el].y = d.y + 1 - 0.86 - 0.001;
    }
  });
  await expect(page.locator('.fi-result')).toBeVisible();
  await expect(page.locator('.fi-star[data-on]')).not.toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lumina.fireice.v1') ?? '{}'));
  expect(saved.picnic?.stars).toBeGreaterThanOrEqual(1);
  await page.locator('.fi-result .btn-primary').click();
  await expect(page.locator('.hud-turn-text')).toHaveText('잼과 물');
  await expect.poll(async () => (await session(page))?.level).toBe(1);
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

  test('불과 얼음 온라인: 친구 몸이 따라 움직이고, 사탕과 다시 하기가 두 화면에 같이', async ({ browser }) => {
    const withBroker = (p: string): string => `${p}${p.includes('?') ? '&' : '?'}broker=${encodeURIComponent(broker.url)}`;
    const hostCtx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const host = await hostCtx.newPage();
    const hostErrors = await open(host, withBroker('/'));
    await host.locator('.plate-online').click();
    await host.locator('.ol-name').fill('방장');
    await host.locator('.ol-game[data-game="fireice"]').click();
    await host.locator('.ol-create').click();
    const link = await host.locator('.ol-link').inputValue();
    const guestCtx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const guest = await guestCtx.newPage();
    const path = link.replace(/^https?:\/\/[^/]+/, '');
    const guestErrors = await open(guest, path.includes('broker=') ? path : withBroker(path), false);
    await guest.locator('.ol-name').fill('친구');
    await guest.locator('.ol-enter').click();
    await expect(host.locator('.ol-seat:not(.ol-seat-empty)')).toHaveCount(2);
    await host.locator('.ol-foot .btn-primary').click();
    await expect(host.locator('.fireice')).toBeVisible();
    await expect(guest.locator('.fireice')).toBeVisible();

    // 방장 = 불: 오른쪽으로 달리면 친구 화면의 불도 따라온다 (가는 길에 빨간 사탕 하나)
    const gems = (p: Page) => p.evaluate(() => (window as unknown as { __fireice: Hook }).__fireice.runtime.world?.gems.filter(Boolean).length ?? -1);
    const g0 = await body(guest, 'fire');
    await runUntil(host, 'right', false, async () => (await gems(host)) > 0);
    await expect.poll(() => body(guest, 'fire'), { timeout: 5000 }).toBeGreaterThan(g0 + 1.5);
    await expect.poll(() => gems(guest), { timeout: 5000 }).toBe(1);
    // 친구 = 얼음: 왼쪽으로 가면 방장 화면의 얼음이 따라온다
    const h0 = await body(host, 'ice');
    await runUntil(guest, 'left', false, async () => (await body(guest, 'ice')) < h0 - 1.2);
    await expect.poll(() => body(host, 'ice'), { timeout: 5000 }).toBeLessThan(h0 - 1);

    // 방장이 R로 다시 하기 → 두 화면 모두 처음 자리로
    await host.keyboard.press('KeyR');
    await expect.poll(async () => (await session(guest))?.attempt).toBe(2);
    await expect.poll(() => body(guest, 'fire')).toBeLessThan(1.5);
    await expect.poll(() => gems(guest)).toBe(0);
    expect(hostErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
    await hostCtx.close();
    await guestCtx.close();
  });
});
