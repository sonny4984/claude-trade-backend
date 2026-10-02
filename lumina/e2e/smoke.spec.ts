import { expect, test, type Locator, type Page } from '@playwright/test';

/** 설정을 심고 앱을 연다. 외부 글꼴은 막아 오프라인에서도 같은 결과가 나오게 한다. */
async function open(page: Page, settings: Record<string, unknown> = {}, path = '/'): Promise<string[]> {
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
  }, { aiSpeed: 'fast', hints: 'unlimited', assist: 'lots', ...settings });
  await page.goto(path);
  await expect(page.locator('.wordmark')).toHaveText('LUMINA');
  return errors;
}

async function startSolo(page: Page): Promise<void> {
  await page.locator('.plate-btn', { hasText: '혼자' }).click();
  await page.locator('.screen-foot .btn-primary').click();
  await expect(page.locator('.game')).toBeVisible();
}

/** 보드의 칸 (row, col) 한가운데의 화면 좌표 */
async function cellCenter(page: Page, row: number, col: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([r, c]) => {
      const b = document.querySelector('[data-board]') as HTMLElement;
      const rect = b.getBoundingClientRect();
      return { x: rect.left + ((c as number) + 0.5) * Number(b.dataset.sx), y: rect.top + ((r as number) + 0.5) * Number(b.dataset.sy) };
    },
    [row, col] as const,
  );
}

/** 타일이 미끄러져 가는 애니메이션이 끝나길 기다린다 (3D가 느린 환경에서는 한참 걸린다) */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ).then(() => undefined),
  );
}

/** 타일을 집어 보드의 칸 위까지 끌고 간다 (놓지는 않는다). dx: 칸 한가운데에서 오른쪽으로 얼마나(칸 너비 단위) — 0.3이면 오른쪽 절반 */
async function dragOverCell(page: Page, tile: Locator, row: number, col: number, dx = 0): Promise<void> {
  await settle(page);
  const from = await tile.boundingBox();
  if (!from) throw new Error('레이아웃을 찾지 못했습니다');
  const c = await cellCenter(page, row, col);
  const sx = await page.evaluate(() => Number((document.querySelector('[data-board]') as HTMLElement).dataset.sx));
  const to = { x: c.x + dx * sx, y: c.y };
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 40, { steps: 5 });
  // 판 가장자리(자동 스크롤 구간)를 오래 스치지 않게 한 번에 건너간다 — 3D가 느린 환경에서는 거치는 걸음마다 한참 걸린다
  await page.mouse.move(to.x, to.y);
}

/** 타일을 보드의 칸으로 끌어 놓는다 */
async function dragToCell(page: Page, tile: Locator, row: number, col: number, dx = 0): Promise<void> {
  await dragOverCell(page, tile, row, col, dx);
  await page.mouse.up();
}

/** 내 차례(뽑기 버튼이 켜질 때)까지 기다린다 */
async function myTurn(page: Page): Promise<void> {
  await expect(page.locator('.draw-btn')).toBeEnabled({ timeout: 45_000 });
}

/** 힌트 세 번 → 제안 적용. 둘 수 있는 수가 있으면 true */
async function applyHint(page: Page): Promise<boolean> {
  const hint = page.locator('.tool').nth(3);
  for (let i = 0; i < 3; i++) {
    if (await page.locator('.sheet .btn-primary').count()) break;
    if (!(await hint.isEnabled())) return false;
    await hint.click();
    await page.waitForTimeout(200);
  }
  const apply = page.locator('.sheet .btn-primary');
  if (!(await apply.count())) return false;
  await apply.click();
  return true;
}

