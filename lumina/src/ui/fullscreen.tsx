/**
 * 전체 화면 — 되는 곳(안드로이드 크롬·PC)은 버튼 한 번으로, 아이폰은 "홈 화면에 추가"로 앱처럼 연다.
 * (아이폰 사파리는 게임 화면을 전체 화면으로 바꾸는 기능을 막아 두었다.)
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useT } from '../i18n';
import { Sheet } from './game/Overlays';
import { readJSON, writeJSON } from '../store/storage';

type Doc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type El = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

/** 홈 화면에서 앱처럼 열었나 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** 카카오톡 같은 앱 안의 브라우저 */
export function inAppBrowser(): 'kakao' | 'other' | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return 'kakao';
  if (/Instagram|FBAN|FBAV|Line\/|NAVER|DaumApps/i.test(ua)) return 'other';
  return null;
}

export function canFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const d = document as Doc;
  const el = document.documentElement as El;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled) && !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

export function isFullscreen(): boolean {
  const d = document as Doc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/** 전체 화면 켜기만 (조용히 — 안 되면 그냥 둔다). 게임 화면 첫 터치에 쓴다 */
export async function enterFullscreen(): Promise<void> {
  if (!canFullscreen() || isFullscreen()) return;
  const el = document.documentElement as El;
  try {
    await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.());
  } catch {
    /* 막힌 곳(앱 안 창 등) */
  }
}

/** 카카오톡 안 브라우저에서 밖의 기본 브라우저로 여는 주소 */
export function kakaoExternalUrl(): string {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}`;
}

// 안드로이드 크롬: "앱 설치"를 한 번에 (브라우저가 설치할 수 있다고 알려 줄 때만)
type InstallEvent = Event & { prompt(): Promise<void> };
let installEvent: InstallEvent | null = null;
if (typeof window !== 'undefined')
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as InstallEvent;
    useFullscreenHelp.setState({ canInstall: true });
  });

export async function installApp(): Promise<void> {
  const e = installEvent;
  if (!e) return;
  installEvent = null;
  useFullscreenHelp.setState({ canInstall: false, open: false });
  await e.prompt().catch(() => undefined);
}

/** 전체 화면 켜고 끄기. 안 되는 곳이면 안내를 띄운다 */
export async function toggleFullscreen(): Promise<void> {
  if (!canFullscreen()) {
    useFullscreenHelp.setState({ open: true });
    return;
  }
  const d = document as Doc;
  try {
    if (isFullscreen()) await (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.());
    else {
      const el = document.documentElement as El;
      await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.());
    }
  } catch {
    useFullscreenHelp.setState({ open: true });
  }
}

/** 전체 화면을 쓸 방법이 있나 (이미 앱으로 열었으면 필요 없음) */
export function fullscreenAvailable(): boolean {
  return !isStandalone() && (canFullscreen() || isIOS());
}

export const useFullscreenHelp = create<{ open: boolean; canInstall: boolean }>(() => ({ open: false, canInstall: false }));

export function useIsFullscreen(): boolean {
  const [on, setOn] = useState(() => typeof document !== 'undefined' && isFullscreen());
  useEffect(() => {
    const f = (): void => setOn(isFullscreen());
    document.addEventListener('fullscreenchange', f);
    document.addEventListener('webkitfullscreenchange', f);
    return () => {
      document.removeEventListener('fullscreenchange', f);
      document.removeEventListener('webkitfullscreenchange', f);
    };
  }, []);
  return on;
}

/** 메뉴에 넣는 "전체 화면" 버튼 */
export function FullscreenButton({ className = 'btn btn-secondary' }: { className?: string }) {
  const t = useT();
  const on = useIsFullscreen();
  if (!fullscreenAvailable()) return null;
  return (
    <button type="button" className={className} onClick={() => void toggleFullscreen()}>
      {on ? t('fullscreen.exit') : t('fullscreen.enter')}
    </button>
  );
}

const HINT_KEY = 'lumina.fullscreen-hint.v1';

/** 홈 화면: 아이폰 사파리에서 한 번 알려 주는 쪽지 */
export function FullscreenHint() {
  const t = useT();
  const [hidden, setHidden] = useState(() => readJSON<boolean>(HINT_KEY) === true);
  const kakao = inAppBrowser() === 'kakao';
  // 카카오톡 안에서는 늘 (밖에서 열어야 전체 화면·홈 화면 앱이 된다), 아이폰 사파리는 한 번
  if (!kakao && (hidden || isStandalone() || !isIOS())) return null;
  if (kakao)
    return (
      <div className="fs-hint" role="note">
        <a className="fs-hint-body" href={kakaoExternalUrl()}>
          <b>{t('fullscreen.kakaoTitle')}</b>
          <span>{t('fullscreen.kakaoSub')}</span>
        </a>
      </div>
    );
  const close = (): void => {
    setHidden(true);
    writeJSON(HINT_KEY, true);
  };
  return (
    <div className="fs-hint" role="note">
      <button type="button" className="fs-hint-body" onClick={() => useFullscreenHelp.setState({ open: true })}>
        <b>{t('fullscreen.hintTitle')}</b>
        <span>{t('fullscreen.hintSub')}</span>
      </button>
      <button type="button" className="fs-hint-close" aria-label={t('action.close')} onClick={close}>
        ×
      </button>
    </div>
  );
}

/** 아이폰(과 전체 화면이 안 되는 곳)을 위한 "홈 화면에 추가" 안내 */
export function FullscreenHelp() {
  const t = useT();
  const open = useFullscreenHelp((s) => s.open);
  if (!open) return null;
  const close = (): void => useFullscreenHelp.setState({ open: false });
  const app = inAppBrowser();
  const ios = isIOS();
  const canInstall = useFullscreenHelp.getState().canInstall;
  const steps: string[] = [];
  if (app === 'kakao') steps.push(t(ios ? 'fullscreen.stepKakaoIos' : 'fullscreen.stepKakaoAndroid'));
  else if (app === 'other') steps.push(t('fullscreen.stepOtherApp'));
  else if (ios) steps.push(t('fullscreen.stepSafariView'));
  if (ios) steps.push(t('fullscreen.stepShare'), t('fullscreen.stepOpen'));
  else steps.push(t('fullscreen.stepAndroid'), t('fullscreen.stepOpen'));
  return (
    <Sheet label={t('fullscreen.title')} onClose={close}>
      <h2 className="sheet-title">{t('fullscreen.title')}</h2>
      {app === 'kakao' && (
        <div className="sheet-list">
          <a className="btn btn-primary" href={kakaoExternalUrl()}>
            {t('fullscreen.openOutside')}
          </a>
        </div>
      )}
      {canInstall && (
        <div className="sheet-list">
          <button type="button" className="btn btn-primary" onClick={() => void installApp()}>
            {t('fullscreen.install')}
          </button>
        </div>
      )}
      <ol className="fs-steps">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <p className="sheet-text fs-note">{t('fullscreen.note')}</p>
      <div className="sheet-list">
        <button type="button" className="btn btn-primary" autoFocus onClick={close}>
          {t('online.ok')}
        </button>
      </div>
    </Sheet>
  );
}
