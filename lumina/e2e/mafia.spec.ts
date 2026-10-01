import { expect, test, type Page } from '@playwright/test';

/**
 * 마피아 — AI 친구들과 한 판: 밤 → 낮 대화(내 말에 지목된 친구가 해명) → 투표 → 다음 밤.
 * 게임 속 상태는 localhost에서만 열리는 시험용 손잡이(window.__mafia)로 읽는다.
 */

interface Hook {
  store: { getState: () => { busy: boolean; game: { phase: string; players: { alive: boolean; human: boolean }[] } | null } };
}

async function open(page: Page): Promise<string[]> {
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
  await page.goto('/');
  await expect(page.locator('.wordmark')).toHaveText('LUMINA');
  return errors;
}

const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __mafia: Hook }).__mafia.store.getState();
    return { busy: s.busy, phase: s.game?.phase ?? '', alive: s.game?.players.find((p) => p.human)?.alive ?? false };
  });

/** AI 차례가 끝날 때까지 (건너뛰기로 재촉) */
async function settle(page: Page): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (!(await state(page)).busy) return;
    const skip = page.getByRole('button', { name: '건너뛰기' });
    if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => undefined);
    await page.waitForTimeout(250);
  }
  throw new Error('AI 차례가 끝나지 않음');
}

test('마피아: AI 친구들과 밤·낮 대화·투표', async ({ page }) => {
  const errors = await open(page);
  await page.locator('.plate-mafia').click();
  await expect(page.locator('.mafia-setup')).toBeVisible();
  await page.getByRole('radio', { name: '7명' }).click();
  await page.getByRole('radio', { name: '시민', exact: true }).click();
  const voice = page.locator('.toggle-row', { hasText: '목소리로 읽어 주기' }).locator('input');
  if (await voice.count()) await voice.uncheck();
  await expect(page.locator('.mafia-setup')).toContainText('Claude 대사는 claude.ai에서 열었을 때만 돼요');
  await page.getByRole('button', { name: '시작하기' }).click();

  await expect(page.locator('.mafia-screen')).toBeVisible();
  await expect(page.locator('.mf-tile')).toHaveCount(7);
  await expect(page.locator('.mf-line[data-kind="secret"]').first()).toContainText('시민');

  // 밤: 시민은 잠든다 → 아침이 밝고 AI 친구들이 말한다
  await page.getByRole('button', { name: '잠들기' }).click();
  await expect(page.locator('.mf-line[data-kind="sys"]', { hasText: '아침이 밝았어요' })).toBeVisible();
  await expect(page.locator('.mf-line[data-kind="say"]').first()).toBeVisible();
  await settle(page);

  if ((await state(page)).alive) {
    // 살아 있는 AI 친구 하나를 의심하면 그 친구가 해명한다
    const tile = page.locator('.mf-tile:not([data-me]):not([data-dead])').first();
    const name = (await tile.locator('.mf-name').innerText()).trim();
    const before = await page.locator('.mf-line[data-kind="say"]').count();
    await page.getByPlaceholder('하고 싶은 말').fill(`${name} 수상해`);
    await page.getByRole('button', { name: '보내기' }).click();
    await expect(page.locator('.mf-line[data-kind="me"]').last()).toContainText(`${name} 수상해`);
    await expect(page.locator('.mf-line[data-kind="say"]').nth(before)).toContainText(name);
    await settle(page);

    // 빠른 말: 친구를 고르고 "믿어"
    await tile.click();
    await page.getByRole('button', { name: `${name} 믿어` }).click();
    await settle(page);
  }

  // 투표
  await page.getByRole('button', { name: '투표하러 가기' }).click();
  await expect(page.locator('.mf-line[data-kind="sys"]').last()).toContainText('투표 시간');
  if ((await state(page)).alive) {
    await page.locator('.mf-tile:not([data-me]):not([data-dead])').first().click();
    await page.getByRole('button', { name: /에게 투표$/ }).click();
  } else await page.getByRole('button', { name: '투표 보기' }).click();
  await settle(page);
  await expect(page.locator('.mf-line[data-kind="vote"]').first()).toBeVisible();
  const after = await state(page);
  expect(['night', 'over']).toContain(after.phase);
  if (after.phase === 'night') await expect(page.locator('.mf-head h1')).toContainText('2일째 밤');
  expect(errors).toEqual([]);
});
