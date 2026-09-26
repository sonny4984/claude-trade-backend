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

export function App() {
  useDocumentSettings();
  const screen = useGame((s) => s.screen);
  const show3d = useSettings((s) => s.show3d);
  useEffect(() => {
    if (!show3d) return;
    // 첫 화면을 그린 뒤 3D 모듈을 미리 불러 둔다
    const id = window.setTimeout(() => void loadPortrait3d(), 60);
    return () => window.clearTimeout(id);
  }, [show3d]);
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
      <Toasts />
    </div>
  );
}
