/**
 * 별판 점프 화면 — 위: 상단 바, 자리들(얼굴·색·도착한 말), 가운데: 별판, 아래: 안내 줄과 되돌리기.
 */
import { useMemo, useState } from 'react';
import { useGame } from '../../store/game';
import { useT } from '../../i18n';
import { Icon } from '../../ui/components/Icon';
import { Sheet } from '../../ui/game/Overlays';
import { OnlineChip, OnlineNotice } from '../../ui/online/OnlineNotice';
import { usePortrait } from '../../characters/portrait3d';
import type { CharacterId } from '../../characters/roster';
import { arrived, remaining, MIN_REMAINING } from '../engine';
import { isMyTurn, movable, useStar, viewerSeat, type StarSession } from '../store';
import { Board } from './Board';
import { SEAT_COLORS } from './colors';

function Face({ id, size = 34 }: { id: CharacterId; size?: number }) {
  const src = usePortrait(id, 'idle', 96);
  return <img className="portrait" src={src} width={size} height={size} alt="" />;
}

function Players({ s }: { s: StarSession }) {
  const t = useT();
  const ai = useStar((x) => x.ai);
  const st = s.state;
  const me = viewerSeat(s);
  return (
    <div className="star-players">
      {st.players.map((p, i) => (
        <div key={i} className="star-player" data-current={(st.winner === null && st.turn === i) || undefined} data-won={st.winner === i || undefined} data-me={me === i || undefined} data-thinking={ai === i || undefined}>
          <span className="star-player-face" style={{ borderColor: SEAT_COLORS[i] }}>
            <Face id={p.character} />
          </span>
          <span className="star-player-text">
            <b>{p.name}</b>
            <small aria-label={t('star.arrivedLabel')}>
              <i className="star-dot" style={{ background: SEAT_COLORS[i] }} /> {t('star.arrived', { n: arrived(st, i) })}
            </small>
          </span>
        </div>
      ))}
    </div>
  );
}

function Status({ s }: { s: StarSession }) {
  const t = useT();
  const ai = useStar((x) => x.ai);
  const sel = useStar((x) => x.selected);
  const waiting = useStar((x) => x.waiting);
  const st = s.state;
  const cur = st.players[st.turn];
  let text = '';
  if (st.winner !== null) text = t('star.win', { name: st.players[st.winner]?.name ?? '' });
  else if (waiting) text = t('star.waiting');
  else if (ai !== null) text = t('star.thinking', { name: cur?.name ?? '' });
  else if (isMyTurn(s) && (s.online || viewerSeat(s) !== null)) text = sel === null ? t('star.myTurn') : t('star.pickTarget');
  else if (isMyTurn(s)) text = `${t('star.turnOf', { name: cur?.name ?? '' })}${sel === null ? '' : ` — ${t('star.pickTarget')}`}`;
  else text = t('star.turnOf', { name: cur?.name ?? '' });
  return (
    <p className="star-status" aria-live="polite" style={{ borderColor: st.winner === null ? SEAT_COLORS[st.turn] : 'transparent' }}>
      {text}
    </p>
  );
}

