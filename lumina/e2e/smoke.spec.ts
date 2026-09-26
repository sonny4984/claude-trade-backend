import { expect, test, type Page } from '@playwright/test';

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
  }, { aiSpeed: 'fast', hints: 'unlimited', ...settings });
  await page.goto(path);
  await expect(page.locator('.wordmark')).toHaveText('LUMINA');
  return errors;
}

async function startSolo(page: Page): Promise<void> {
  await page.locator('.plate-btn', { hasText: '혼자' }).click();
  await page.locator('.screen-foot .btn-primary').click();
  await expect(page.locator('.game')).toBeVisible();
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

test('타일을 테이블로 끌어 놓고 되돌리기·처음으로가 동작한다', async ({ page }) => {
  const errors = await open(page);
  await startSolo(page);
  await myTurn(page);
  const tile = page.locator('.rack .tile').first();
  const from = await tile.boundingBox();
  if (!from) throw new Error('레이아웃을 찾지 못했습니다');
  const sets0 = await page.locator('.felt .set').count();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // 끌기 시작하면 테이블에 "새 세트" 자리가 생긴다 — 거기에 놓는다
  await page.mouse.move(from.x + from.width / 2, from.y - 40, { steps: 6 });
  const slot = await page.locator('.new-set').boundingBox();
  if (!slot) throw new Error('새 세트 자리가 보이지 않습니다');
  await page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.rack .tile')).toHaveCount(13);
  await expect(page.locator('.felt .set')).toHaveCount(sets0 + 1);
  await page.locator('.tool').nth(0).click(); // 되돌리기
  await expect(page.locator('.rack .tile')).toHaveCount(14);
  await page.locator('.tool').nth(1).click(); // 다시
  await expect(page.locator('.rack .tile')).toHaveCount(13);
  await page.locator('.tool').nth(2).click(); // 처음으로
  await expect(page.locator('.rack .tile')).toHaveCount(14);
  // 한 장짜리 세트로는 등록할 수 없다
  await expect(page.locator('.commit-btn')).toBeDisabled();
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
  await page.locator('.home-links').getByText('설정').click();
  for (const id of ['ivory', 'midnight', 'walnut', 'glass', 'studio', 'pastel', 'matcha']) {
    await page.locator(`.theme-card[data-preview="${id}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('data-lumina-theme', id);
  }
  await page.locator('.theme-card[data-preview="lumina"]').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-lumina-theme', /.+/);
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
