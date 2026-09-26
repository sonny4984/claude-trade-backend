/**
 * 화면 확인용 캡처 (개발용): npx tsx scripts/shots.ts <출력 폴더>
 * 미리보기 서버(localhost:4173)가 떠 있어야 한다.
 */
import { chromium, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { ClaudeHub } from '../e2e/claude-mock';

const out = process.argv[2] ?? '.';
const pre = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: existsSync(pre) ? pre : undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const hub = new ClaudeHub();
async function dev(path = '/', settings: Record<string, unknown> = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  // tsx(esbuild)가 함수에 붙이는 __name 도우미를 페이지에도 둔다 (가짜 런타임 함수를 페이지로 옮기므로)
  await page.addInitScript('window.__name = (f) => f;');
  await hub.attach(page);
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('i')) return;
    sessionStorage.setItem('i', '1');
    localStorage.clear();
    localStorage.setItem('lumina.settings.v1', JSON.stringify(s));
  }, { aiSpeed: 'fast', confirmDraw: false, ...settings });
  await page.goto('http://localhost:4173' + path);
  await page.waitForTimeout(1500);
  return page;
}
const host = await dev('/?seed=2');
await host.screenshot({ path: `${out}/01-home.png` });
await host.locator('.plate-online').click();
await host.waitForTimeout(600);
await host.screenshot({ path: `${out}/02-online-start.png` });
await host.locator('.ol-name').fill('소니');
await host.locator('.ol-create').click();
await host.waitForTimeout(800);
const code = ((await host.locator('.ol-code').getAttribute('aria-label')) ?? '').replace(/\s/g, '');
const guest = await dev('/');
await guest.locator('.plate-online').click();
await guest.locator('.ol-pick-btn').nth(1).click();
await guest.locator('.ol-name').fill('여자친구');
await guest.locator('.ol-code-input').fill(code);
await guest.locator('.ol-join button[type=submit]').click();
await host.waitForTimeout(1200);
await host.screenshot({ path: `${out}/03-lobby-host.png`, fullPage: false });
await guest.screenshot({ path: `${out}/04-lobby-guest.png` });
await host.locator('.add-seat').click();
await host.waitForTimeout(400);
await host.locator('.ol-foot .btn-primary').click();
await host.waitForTimeout(3500);
await host.screenshot({ path: `${out}/05-game-host.png` });
await guest.screenshot({ path: `${out}/06-game-guest.png` });
await browser.close();
console.log('code', code);
