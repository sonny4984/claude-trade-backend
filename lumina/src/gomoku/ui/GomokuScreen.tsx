/**
 * 오목 게임 화면 — 위에서부터: 상단 바, 캐릭터 무대, 두 사람 표시, 오목판, 상태 줄, 조작.
 */
import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useGame } from '../../store/game';
import { useSettings } from '../../store/settings';
import { useT, useLang, subj } from '../../i18n';
import { Icon } from '../../ui/components/Icon';
import { Sheet } from '../../ui/game/Overlays';
import { OnlineChip, OnlineNotice } from '../../ui/online/OnlineNotice';
import { usePortrait, webglOK } from '../../characters/portrait3d';
import type { CharacterId } from '../../characters/roster';
import type { Expression } from '../../characters/draw2d';
import type { StagePlate, StageReaction } from '../../stage/Stage3D';
import { currentPlayer } from '../engine';
import { isMyTurn, useGomoku, viewerSeat, type GomokuSession } from '../store';
import { Board } from './Board';
import { FullscreenButton } from '../../ui/fullscreen';

const Stage3D = lazy(() => import('../../stage/Stage3D'));

function subscribeReactions(fn: (r: StageReaction) => void): () => void {
  let last = useGomoku.getState().reactions.at(-1)?.id ?? 0;
  return useGomoku.subscribe((st, prev) => {
    if (st.reactions === prev.reactions) return;
    for (const r of st.reactions) {
      if (r.id <= last) continue;
      last = r.id;
      fn(r);
    }
  });
}

function Face({ id, ex = 'idle', size = 36 }: { id: CharacterId; ex?: Expression; size?: number }) {
  const src = usePortrait(id, ex, 128);
  return <img className="portrait" src={src} width={size} height={size} alt="" />;
}

/** 상대(들) 캐릭터 무대: 3D가 되면 3D, 아니면 2D */
function GoStage({ session }: { session: GomokuSession }) {
  const t = useT();
  const ai = useGomoku((s) => s.ai);
  const show3d = useSettings((s) => s.show3d);
  const [gl] = useState(webglOK);
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);
  const me = viewerSeat(session);
  const plates = useMemo<StagePlate[]>(
    () =>
      session.state.players.flatMap((p, i) => {
        if (i === me) return [];
        const meta = session.meta[i];
        if (!meta) return [];
        return [{ seat: i, character: meta.character, name: p.name, count: session.state.moves.filter((_, k) => (k % 2 === 0 ? 1 : 2) === p.stone).length, aria: t(p.stone === 1 ? 'gomoku.black' : 'gomoku.white') }];
      }),
    [session, me, t],
  );
  if (!show3d || !gl || failed) return null;
  const cur = session.state.winner ? null : currentPlayer(session.state);
  return (
    <Suspense fallback={<div className="stage stage-loading" />}>
      <Stage3D plates={plates} current={cur} thinking={ai ? ai.seat : null} moving={null} roundKey={session.id} subscribe={subscribeReactions} onFail={onFail} />
    </Suspense>
  );
}

