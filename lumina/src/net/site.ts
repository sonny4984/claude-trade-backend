/**
 * 초대 링크 — 친구가 누르면 바로 방으로 들어오는 주소.
 * 공개 사이트(Vercel)에서는 지금 주소를 쓰고, claude.ai 아티팩트처럼 주소를 나눌 수 없는 곳에서는
 * 빌드할 때 넣은 VITE_PUBLIC_URL을 쓴다.
 */
import { brokerOverride } from './relay';

export function siteUrl(): string {
  const env = import.meta.env.VITE_PUBLIC_URL;
  try {
    const here = `${location.origin}${location.pathname}`;
    const shareable = /^https?:$/.test(location.protocol) && !/claudeusercontent|claude\.ai|claude\.site|^$/.test(location.hostname);
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return here;
    if (env) return env;
    if (shareable) return here;
  } catch {
    /* location 없음 */
  }
  return env ?? '';
}

/** 공개 사이트가 따로 있고 지금 그 사이트가 아닌 곳(아티팩트 등)에 있는지 */
export function elsewhere(): boolean {
  const env = import.meta.env.VITE_PUBLIC_URL;
  if (!env) return false;
  try {
    return !`${location.origin}${location.pathname}`.startsWith(env.replace(/\/$/, '')) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  } catch {
    return true;
  }
}

export function inviteUrl(code: string, broker: number): string {
  const base = siteUrl();
  const u = new URL(base || 'https://example.invalid/');
  u.search = '';
  u.hash = '';
  u.searchParams.set('room', code);
  if (broker >= 0) u.searchParams.set('b', String(broker));
  const test = brokerOverride();
  if (test) u.searchParams.set('broker', test.url);
  return base ? u.toString() : `?${u.searchParams.toString()}`;
}

/** 주소의 ?room=코드&b=서버 — 초대 링크로 들어왔는지 */
export function readInvite(): { code: string; broker?: number } | null {
  try {
    const q = new URLSearchParams(location.search);
    const code = (q.get('room') ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    if (code.length < 4) return null;
    const b = Number(q.get('b'));
    return Number.isInteger(b) && b >= 0 && b < 8 ? { code, broker: b } : { code };
  } catch {
    return null;
  }
}

/** 입장한 뒤 주소에서 초대 표시를 지운다 (새로고침해도 다시 입장 화면이 뜨지 않게) */
export function clearInviteFromUrl(): void {
  try {
    const u = new URL(location.href);
    if (!u.searchParams.has('room')) return;
    u.searchParams.delete('room');
    u.searchParams.delete('b');
    history.replaceState(null, '', u.toString());
  } catch {
    /* noop */
  }
}

/** 초대 보내기: 휴대폰은 공유 시트(카카오톡 등), 아니면 복사 */
export async function shareInvite(url: string, text: string, title: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
  const data: ShareData = { title, text, url };
  if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare(data))) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function canNativeShare(): boolean {
  return typeof (navigator as Navigator & { share?: unknown }).share === 'function';
}
