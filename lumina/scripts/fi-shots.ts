/**
 * 불과 얼음 화면 캡처 (개발용): npx tsx scripts/fi-shots.ts <출력 폴더>
 * 미리보기 서버(localhost:4173)가 떠 있어야 한다.
 */
import { chromium, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { startBroker } from '../e2e/broker';

const out = process.argv[2] ?? '.';
const pre = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: existsSync(pre) ? pre : undefined });
const all = { picnic: { stars: 3, time: 30, gems: 4 }, jam: { stars: 2, time: 70, gems: 4 }, button: { stars: 1, time: 90, gems: 2 }, lever: { stars: 3, time: 50, gems: 3 }, matcha: { stars: 2, time: 60, gems: 6 } };

async function open(vp: { width: number; height: number }, progress: object = {}, setup?: object, path = '/'): Promise<Page> {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: vp.width < 600 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
  await page.addInitScript(
    ([p, s]) => {
      if (sessionStorage.getItem('i')) return;
      sessionStorage.setItem('i', '1');
      localStorage.clear();
      localStorage.setItem('lumina.settings.v1', JSON.stringify({ show3d: false }));
      localStorage.setItem('lumina.fireice.v1', JSON.stringify(p));
      if (s) localStorage.setItem('lumina.fireice-setup.v1', JSON.stringify(s));
    },
    [progress, setup ?? null] as const,
  );
  await page.goto('http://localhost:4173' + path);
  await page.waitForTimeout(900);
  return page;
}

const phone = { width: 390, height: 844 };
const p = await open(phone);
await p.screenshot({ path: `${out}/fi-01-home.png` });
await p.locator('.plate-fireice').click();
await p.waitForTimeout(500);
await p.screenshot({ path: `${out}/fi-02-setup.png`, fullPage: true });
await p.locator('.screen-foot .btn-primary').click();
await p.waitForTimeout(900);
await p.screenshot({ path: `${out}/fi-03-level1.png` });
// 불을 오른쪽으로 달리며 점프
await p.keyboard.down('ArrowRight');
await p.waitForTimeout(250);
await p.keyboard.down('ArrowUp');
await p.waitForTimeout(260);
await p.screenshot({ path: `${out}/fi-04-jump.png` });
await p.keyboard.up('ArrowUp');
await p.keyboard.up('ArrowRight');
await p.waitForTimeout(600);
await p.keyboard.press('ArrowDown');
await p.waitForTimeout(200);
await p.screenshot({ path: `${out}/fi-05-swapped.png` });

// 모두 연 상태로 6단계 (한 기기 둘이)
const q = await open(phone, all, { mode: 'local', names: ['소니', '여자친구'], characters: ['hwigi', 'pponi'] });
await q.locator('.plate-fireice').click();
await q.waitForTimeout(400);
await q.locator('.fi-level').nth(5).click();
await q.locator('.screen-foot .btn-primary').click();
await q.waitForTimeout(900);
await q.screenshot({ path: `${out}/fi-06-level6-local.png` });

// 데스크톱 4단계
const d = await open({ width: 1280, height: 800 }, all);
await d.locator('.plate-fireice').click();
await d.waitForTimeout(400);
await d.locator('.fi-level').nth(3).click();
await d.locator('.screen-foot .btn-primary').click();
await d.waitForTimeout(900);
await d.screenshot({ path: `${out}/fi-07-level4-desktop.png` });
// 메뉴
await d.keyboard.press('Escape');
await d.waitForTimeout(400);
await d.screenshot({ path: `${out}/fi-08-menu.png` });
// 온라인: 방장(불)·친구(얼음)
const broker = await startBroker();
const b = (x: string): string => `${x}${x.includes('?') ? '&' : '?'}broker=${encodeURIComponent(broker.url)}`;
const h = await open(phone, {}, undefined, b('/'));
await h.locator('.plate-online').click();
await h.locator('.ol-name').fill('소니');
await h.locator('.ol-game[data-game="fireice"]').click();
await h.locator('.ol-create').click();
const link = await h.locator('.ol-link').inputValue();
const gp = link.replace(/^https?:\/\/[^/]+/, '');
const g = await open(phone, {}, undefined, gp.includes('broker=') ? gp : b(gp));
await g.locator('.ol-pick-btn').nth(2).click();
await g.locator('.ol-name').fill('여자친구');
await g.locator('.ol-enter').click();
await h.waitForTimeout(1200);
await h.screenshot({ path: `${out}/fi-09-online-lobby.png` });
await h.locator('.ol-foot .btn-primary').click();
await h.waitForTimeout(1500);
await h.keyboard.down('ArrowRight');
await h.waitForTimeout(500);
await h.keyboard.up('ArrowRight');
await g.keyboard.down('ArrowLeft');
await g.waitForTimeout(400);
await g.keyboard.up('ArrowLeft');
await g.waitForTimeout(800);
await h.screenshot({ path: `${out}/fi-10-online-host.png` });
await g.screenshot({ path: `${out}/fi-11-online-guest.png` });
await browser.close();
await broker.close();
