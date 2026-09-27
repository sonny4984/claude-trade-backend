import { chromium, type Page } from '@playwright/test';
const SITE = process.argv[2] as string;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  proxy: { server: process.env.HTTPS_PROXY as string },
  args: ['--ignore-certificate-errors'],
});
async function dev(url: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text().slice(0, 200)); });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  return page;
}
const t0 = Date.now();
const host = await dev(SITE);
await host.locator('.wordmark').waitFor({ timeout: 30000 });
console.log('home loaded', Date.now() - t0, 'ms');
await host.locator('.plate-online').click();
await host.locator('.ol-name').fill('방장');
await host.locator('.ol-create').click();
await host.locator('.ol-link').waitFor({ timeout: 30000 });
const link = await host.locator('.ol-link').inputValue();
console.log('room created', Date.now() - t0, 'ms', link);
const guest = await dev(link);
await guest.locator('.ol-invited').waitFor({ timeout: 30000 });
await guest.locator('.ol-name').fill('친구');
await guest.locator('.ol-enter').click();
await host.locator('.ol-seat:not(.ol-seat-empty)').nth(1).waitFor({ timeout: 30000 });
console.log('guest seated on host screen', Date.now() - t0, 'ms');
await host.locator('.ol-foot .btn-primary').click();
await guest.locator('.game').waitFor({ timeout: 30000 });
console.log('game started on guest', Date.now() - t0, 'ms', 'guest rack', await guest.locator('.rack .tile').count());
await host.locator('.ol-foot .btn-ghost, .hud .icon-btn').first().count();
await browser.close();
