/**
 * 9:16 결과 카드 — 캔버스로 그린다. 게임명·결과·캐릭터·점수·오늘의 한 수만 담고 개인정보는 넣지 않는다.
 */
import type { Session } from '../../store/game';
import { drawCharacter } from '../../characters/draw2d';
import { portrait3d } from '../../characters/portrait3d';
import { useSettings } from '../../store/settings';
import { analyzeSet, tile, type TileId } from '../../game';
import { translate, type Lang } from '../../i18n';

function css(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTile(ctx: CanvasRenderingContext2D, id: TileId, x: number, y: number, w: number): void {
  const h = w * 1.36;
  ctx.fillStyle = css('--tile-edge', '#c4a56a');
  roundRect(ctx, x, y + w * 0.08, w, h, w * 0.14);
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, css('--tile-0', '#f3e6c8'));
  g.addColorStop(1, css('--tile-1', '#e7d3a8'));
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, w * 0.14);
  ctx.fill();
  const t = tile(id);
  if (t.kind === 'joker') {
    ctx.fillStyle = css('--joker-a', '#b58a3c');
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.45, w * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css('--joker-b', '#7a1f2a');
    ctx.beginPath();
    ctx.arc(x + w * 0.58, y + h * 0.4, w * 0.18, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillStyle = css(`--ink-${t.color}`, '#222');
  ctx.font = `700 ${w * 0.58}px Fraunces, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(t.value), x + w / 2, y + h * 0.46);
}

export async function makeShareCard(s: Session, lang: Lang): Promise<string> {
  try {
    await document.fonts?.ready;
  } catch {
    /* noop */
  }
  const W = 1080;
  const H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const g = s.match.game;
  const r = g.result;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, css('--room-0', '#0b1210'));
  bg.addColorStop(0.55, css('--felt-0', '#163328'));
  bg.addColorStop(1, css('--room-0', '#0b1210'));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 760, 40, W / 2, 760, 620);
  glow.addColorStop(0, 'rgba(255, 220, 160, 0.22)');
  glow.addColorStop(1, 'rgba(255, 220, 160, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const text = css('--text', '#f4ecdc');
  const accent = css('--accent', '#c9a45c');
  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = '400 72px "Instrument Serif", Georgia, serif';
  ctx.letterSpacing = '24px';
  ctx.fillText('LUMINA', W / 2 + 12, 200);
  ctx.letterSpacing = '0px';

  const winners = r?.winners ?? [];
  const w0 = winners[0] ?? 0;
  const meta = s.seatsMeta[w0];
  const title = r?.reason === 'stalemate' ? translate(lang, 'result.matchOver') : translate(lang, 'result.winner', { name: s.match.seats[w0]?.name ?? '' });
  ctx.fillStyle = text;
  ctx.font = '600 84px "IBM Plex Sans KR", Figtree, sans-serif';
  ctx.fillText(title, W / 2, 360);

  if (meta) {
    const size = 620;
    const cc = document.createElement('canvas');
    cc.width = size;
    cc.height = size;
    const c2 = cc.getContext('2d');
    const r3 = useSettings.getState().show3d ? portrait3d() : null;
    const gl = r3?.canvas(meta.character, 'win', size);
    if (gl) ctx.drawImage(gl, (W - size) / 2, 420);
    else if (c2) {
      drawCharacter(c2, meta.character, 'win', size);
      ctx.drawImage(cc, (W - size) / 2, 420);
    }
  }

  const st = g.stats[w0];
  const stickers: string[] = [];
  if (st && st.longestRun >= 6) stickers.push(translate(lang, 'sticker.perfectRun'));
  if (st && st.jokersPlayed > 0) stickers.push(translate(lang, 'sticker.jokerComeback'));
  if (g.players.some((p, i) => !winners.includes(i) && p.rack.length === 1)) stickers.push(translate(lang, 'sticker.oneLeft'));
  if (st && st.draws === 0) stickers.push(translate(lang, 'sticker.flawless'));
  ctx.font = '600 44px "IBM Plex Sans KR", Figtree, sans-serif';
  let sy = 1110;
  stickers.slice(0, 2).forEach((label, i) => {
    const tw = ctx.measureText(label).width + 80;
    const x = W / 2 - tw / 2 + (i % 2 ? 60 : -60);
    ctx.save();
    ctx.translate(x + tw / 2, sy);
    ctx.rotate(i % 2 ? 0.05 : -0.05);
    ctx.fillStyle = accent;
    roundRect(ctx, -tw / 2, -44, tw, 88, 44);
    ctx.fill();
    ctx.fillStyle = css('--accent-ink', '#1d1509');
    ctx.fillText(label, 0, 16);
    ctx.restore();
    sy += 118;
  });

  // 오늘의 한 수: 가장 긴 런 또는 가장 큰 세트
  let best: TileId[] = [];
  for (const set of g.table) {
    const a = analyzeSet(set.tiles);
    if (a.ok && set.tiles.length > best.length) best = a.order.slice();
  }
  if (best.length) {
    ctx.fillStyle = css('--text-dim', 'rgba(244,236,220,.66)');
    ctx.font = '500 40px "IBM Plex Sans KR", Figtree, sans-serif';
    ctx.fillText(translate(lang, 'sticker.bigMove'), W / 2, 1420);
    const n = Math.min(best.length, 9);
    const tw = Math.min(100, 900 / n - 10);
    const total = n * tw + (n - 1) * 10;
    best.slice(0, n).forEach((id, i) => drawTile(ctx, id, (W - total) / 2 + i * (tw + 10), 1460, tw));
  }

  ctx.fillStyle = css('--text-dim', 'rgba(244,236,220,.66)');
  ctx.font = '500 38px "IBM Plex Sans KR", Figtree, sans-serif';
  const line = s.match.seats.map((p, i) => `${p.name} ${(r?.deltas[i] ?? 0) > 0 ? '+' : ''}${r?.deltas[i] ?? 0}`).join('   ·   ');
  ctx.fillText(line, W / 2, 1760);
  ctx.fillStyle = accent;
  ctx.font = 'italic 400 44px "Instrument Serif", Georgia, serif';
  ctx.fillText(translate(lang, 'brand.tagline'), W / 2, 1850);
  return c.toDataURL('image/png');
}
