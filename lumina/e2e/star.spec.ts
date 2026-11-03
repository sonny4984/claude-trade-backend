import { expect, test, type Page } from '@playwright/test';
import { startBroker, type TestBroker } from './broker';
import { CELLS, cornerCells, reach } from '../src/star/engine';

/**
 * 별판 점프 — 한 기기 셋(사람끼리 돌아가며), 사람 하나와 AI 둘, 마지막 한 수로 이기기, 온라인 둘.
 */

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

/** 지금 둘 수 있는 내 말 하나를 골라 갈 곳 하나로 옮긴다 */
async function moveOne(page: Page): Promise<void> {
  await page.locator('.star-cell[data-movable]').first().click({ force: true });
  await expect(page.locator('.star-cell[data-target]').first()).toBeAttached();
  await page.locator('.star-cell[data-target]').last().click({ force: true });
}

const moves = (page: Page) => page.evaluate(() => (window as unknown as { __star: { store: { getState: () => { session: { state: { moves: unknown[] } } | null } } } }).__star.store.getState().session?.state.moves.length ?? -1);

test('별판 점프: 셋이 한 기기로 돌아가며, 되돌리기', async ({ page }) => {
  const errors = await open(page);
  await page.locator('.plate-star').click();
  await expect(page.locator('.star-setup')).toBeVisible();
  await expect(page.getByRole('radio', { name: '3명' })).toHaveAttribute('aria-checked', 'true');
  await page.locator('.star-start').click();
  await expect(page.locator('.game.star')).toBeVisible();
  await expect(page.locator('.star-cell[data-piece]')).toHaveCount(30);
  await expect(page.locator('.star-status')).toHaveText('나 차례');

  await moveOne(page);
  await expect(page.locator('.star-status')).toHaveText('여자친구 차례');
  await expect(page.locator('.star-player[data-current] b')).toHaveText('여자친구');
  await moveOne(page);
  await expect(page.locator('.star-status')).toHaveText('동생 차례');
  await moveOne(page);
  await expect(page.locator('.star-status')).toHaveText('나 차례');
  expect(await moves(page)).toBe(3);

  await page.locator('.star-undo').click();
  await expect(page.locator('.star-status')).toHaveText('동생 차례');
  expect(await moves(page)).toBe(2);

  // 나갔다 와도 이어서
  await page.reload();
  await expect(page.locator('.wordmark')).toHaveText('LUMINA');
  await page.locator('.plate-star').click();
  await page.getByRole('button', { name: /이어서 하기/ }).click();
  await expect(page.locator('.star-status')).toHaveText('동생 차례');
  expect(errors).toEqual([]);
});

test('별판 점프: 나 혼자 + AI 둘', async ({ page }) => {
  const errors = await open(page);
  await page.locator('.plate-star').click();
  const seats = page.locator('.star-seat');
  for (const i of [1, 2]) await seats.nth(i).getByRole('radio', { name: 'AI', exact: true }).click();
  await page.locator('.star-start').click();
  await expect(page.locator('.star-status')).toHaveText('내 차례 — 말을 골라요');
  await moveOne(page);
  // AI 둘이 두고 다시 내 차례
  await expect(page.locator('.star-status')).toHaveText('내 차례 — 말을 골라요', { timeout: 15_000 });
  expect(await moves(page)).toBe(3);
  // 되돌리기는 AI 수까지 함께 → 내 첫 수 전으로
  await page.locator('.star-undo').click();
  await expect.poll(() => moves(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('별판 점프: 마지막 말이 들어가면 이긴다', async ({ page }) => {
  const errors = await open(page);
  await page.locator('.plate-star').click();
  await page.getByRole('radio', { name: '2명' }).click();
  await page.locator('.star-start').click();
  await expect(page.locator('.game.star')).toBeVisible();
  // 0번 말 9개는 이미 도착, 하나는 도착 칸 바로 앞 (한 칸 걸으면 끝)
  const goal = cornerCells('r-');
  const board = CELLS.map(() => 0);
  cornerCells('r+').forEach((i) => (board[i] = 2));
  // 비워 둘 칸: 꼭짓점 밑변(바깥과 맞닿은 줄)의 칸
  const empty = goal[goal.length - 1] as number;
  goal.filter((i) => i !== empty).forEach((i) => (board[i] = 1));
  const from = CELLS.findIndex((c, i) => board[i] === 0 && c.corner === null && reach(board, i).has(empty));
  board[from] = 1;
  await page.evaluate(
    ([b]) => {
      const st = (window as unknown as { __star: { store: { getState: () => { session: { state: object } }; setState: (x: object) => void } } }).__star.store;
      const s = st.getState().session;
      st.setState({ session: { ...s, state: { ...s.state, board: b, turn: 0, moves: [] } } });
    },
    [board] as const,
  );
  await page.locator(`.star-cell[data-cell="${from}"]`).click({ force: true });
  await page.locator(`.star-cell[data-cell="${empty}"]`).click({ force: true });
  await expect(page.locator('.star-win')).toHaveText('나 승리!');
  await expect(page.locator('.star-rank li[data-won] span')).toHaveText('나');
  await page.locator('.star-rematch').click();
  await expect(page.locator('.star-cell[data-piece]')).toHaveCount(20);
  await expect(page.locator('.star-status')).toHaveText('여자친구 차례');
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

  test('방장과 친구 둘 + AI 하나: 각자 자기 꼭짓점이 아래, 수가 서로 보인다', async ({ browser }) => {
    const withBroker = (p: string): string => `${p}${p.includes('?') ? '&' : '?'}broker=${encodeURIComponent(broker.url)}`;
    const hostCtx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const host = await hostCtx.newPage();
    const errors = [await open(host, withBroker('/'))];
    await host.locator('.plate-online').click();
    await host.locator('.ol-name').fill('방장');
    await host.locator('.ol-game[data-game="star"]').click();
    await host.locator('.ol-create').click();
    const link = await host.locator('.ol-link').inputValue();
    const path = link.replace(/^https?:\/\/[^/]+/, '');
    const gctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const guest = await gctx.newPage();
    errors.push(await open(guest, path.includes('broker=') ? path : withBroker(path), false));
    await guest.locator('.ol-name').fill('여자친구');
    await guest.locator('.ol-enter').click();
    await expect(host.locator('.ol-seat:not(.ol-seat-empty)')).toHaveCount(2);
    await host.locator('.add-seat').click();
    await expect(host.locator('.ol-seat:not(.ol-seat-empty)')).toHaveCount(3);
    await host.getByRole('button', { name: '시작하기' }).click();
    for (const p of [host, guest]) {
      await expect(p.locator('.game.star')).toBeVisible();
      await expect(p.locator('.star-player')).toHaveCount(3);
    }
    await expect(host.locator('.star-status')).toHaveText('내 차례 — 말을 골라요');
    await expect(guest.locator('.star-status')).toHaveText('방장 차례');
    await moveOne(host);
    await expect(guest.locator('.star-status')).toHaveText('내 차례 — 말을 골라요');
    await moveOne(guest);
    // AI가 두고 다시 방장 차례
    await expect(host.locator('.star-status')).toHaveText('내 차례 — 말을 골라요', { timeout: 15_000 });
    await expect.poll(() => moves(guest)).toBe(3);
    await hostCtx.close();
    await gctx.close();
    expect(errors.flat()).toEqual([]);
  });
});
