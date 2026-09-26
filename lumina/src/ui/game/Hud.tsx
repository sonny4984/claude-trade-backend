import { useEffect, useState } from 'react';
import { useGame } from '../../store/game';
import { Icon } from '../components/Icon';
import { useT, subj, useLang } from '../../i18n';

/** 남은 시간 (초) — 1/4초마다 갱신 */
export function useTimeLeft(): { left: number; total: number } | null {
  const deadline = useGame((s) => s.deadline);
  const total = useGame((s) => s.session?.match.rules.turnSeconds ?? null);
  const [, force] = useState(0);
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => force((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [deadline]);
  if (!deadline || !total) return null;
  return { left: Math.max(0, (deadline - Date.now()) / 1000), total };
}

export function TimerRing({ size = 30 }: { size?: number }) {
  const tl = useTimeLeft();
  if (!tl) return null;
  const r = size / 2 - 2.5;
  const c = 2 * Math.PI * r;
  const frac = tl.left / tl.total;
  const warn = tl.left <= 10;
  return (
    <span className="timer" data-warn={warn || undefined} role="timer" aria-label={`${Math.ceil(tl.left)}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="timer-track" cx={size / 2} cy={size / 2} r={r} />
        <circle
          className="timer-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <b>{Math.ceil(tl.left)}</b>
    </span>
  );
}

export function Hud() {
  const t = useT();
  const lang = useLang();
  const session = useGame((s) => s.session);
  const ai = useGame((s) => s.ai);
  if (!session) return null;
  const g = session.match.game;
  const cur = session.match.seats[g.current];
  const mine = cur?.seat === 'human';
  const label =
    g.phase !== 'playing'
      ? ''
      : mine && session.mode !== 'local'
        ? t('hud.yourTurn')
        : ai
          ? t('status.aiThinking', { subj: subj(lang, cur?.name ?? '') })
          : t('hud.turnOf', { name: cur?.name ?? '' });
  const format = session.match.format;
  const gameInfo = format.kind === 'games' && format.games > 1 ? `${session.match.gameNo}/${format.games}` : null;
  return (
    <header className="hud">
      <button type="button" className="icon-btn" aria-label={t('hud.menu')} onClick={() => useGame.getState().openMenu()}>
        <Icon name="menu" />
      </button>
      <div className="hud-turn" aria-live="polite">
        <span className="hud-turn-dot" data-ai={ai ? true : undefined} />
        <span className="hud-turn-text">{label}</span>
        {mine && <TimerRing />}
      </div>
      <div className="hud-right">
        {gameInfo && <span className="hud-chip">{gameInfo}</span>}
        <span className="hud-chip hud-pool" aria-label={`${t('hud.pool')} ${g.pool.length}`}>
          <span className="pool-stack" aria-hidden="true" />
          <b>{g.pool.length}</b>
        </span>
      </div>
    </header>
  );
}
