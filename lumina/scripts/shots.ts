/**
 * 화면 확인용 캡처 (개발용): npx tsx scripts/shots.ts <출력 폴더> [경로...]
 * 미리보기 서버(localhost:4173)가 떠 있어야 한다. 온라인 화면은 시험용 MQTT 서버를 띄워 잇는다.
 */
import { chromium, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { startBroker } from '../e2e/broker';

const out = process.argv[2] ?? '.';
const pre = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: existsSync(pre) ? pre : undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const broker = await startBroker();
const q = (path: string): string => `${path}${path.includes('?') ? '&' : '?'}broker=${encodeURIComponent(broker.url)}`;

async function dev(path = '/', settings: Record<string, unknown> = {}): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript((s) => {
    if (sessionStorage.getItem('i')) return;
    sessionStorage.setItem('i', '1');
    localStorage.clear();
    localStorage.setItem('lumina.settings.v1', JSON.stringify(s));
  }, { aiSpeed: 'fast', confirmDraw: false, ...settings });
  await page.goto('http://localhost:4173' + q(path));
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
await host.locator('.ol-link').waitFor();
await host.waitForTimeout(800);
const link = await host.locator('.ol-link').inputValue();
const guest = await dev(link.replace(/^https?:\/\/[^/]+/, ''));
await guest.screenshot({ path: `${out}/03-invited.png` });
await guest.locator('.ol-pick-btn').nth(1).click();
await guest.locator('.ol-name').fill('여자친구');
await guest.locator('.ol-enter').click();
await host.waitForTimeout(1500);
await host.screenshot({ path: `${out}/04-lobby-host.png` });
await guest.screenshot({ path: `${out}/05-lobby-guest.png` });
for (const extra of process.argv.slice(3)) {
  const p = await dev(extra);
  await p.screenshot({ path: `${out}/x-${extra.replace(/[^a-z0-9]+/gi, '_')}.png` });
}
await browser.close();
await broker.close();
console.log('link', link);
