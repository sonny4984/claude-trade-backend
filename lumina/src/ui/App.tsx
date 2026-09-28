import { useEffect } from 'react';
import { useGame } from '../store/game';
import { useSettings } from '../store/settings';
import { unlockAudio } from '../audio/sfx';
import { loadPortrait3d } from '../characters/portrait3d';
import { GameScreen } from './game/GameScreen';
import { Toasts } from './game/Overlays';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { SettingsScreen } from './screens/SettingsScreen';
import { StatsScreen } from './screens/StatsScreen';
import { RulesScreen } from './screens/RulesScreen';
import { LessonsScreen } from './screens/LessonsScreen';
import { CodaSetup } from '../coda/ui/CodaSetup';
import { CodaScreen } from '../coda/ui/CodaScreen';
import { OnlineScreen } from './screens/OnlineScreen';
import { GomokuSetup } from '../gomoku/ui/GomokuSetup';
import { GomokuScreen } from '../gomoku/ui/GomokuScreen';
import { FireIceSetup } from '../fireice/ui/FireIceSetup';
import { FireIceScreen } from '../fireice/ui/FireIceScreen';
import { useOnline } from '../net/online';
import { CommsLayer } from './online/Comms';
import { readInvite } from '../net/site';
import { FullscreenHelp } from './fullscreen';

/** 테마·접근성 설정을 <html> 속성으로 */
function useDocumentSettings(): void {
  const theme = useSettings((s) => s.theme);
  const hc = useSettings((s) => s.highContrast);
  const cvd = useSettings((s) => s.cvd);
  const motion = useSettings((s) => s.motion);
  const lang = useSettings((s) => s.lang);
  useEffect(() => {
    const el = document.documentElement;
    // claude.ai 같은 호스트가 data-theme(light/dark)를 쓰므로 게임 테마는 다른 이름으로
    if (theme === 'lumina') delete el.dataset.luminaTheme;
    else el.dataset.luminaTheme = theme;
    if (hc) el.dataset.contrast = 'high';
    else delete el.dataset.contrast;
    if (cvd) el.dataset.cvd = 'on';
    else delete el.dataset.cvd;
    el.dataset.motion = motion;
    el.lang = lang;
    const meta = document.querySelector('meta[name="theme-color"]');
    const bg = getComputedStyle(el).getPropertyValue('--room-0').trim();
    if (meta && bg) meta.setAttribute('content', bg);
  }, [theme, hc, cvd, motion, lang]);
}

type WakeLockApi = { request(type: 'screen'): Promise<{ release(): Promise<void> }> };

/** 게임·대기실에서는 화면이 꺼지지 않게 (Screen Wake Lock — 되는 브라우저에서만, 앱으로 돌아오면 다시 잡음) */
function useKeepAwake(on: boolean): void {
  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!on || !api) return;
    let lock: { release(): Promise<void> } | null = null;
    let alive = true;
    const take = (): void => {
      if (document.visibilityState !== 'visible') return;
      api
        .request('screen')
        .then((l) => {
          if (alive) lock = l;
          else void l.release().catch(() => undefined);
        })
        .catch(() => undefined);
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', take);
      void lock?.release().catch(() => undefined);
    };
  }, [on]);
}

export function App() {
  useDocumentSettings();
  const screen = useGame((s) => s.screen);
  useKeepAwake(screen === 'game' || screen === 'coda' || screen === 'gomoku' || screen === 'fireice' || screen === 'online');
  const show3d = useSettings((s) => s.show3d);
  useEffect(() => {
    if (!show3d) return;
    // 첫 화면을 그린 뒤 3D 모듈을 미리 불러 둔다
    const id = window.setTimeout(() => void loadPortrait3d(), 60);
    return () => window.clearTimeout(id);
  }, [show3d]);
  // 초대 링크(?room=코드)로 열렸으면 바로 입장 화면으로
  useEffect(() => {
    const inv = readInvite();
    if (!inv) return;
    useOnline.getState().setInvite(inv);
    useGame.getState().go('online');
  }, []);
  useEffect(() => {
    const unlock = (): void => unlockAudio();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
  return (
    <div className="app">
      <div className="room" aria-hidden="true" />
      {screen === 'home' && <Home />}
      {(screen === 'setup-solo' || screen === 'setup-local') && <Setup mode={screen === 'setup-solo' ? 'solo' : 'local'} />}
      {screen === 'game' && <GameScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'stats' && <StatsScreen />}
      {screen === 'rules' && <RulesScreen />}
      {screen === 'lessons' && <LessonsScreen />}
      {screen === 'coda-setup' && <CodaSetup />}
      {screen === 'coda' && <CodaScreen />}
      {screen === 'online' && <OnlineScreen />}
      {screen === 'gomoku-setup' && <GomokuSetup />}
      {screen === 'gomoku' && <GomokuScreen />}
      {screen === 'fireice-setup' && <FireIceSetup />}
      {screen === 'fireice' && <FireIceScreen />}
      <Toasts />
      <FullscreenHelp />
      <CommsLayer />
    </div>
  );
}