function Menu({ s }: { s: StarSession }) {
  const t = useT();
  const overlay = useStar((x) => x.overlay);
  const [confirm, setConfirm] = useState(false);
  if (overlay !== 'menu') return null;
  const store = useStar.getState();
  return (
    <Sheet label={t('menu.title')} onClose={() => store.closeOverlay()}>
      <h2 className="sheet-title">{t('menu.title')}</h2>
      {!confirm ? (
        <div className="sheet-list">
          <button type="button" className="btn btn-primary" autoFocus onClick={() => store.closeOverlay()}>
            {t('menu.resume')}
          </button>
          {s.state.winner === null && (
            <button type="button" className="btn btn-secondary" onClick={() => store.resign()}>
              {t('star.resign')}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => useGame.getState().go('settings')}>
            {t('menu.settings')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm(true)}>
            {t('menu.quit')}
          </button>
        </div>
      ) : (
        <div className="sheet-list">
          <p className="sheet-text">{t(s.online ? 'online.confirmLeave' : 'star.confirmQuit')}</p>
          <button type="button" className="btn btn-danger" onClick={() => store.quit()}>
            {t('action.quit')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>
            {t('action.cancel')}
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Over({ s }: { s: StarSession }) {
  const t = useT();
  const overlay = useStar((x) => x.overlay);
  const w = s.state.winner;
  if (overlay !== 'over' || w === null) return null;
  const st = s.state;
  const winName = st.players[w]?.name ?? '';
  const store = useStar.getState();
  const order = st.players.map((p, i) => ({ p, i, home: arrived(st, i), left: remaining(st, i) - MIN_REMAINING })).sort((a, b) => (a.i === st.winner ? -1 : b.i === st.winner ? 1 : a.left - b.left));
  const canRematch = !s.online || s.online.role === 'host';
  return (
    <Sheet label={t('star.win', { name: winName })} onClose={() => store.closeOverlay()}>
      <h2 className="sheet-title star-win">{t('star.win', { name: winName })}</h2>
      <p className="sheet-text">{t(st.reason === 'limit' ? 'star.winLimit' : st.reason === 'resign' ? 'star.winResign' : 'star.winHome')}</p>
      <ol className="star-rank">
        {order.map(({ p, i, home, left }) => (
          <li key={i} data-won={i === st.winner || undefined}>
            <Face id={p.character} size={28} />
            <span>{p.name}</span>
            <small>
              {t('star.arrived', { n: home })} · {t('star.left', { n: Math.max(0, left) })}
            </small>
          </li>
        ))}
      </ol>
      <div className="sheet-list">
        {canRematch && (
          <button type="button" className="btn btn-primary star-rematch" autoFocus onClick={() => store.rematch()}>
            {t('star.rematch')}
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={() => store.quit()}>
          {t('star.home')}
        </button>
      </div>
    </Sheet>
  );
}

export function StarScreen() {
  const t = useT();
  const s = useStar((x) => x.session);
  const selected = useStar((x) => x.selected);
  const ai = useStar((x) => x.ai);
  const waiting = useStar((x) => x.waiting);
  const mine = s ? isMyTurn(s) && ai === null && !waiting : false;
  const can = useMemo(() => (s && mine && selected === null ? movable(s) : new Set<number>()), [s, mine, selected]);
  if (!s) return null;
  const st = s.state;
  const bottom = viewerSeat(s) ?? 0;
  const canUndo = !s.online && st.moves.some((m) => st.players[m.seat]?.seat === 'human') && ai === null;
  return (
    <div className="game star" data-over={st.winner !== null || undefined}>
      <header className="hud">
        <button type="button" className="icon-btn" aria-label={t('hud.menu')} onClick={() => useStar.getState().openMenu()}>
          <Icon name="menu" />
        </button>
        <div className="hud-turn">
          <span className="hud-turn-text">{t('star.title')}</span>
        </div>
        <div className="hud-right">
          <OnlineChip />
          <span className="hud-chip">{t('star.moves', { n: st.moves.length })}</span>
        </div>
      </header>
      <Players s={s} />
      <div className="star-wrap">
        <Board state={st} bottom={bottom} selected={selected} movable={can} onTap={(i) => useStar.getState().tap(i)} label={t('star.title')} />
      </div>
      <footer className="star-foot">
        <Status s={s} />
        {!s.online && (
          <button type="button" className="btn btn-ghost star-undo" disabled={!canUndo} onClick={() => useStar.getState().undo()}>
            <Icon name="undo" size={18} /> {t('star.undo')}
          </button>
        )}
        {st.winner !== null && (
          <button type="button" className="btn btn-primary star-again" onClick={() => useStar.setState({ overlay: 'over' })}>
            {t('star.win', { name: st.players[st.winner]?.name ?? '' })}
          </button>
        )}
      </footer>
      <OnlineNotice />
      <Menu s={s} />
      <Over s={s} />
    </div>
  );
}