function Players({ session }: { session: GomokuSession }) {
  const t = useT();
  const ai = useGomoku((s) => s.ai);
  const st = session.state;
  const cur = st.winner ? -1 : currentPlayer(st);
  const me = viewerSeat(session);
  return (
    <div className="go-players">
      {st.players.map((p, i) => {
        const meta = session.meta[i];
        const won = st.winner === p.stone;
        return (
          <div key={i} className="go-player" data-current={cur === i || undefined} data-won={won || undefined} data-seat-origin={i}>
            <span className="go-dot" data-stone={p.stone} aria-hidden="true" />
            {meta && <Face id={meta.character} ex={won ? 'win' : st.winner && !won && st.winner !== 3 ? 'lose' : ai?.seat === i ? 'think' : 'idle'} />}
            <span className="go-player-name">
              <b>{p.name}</b>
              <small>
                {t(p.stone === 1 ? 'gomoku.black' : 'gomoku.white')}
                {me === i ? ` · ${t('gomoku.you')}` : p.seat === 'ai' ? ` · ${t(`ai.${p.ai ?? 'casual'}`)}` : ''}
              </small>
            </span>
            {ai?.seat === i && (
              <span className="thinking" aria-label={t('ai.thinking')}>
                <i />
                <i />
                <i />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Menu({ session }: { session: GomokuSession }) {
  const t = useT();
  const overlay = useGomoku((s) => s.overlay);
  const [confirm, setConfirm] = useState<null | 'quit' | 'resign'>(null);
  if (overlay !== 'menu') return null;
  const store = useGomoku.getState();
  const go = useGame.getState().go;
  const online = !!session.online;
  return (
    <Sheet label={t('menu.title')} onClose={() => store.closeOverlay()}>
      <h2 className="sheet-title">{t('menu.title')}</h2>
      {!confirm ? (
        <div className="sheet-list">
          <button type="button" className="btn btn-primary" autoFocus onClick={() => store.closeOverlay()}>
            {t('menu.resume')}
          </button>
          {!session.state.winner && (
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm('resign')}>
              {t('gomoku.resign')}
            </button>
          )}
          <FullscreenButton />
          <button type="button" className="btn btn-secondary" onClick={() => go('settings')}>
            {t('menu.settings')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm('quit')}>
            {t('menu.quit')}
          </button>
        </div>
      ) : (
        <div className="sheet-list">
          <p className="sheet-text">{confirm === 'resign' ? t('gomoku.resignConfirm') : t(online ? 'online.confirmLeave' : 'confirm.quit')}</p>
          <button type="button" className="btn btn-danger" onClick={() => (confirm === 'resign' ? store.resign() : store.quit())}>
            {confirm === 'resign' ? t('gomoku.resign') : t('action.quit')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>
            {t('action.cancel')}
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Result({ session }: { session: GomokuSession }) {
  const t = useT();
  const lang = useLang();
  const overlay = useGomoku((s) => s.overlay);
  if (overlay !== 'over') return null;
  const st = session.state;
  const store = useGomoku.getState();
  const me = viewerSeat(session);
  const winnerSeat = st.winner === 3 ? -1 : st.players[0].stone === st.winner ? 0 : 1;
  const winner = winnerSeat === 0 ? st.players[0] : winnerSeat === 1 ? st.players[1] : null;
  const title =
    st.winner === 3
      ? t('gomoku.draw')
      : me === null
        ? t('gomoku.win', { name: winner?.name ?? '' })
        : me === winnerSeat
          ? t('gomoku.youWin')
          : t('gomoku.youLose', { subj: subj(lang, winner?.name ?? '') });
  const guest = session.online?.role === 'guest';
  return (
    <div className="result-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="result go-result">
        <p className="result-kicker">{st.resigned ? t('gomoku.resigned', { name: st.players[st.players[0].stone === st.resigned ? 0 : 1].name }) : t('gomoku.moves', { n: st.moves.length })}</p>
        <h2 className="result-title">{title}</h2>
        <div className="go-result-faces">
          {st.players.map((p, i) => {
            const meta = session.meta[i];
            return (
              <div key={i} className="go-result-face" data-won={winnerSeat === i || undefined}>
                {meta && <Face id={meta.character} ex={winnerSeat === i ? 'win' : st.winner === 3 ? 'idle' : 'lose'} size={64} />}
                <b>{p.name}</b>
                <small>{t(p.stone === 1 ? 'gomoku.black' : 'gomoku.white')}</small>
              </div>
            );
          })}
        </div>
        <div className="result-actions">
          {guest ? (
            <p className="result-wait">{t('online.waitHost')}</p>
          ) : (
            <button type="button" className="btn btn-primary btn-lg btn-block" autoFocus onClick={() => store.rematch()}>
              {t('gomoku.rematch')}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => store.quit()}>
            {session.online ? t('online.leave') : t('gomoku.home')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function GomokuScreen() {
  const t = useT();
  const lang = useLang();
  const session = useGomoku((s) => s.session);
  const preview = useGomoku((s) => s.preview);
  const hintCell = useGomoku((s) => s.hintCell);
  const ai = useGomoku((s) => s.ai);
  const waiting = useGomoku((s) => s.waiting);
  if (!session) return null;
  const st = session.state;
  const store = useGomoku.getState();
  const mine = isMyTurn(session) && !ai && !waiting;
  const cur = currentPlayer(st);
  const curP = st.players[cur];
  const me = viewerSeat(session);
  const myStone = me !== null ? st.players[me]?.stone : null;
  const turnLabel = st.winner ? '' : mine && session.mode !== 'local' ? t('gomoku.yourTurn') : t('gomoku.turnOf', { name: curP?.name ?? '' });
  const status = st.winner
    ? ''
    : waiting
      ? t('online.sending')
      : ai
        ? t('gomoku.aiThinking', { subj: subj(lang, curP?.name ?? '') })
        : !isMyTurn(session)
          ? t('online.turnOf', { subj: subj(lang, curP?.name ?? '') })
          : preview !== null
            ? t('gomoku.statusPreview')
            : t('gomoku.tapHint');
  const canUndo = !session.online && !ai && st.moves.length > 0 && (session.mode === 'local' || isMyTurn(session) || !!st.winner);
  const showForbidden = st.rules.noDoubleThree && st.turn === 1 && (session.mode === 'local' ? curP?.seat === 'human' : myStone === 1);
  return (
    <div className="game gomoku" data-mode={session.mode}>
      <header className="hud">
        <button type="button" className="icon-btn" aria-label={t('hud.menu')} onClick={() => store.openMenu()}>
          <Icon name="menu" />
        </button>
        <div className="hud-turn" aria-live="polite">
          <span className="hud-turn-dot" data-ai={curP?.seat === 'ai' || undefined} />
          <span className="hud-turn-text">{turnLabel}</span>
        </div>
        <div className="hud-right">
          <OnlineChip />
          <span className="hud-chip">{t('gomoku.moves', { n: st.moves.length })}</span>
        </div>
      </header>
      <GoStage session={session} />
      <main className="felt go-felt">
        <Board
          state={st}
          preview={preview}
          hint={hintCell}
          active={mine}
          showForbidden={showForbidden}
          label={t('gomoku.boardLabel', { n: st.moves.length })}
          onTap={(c) => store.tap(c)}
          onConfirm={() => store.confirm()}
        />
      </main>
      <Players session={session} />
      <p className="status" aria-live="polite">
        <span className="status-text">{status}</span>
      </p>
      <nav className="go-actions">
        <div className="tools">
          <button type="button" className="tool" disabled={!canUndo} onClick={() => store.undo()} aria-label={t('gomoku.undo')}>
            <Icon name="undo" />
            <span>{t('gomoku.undo')}</span>
          </button>
          <button type="button" className="tool" disabled={!mine || session.hintsLeft <= 0} onClick={() => store.hint()} aria-label={t('gomoku.hint')}>
            <Icon name="hint" />
            <span>{Number.isFinite(session.hintsLeft) ? t('gomoku.hintLeft', { n: session.hintsLeft }) : t('gomoku.hint')}</span>
          </button>
        </div>
        <button type="button" className="btn btn-primary btn-lg go-place" disabled={!mine || preview === null} data-ready={(mine && preview !== null) || undefined} onClick={() => store.confirm()}>
          {t('gomoku.place')}
        </button>
      </nav>
      <OnlineNotice />
      <Menu session={session} />
      <Result session={session} />
    </div>
  );
}