test('홈 → 대국 준비 → 3D 무대와 랙이 보인다', async ({ page }) => {
  const errors = await open(page);
  await startSolo(page);
  await myTurn(page);
  await expect(page.locator('.rack .tile')).toHaveCount(14);
  await expect(page.locator('.stage-tag')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('힌트로 첫 등록을 하면 테이블에 세트가 생기고 차례가 넘어간다', async ({ page }) => {
  // 시드 1: 사람이 먼저 두고, 첫 차례에 30점 이상 등록할 수 있는 판 (scripts/find-seed.ts)
  const errors = await open(page, {}, '/?seed=1');
  await startSolo(page);
  await myTurn(page);
  const before = await page.locator('.rack .tile').count();
  expect(await applyHint(page)).toBe(true);
  await expect(page.locator('.commit-btn')).toBeEnabled();
  await page.locator('.commit-btn').click();
  await expect(page.locator('.draw-btn')).toBeDisabled();
  await expect.poll(() => page.locator('.felt .set .tile').count()).toBeGreaterThan(0);
  expect(await page.locator('.rack .tile').count()).toBeLessThan(before);
  expect(errors).toEqual([]);
});

test('도움 "스스로"(기본): 힌트는 판마다 1번·타일 하나만, 끌 때 맞는지 안 알려 주고, 뽑기 전에 묻지 않는다', async ({ page }) => {
  // 시드 1: 첫 차례에 30점 이상 등록할 수 있는 판 — 그래도 힌트는 타일 하나까지만
  const errors = await open(page, { assist: 'self', confirmDraw: true }, '/?seed=1');
  await startSolo(page);
  await myTurn(page);
  const hint = page.locator('.tool').nth(3);
  await expect(hint).toContainText('힌트 1');
  await hint.click();
  await expect(page.locator('.tile.is-hint')).toHaveCount(1);
  await expect(hint).toContainText('힌트 0');
  await hint.click();
  await expect(page.locator('.toast').last()).toContainText('타일 하나까지만');
  await expect(page.locator('.set[data-hint], .cell-ghost[data-hint]')).toHaveCount(0);
  await expect(page.locator('.sheet')).toHaveCount(0);
  // 끌어 보기: 놓을 칸은 보이지만 맞는지(초록·빨강)는 알려 주지 않는다
  await dragOverCell(page, page.locator('.rack .tile').first(), 3, 4);
  await expect(page.locator('.cell-ghost')).toHaveAttribute('data-preview', 'neutral');
  await page.mouse.up();
  // 한 장짜리 세트: 틀렸다는 표시와 "3장 이상"만 (무엇이 빠졌는지는 말하지 않음)
  await expect(page.locator('.felt .set[data-state="incomplete"]')).toHaveCount(1);
  await page.locator('.tool').nth(2).click(); // 처음으로
  // 낼 수 있는 수가 있어도 "그래도 뽑을까요?"를 묻지 않는다 (물으면 낼 수 있다는 걸 알려 주는 셈)
  await page.locator('.draw-btn').click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.locator('.draw-btn')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('도움 "조금": 힌트 3번, 타일 → 놓을 자리까지 (완성된 테이블은 안 보여 줌)', async ({ page }) => {
  const errors = await open(page, { assist: 'some' }, '/?seed=1');
  await startSolo(page);
  await myTurn(page);
  const hint = page.locator('.tool').nth(3);
  await expect(hint).toContainText('힌트 3');
  await hint.click();
  await expect(page.locator('.tile.is-hint')).toHaveCount(1);
  await hint.click();
  await expect(page.locator('.set[data-hint], .cell-ghost[data-hint]')).toHaveCount(1);
  await hint.click();
  await expect(page.locator('.toast').last()).toContainText('놓을 자리까지만');
  await expect(page.locator('.sheet')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('타일을 보드의 칸에 끌어 놓고, 붙여 놓으면 한 세트가 되고, 되돌리기·처음으로가 동작한다', async ({ page }) => {
  // 시드 1: 사람이 먼저 두는 판 — 테이블이 비어 있어 칸 좌표가 늘 같다
  const errors = await open(page, {}, '/?seed=1');
  await startSolo(page);
  await myTurn(page);
  await expect(page.locator('.felt .set')).toHaveCount(0);
  // 빈 칸에 놓기
  await dragToCell(page, page.locator('.rack .tile').first(), 3, 3);
  await expect(page.locator('.rack .tile')).toHaveCount(13);
  await expect(page.locator('.felt .set')).toHaveCount(1);
  await expect(page.locator('.felt .set[style*="--row: 3"][style*="--col: 3"]')).toHaveCount(1);
  // 바로 옆 칸에 놓으면 같은 세트에 붙는다
  await dragToCell(page, page.locator('.rack .tile').first(), 3, 4);
  await expect(page.locator('.rack .tile')).toHaveCount(12);
  await expect(page.locator('.felt .set')).toHaveCount(1);
  await expect(page.locator('.felt .set .tile')).toHaveCount(2);
  // 한 칸 띄우면 따로 놓인다
  await dragToCell(page, page.locator('.rack .tile').first(), 3, 7);
  await expect(page.locator('.rack .tile')).toHaveCount(11);
  await expect(page.locator('.felt .set')).toHaveCount(2);
  // 이미 타일이 있는 칸에 놓으면 거절하지 않고 그 세트에 끼워 넣는다
  await dragToCell(page, page.locator('.rack .tile').first(), 3, 3);
  await expect(page.locator('.rack .tile')).toHaveCount(10);
  await expect(page.locator('.felt .set[style*="--row: 3"][style*="--col: 3"] .tile')).toHaveCount(3);
  await expect(page.locator('.felt .set')).toHaveCount(2);
  await page.locator('.tool').nth(0).click(); // 되돌리기
  await expect(page.locator('.rack .tile')).toHaveCount(11);
  await page.locator('.tool').nth(1).click(); // 다시
  await expect(page.locator('.rack .tile')).toHaveCount(10);
  await page.locator('.tool').nth(2).click(); // 처음으로
  await expect(page.locator('.rack .tile')).toHaveCount(14);
  await expect(page.locator('.felt .set')).toHaveCount(0);
  // 한 장짜리 세트로는 등록할 수 없다
  await expect(page.locator('.commit-btn')).toBeDisabled();
  // 누르고 놓기: 랙 타일을 누르고 빈 칸을 누르면 그 칸에, 다른 타일을 누르고 옆 칸을 누르면 붙는다
  const at = await cellCenter(page, 1, 5);
  await page.locator('.rack .tile').first().click();
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('.felt .set')).toHaveCount(1);
  await page.locator('.rack .tile').first().click();
  const next = await cellCenter(page, 1, 6);
  await page.mouse.click(next.x, next.y);
  await expect(page.locator('.rack .tile')).toHaveCount(12);
  await expect(page.locator('.felt .set')).toHaveCount(1);
  // 정리하기: 흩어진 세트를 위쪽부터 모은다
  await dragToCell(page, page.locator('.rack .tile').first(), 3, 9);
  await expect(page.locator('.felt .set[style*="--row: 3"]')).toHaveCount(1);
  await page.getByRole('button', { name: '정리' }).click();
  await expect(page.locator('.felt .set[style*="--row: 3"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('판 오른쪽 끝에 닿은 세트에도 타일을 이어 붙일 수 있다 (세트가 알아서 비켜 앉는다)', async ({ page }) => {
  const errors = await open(page, {}, '/?seed=1');
  await startSolo(page);
  await myTurn(page);
  // 오른쪽 끝(10·11·12칸)에 세 장을 붙여 놓는다
  await dragToCell(page, page.locator('.rack .tile').first(), 1, 12);
  await dragToCell(page, page.locator('.rack .tile').first(), 1, 11);
  await dragToCell(page, page.locator('.rack .tile').first(), 1, 10);
  await expect(page.locator('.felt .set')).toHaveCount(1);
  await expect(page.locator('.felt .set[style*="--col: 10"] .tile')).toHaveCount(3);
  // 가장 오른쪽 타일의 오른쪽 절반으로 한 장 더 — 놓을 칸이 없는데도 이어 붙는다
  await dragToCell(page, page.locator('.rack .tile').first(), 1, 12, 0.3);
  await expect(page.locator('.rack .tile')).toHaveCount(10);
  await expect(page.locator('.felt .set')).toHaveCount(1);
  await expect(page.locator('.felt .set[style*="--row: 1"][style*="--col: 9"] .tile')).toHaveCount(4);
  // 왼쪽 끝도 마찬가지 — 0칸에 닿은 세트의 앞에 끼워 넣는다
  await dragToCell(page, page.locator('.rack .tile').first(), 3, 0);
  await dragToCell(page, page.locator('.rack .tile').first(), 3, 0, -0.3);
  await expect(page.locator('.felt .set[style*="--row: 3"][style*="--col: 0"] .tile')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('키보드만으로: 숫자로 고르고 N으로 새 세트, U로 되돌리기', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', '데스크톱 전용');
  const errors = await open(page);
  await startSolo(page);
  await myTurn(page);
  const sets0 = await page.locator('.felt .set').count();
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await expect(page.locator('.rack .tile[aria-pressed="true"]')).toHaveCount(2);
  await page.keyboard.press('n');
  await expect(page.locator('.felt .set')).toHaveCount(sets0 + 1);
  await page.keyboard.press('u');
  await expect(page.locator('.felt .set')).toHaveCount(sets0);
  expect(errors).toEqual([]);
});

test('튜토리얼 1과를 끝내면 완료 창이 뜬다', async ({ page }) => {
  const errors = await open(page);
  await page.locator('.plate-btn', { hasText: '규칙 배우기' }).click();
  await page.locator('.lesson-item').first().click();
  await expect(page.locator('.lesson-banner')).toBeVisible();
  expect(await applyHint(page)).toBe(true);
  await expect(page.locator('.lesson-done')).toBeVisible();
  expect(errors).toEqual([]);
});

test('함께 두기는 차례마다 가림막으로 패를 숨긴다', async ({ page }) => {
  const errors = await open(page);
  await page.locator('.plate-btn', { hasText: '함께' }).click();
  await page.locator('.screen-foot .btn-primary').click();
  await expect(page.locator('.curtain')).toBeVisible();
  // 가림막 뒤의 랙은 뒷면만 보인다
  await expect(page.locator('.rack .tile:not(.is-back)')).toHaveCount(0);
  expect(await page.locator('.rack .tile.is-back').count()).toBeGreaterThan(0);
  await page.locator('.curtain button').first().click();
  await expect(page.locator('.rack .tile:not(.is-back)')).toHaveCount(14);
  expect(errors).toEqual([]);
});

test('테마를 바꾸면 문서 전체의 재질이 바뀐다', async ({ page }) => {
  const errors = await open(page);
  // 기본은 피크닉(기니피그 소풍 담요)
  await expect(page.locator('html')).toHaveAttribute('data-lumina-theme', 'picnic');
  await page.locator('.home-links').getByText('설정').click();
  for (const id of ['classic', 'ivory', 'midnight', 'walnut', 'glass', 'studio', 'pastel', 'matcha', 'picnic']) {
    await page.locator(`.theme-card[data-preview="${id}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('data-lumina-theme', id);
  }
  await page.locator('.theme-card[data-preview="lumina"]').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-lumina-theme', /.+/);
  expect(errors).toEqual([]);
});

test('루미큐브 판은 기본으로 클래식 테이블(초록 펠트·원목 랙)', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('html')).toHaveAttribute('data-lumina-theme', 'picnic');
  await startSolo(page);
  await expect(page.locator('html')).toHaveAttribute('data-lumina-theme', 'classic');
  expect(errors).toEqual([]);
});

test('루미큐브 테이블을 "앱 테마"로 두면 판에서도 앱 테마 그대로', async ({ page }) => {
  const errors = await open(page, { rkTable: 'theme' });
  await startSolo(page);
  await expect(page.locator('.game')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-lumina-theme', 'picnic');
  expect(errors).toEqual([]);
});

test('예전 기본 테마(루미나) 저장값은 한 번만 피크닉으로 옮긴다', async ({ page }) => {
  const errors = await open(page, { theme: 'lumina' });
  await expect(page.locator('html')).toHaveAttribute('data-lumina-theme', 'picnic');
  // 다시 루미나를 고르면 그대로 남는다
  await page.locator('.home-links').getByText('설정').click();
  await page.locator('.theme-card[data-preview="lumina"]').click();
  await page.reload();
  await expect(page.locator('.wordmark')).toHaveText('LUMINA');
  await expect(page.locator('html')).not.toHaveAttribute('data-lumina-theme', /.+/);
  expect(errors).toEqual([]);
});

test('다빈치 코드 혼자 두기: 시작하면 내 코드가 보이고 추리 한 번이 기록에 남는다', async ({ page }) => {
  const errors = await open(page, {}, '/?seed=3');
  await page.locator('.plate-coda').click();
  await page.locator('.screen-foot .btn-primary').click();
  await expect(page.locator('.coda')).toBeVisible();
  // 보드게임처럼 처음 타일 4장을 더미에서 색을 골라 가져온다
  for (const color of ['black', 'white', 'black', 'white']) {
    const heap = page.locator(`button.pile-heap[data-color="${color}"]`);
    await expect(heap).toBeVisible({ timeout: 20_000 });
    await heap.click();
  }
  await expect(page.locator('.my-code .ctile')).toHaveCount(4);
  await expect(page.locator('.my-code .ctile[data-color="black"]')).toHaveCount(2);
  // 내 차례가 오면 한 장 뽑고, 상대 타일 하나를 골라 숫자를 부른다
  await expect(page.locator('button.pile-heap').first()).toBeVisible({ timeout: 45_000 });
  await page.locator('button.pile-heap').first().click();
  await expect(page.locator('.my-drawn .ctile')).toBeVisible();
  const target = page.locator('.code-row button.ctile');
  await expect(target.first()).toBeVisible({ timeout: 45_000 });
  await target.first().click();
  await page.locator('.numpad button:not([disabled])').first().click();
  await expect(page.locator('.status-text')).not.toHaveText('', { timeout: 10_000 });
  await page.locator('.hud .icon-btn.small').click();
  await expect(page.locator('.sheet')).toBeVisible();
  expect(errors).toEqual([]);
});

/** 다빈치 코드: 처음 4장을 가져오고, 내 차례에 한 장 뽑아 상대 타일 하나를 고른다 */
async function codaPickTarget(page: Page): Promise<void> {
  await page.locator('.plate-coda').click();
  await page.locator('.screen-foot .btn-primary').click();
  await expect(page.locator('.coda')).toBeVisible();
  for (const color of ['black', 'white', 'black', 'white']) {
    const heap = page.locator(`button.pile-heap[data-color="${color}"]`);
    await expect(heap).toBeVisible({ timeout: 20_000 });
    await heap.click();
  }
  await expect(page.locator('button.pile-heap').first()).toBeVisible({ timeout: 45_000 });
  await page.locator('button.pile-heap').first().click();
  const target = page.locator('.code-row button.ctile');
  await expect(target.first()).toBeVisible({ timeout: 45_000 });
  await target.first().click();
  await expect(page.locator('.numpad')).toBeVisible();
}

test('다빈치 코드 도움 "스스로": 숫자판이 아무것도 지워 주지 않고, 힌트는 1번·남은 숫자 개수만', async ({ page }) => {
  const errors = await open(page, { assist: 'self' }, '/?seed=3');
  await codaPickTarget(page);
  // 내 타일과 같은 숫자도 지워져 있지 않다 — 무엇이 불가능한지는 스스로
  await expect(page.locator('.numpad button[disabled]')).toHaveCount(0);
  await expect(page.locator('.coda-hint')).toContainText('1');
  await page.locator('.coda-hint').click();
  await expect(page.locator('.toast').last()).toContainText('개 남았어요');
  await expect(page.locator('.numpad button small')).toHaveCount(0);
  await expect(page.locator('.numpad button[data-possible]')).toHaveCount(0);
  await expect(page.locator('.coda-hint')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('다빈치 코드 도움 "조금": 보이는 숫자는 지우고, 힌트는 올 수 있는 숫자만 (확률 없이)', async ({ page }) => {
  const errors = await open(page, { assist: 'some' }, '/?seed=3');
  await codaPickTarget(page);
  await expect.poll(() => page.locator('.numpad button[disabled]').count()).toBeGreaterThan(0);
  await expect(page.locator('.coda-hint')).toContainText('3');
  await page.locator('.coda-hint').click();
  await expect.poll(() => page.locator('.numpad button[data-possible]').count()).toBeGreaterThan(0);
  await expect(page.locator('.numpad button small')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('오목 혼자 두기: 한 수 두면 AI가 받아 두고, 무르기로 되돌린다', async ({ page }) => {
  const errors = await open(page, {}, '/?seed=7');
  await page.locator('.plate-gomoku').click();
  await page.locator('.screen-foot .btn-primary').click();
  await expect(page.locator('.gomoku')).toBeVisible();
  const box = await page.locator('.go-board').boundingBox();
  if (!box) throw new Error('no board');
  const at = (x: number, y: number) => page.mouse.click(box.x + ((x + 1) / 16) * box.width, box.y + ((y + 1) / 16) * box.height);
  await at(7, 7);
  await expect(page.locator('.go-preview')).toHaveCount(1);
  await page.locator('.go-place').click();
  await expect(page.locator('.go-stone')).toHaveCount(2, { timeout: 10_000 });
  await page.locator('.go-actions .tool').first().click();
  await expect(page.locator('.go-stone')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('가로 폰에서도 랙과 버튼이 화면 안에 있다', async ({ page }, info) => {
  test.skip(info.project.name === 'desktop', '폰 전용');
  await page.setViewportSize({ width: 844, height: 390 });
  const errors = await open(page);
  await startSolo(page);
  await myTurn(page);
  for (const sel of ['.draw-btn', '.commit-btn', '.rack .tile >> nth=0']) {
    const box = await page.locator(sel).boundingBox();
    expect(box, sel).not.toBeNull();
    if (box) expect(box.y + box.height, sel).toBeLessThanOrEqual(390);
  }
  expect(errors).toEqual([]);
});

test('한 판을 끝까지 두면 결과·결과 카드·기록이 남는다', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', '긴 테스트는 데스크톱에서 한 번만');
  test.setTimeout(300_000);
  const errors = await open(page);
  await startSolo(page);
  const deadline = Date.now() + 280_000;
  while (Date.now() < deadline) {
    if (await page.locator('.result').count()) break;
    if ((await page.locator('.draw-btn').count()) && (await page.locator('.draw-btn').isEnabled())) {
      if ((await applyHint(page)) && (await page.locator('.commit-btn').isEnabled())) {
        await page.locator('.commit-btn').click();
      } else if (await page.locator('.draw-btn').isEnabled()) {
        await page.locator('.draw-btn').click();
        if (await page.locator('.sheet .btn-primary').count()) await page.locator('.sheet .btn-primary').click();
      }
    }
    await page.waitForTimeout(250);
  }
  await expect(page.locator('.result')).toBeVisible();
  await expect(page.locator('.result-player')).toHaveCount(3);
  await page.locator('.result').getByText('결과 카드').click();
  await expect(page.locator('.share-img')).toBeVisible({ timeout: 15_000 });
  const src = await page.locator('.share-img').getAttribute('src');
  expect(src?.startsWith('data:image/png')).toBe(true);
  await page.locator('.sheet').getByRole('button', { name: '닫기' }).click();
  await page.locator('.result').getByText('홈으로').click();
  await page.locator('.home-links').getByText('기록').click();
  await expect(page.locator('.stat').first()).toContainText('1');
  expect(errors).toEqual([]);
});
