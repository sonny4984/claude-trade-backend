/**
 * 홈 화면 앱 아이콘 만들기: npx tsx scripts/make-icons.ts
 * 게임과 같은 그리기 코드(draw2d)로 개발 서버 안에서 그려 public/icons/ 에 PNG로 저장한다.
 */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { existsSync, writeFileSync } from 'node:fs';

const server = await createServer({ server: { port: 5199, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5199/';
const pre = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: existsSync(pre) ? pre : undefined });
const page = await browser.newPage();
await page.goto(url);
// tsx가 함수에 이름표(__name)를 붙이므로, 페이지에서 돌릴 코드는 문자열로 넘긴다
const out = (await page.evaluate(`(async () => {
  const m = await import('/src/characters/draw2d.ts');
  const draw = (size, maskable) => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const s = size;
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#FFF3E0');
    g.addColorStop(1, '#FFDDB8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    const top = s * 0.66;
    ctx.fillStyle = '#E6F6EE';
    ctx.fillRect(0, top, s, s - top);
    ctx.fillStyle = 'rgba(92, 196, 150, 0.35)';
    const step = s / 8;
    for (let x = 0; x < s; x += step * 2) ctx.fillRect(x, top, step, s - top);
    for (let y = top; y < s; y += step * 2) ctx.fillRect(0, y, s, step);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(0, top, s, s * 0.012);
    const k = maskable ? 0.7 : 0.9;
    const cs = s * k;
    ctx.save();
    ctx.translate((s - cs) / 2, s * (maskable ? 0.2 : 0.1));
    m.drawCharacter(ctx, 'hwigi', 'happy', cs);
    ctx.restore();
    return c.toDataURL('image/png');
  };
  return { i512: draw(512, false), i192: draw(192, false), apple: draw(180, false), mask: draw(512, true) };
})()`)) as { i512: string; i192: string; apple: string; mask: string };
const save = (name: string, data: string): void => writeFileSync(`public/icons/${name}`, Buffer.from(data.split(',')[1] as string, 'base64'));
save('icon-512.png', out.i512);
save('icon-192.png', out.i192);
save('apple-touch-icon.png', out.apple);
save('icon-maskable-512.png', out.mask);
await browser.close();
await server.close();
console.log('icons written');
