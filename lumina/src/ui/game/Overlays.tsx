import { useEffect, useMemo, useState } from 'react';
import { useGame, mySeatOf, type Session } from '../../store/game';
import type { Expression } from '../../characters/draw2d';
import type { CharacterId } from '../../characters/roster';
import { usePortrait } from '../../characters/portrait3d';
import { analyzeSet, faceValue, isJoker, type TileId } from '../../game';
import { Tile } from '../components/Tile';
import { Icon } from '../components/Icon';
import { translateList, useLang, useT } from '../../i18n';
import { LESSONS } from '../../lessons/lessons';
import { makeShareCard } from './shareCard';
import { FullscreenButton } from '../fullscreen';

function CharacterImg({ id, ex = 'idle', size = 44 }: { id: CharacterId; ex?: Expression; size?: number }) {
  const src = usePortrait(id, ex, size > 64 ? 256 : 128);
  return <img className="portrait" src={src} width={size} height={size} alt="" />;
}

function Portrait({ session, seat, ex = 'idle', size = 44 }: { session: Session; seat: number; ex?: Expression; size?: number }) {
  const meta = session.seatsMeta[seat];
  if (!meta) return null;
  return <CharacterImg id={meta.character} ex={ex} size={size} />;
}

export function Curtain() {
  const t = useT();
  const session = useGame((s) => s.session);
  const curtain = useGame((s) => s.curtain);
  const last = useGame((s) => s.lastEventText);
  if (!session || !curtain) return null;
  const g = session.match.game;
  const name = session.match.seats[g.current]?.name ?? '';
  return (
    <div className="curtain" role="dialog" aria-modal="true" aria-label={t('curtain.title', { name })}>
      <div className="curtain-card">
        <Portrait session={session} seat={g.current} size={96} />
        <h2 className="curtain-title">{t('curtain.title', { name })}</h2>
        <p className="curtain-sub">{t('curtain.sub', { name })}</p>
        {last && <p className="curtain-last">{t('curtain.last', { text: last })}</p>}
        <button type="button" className="btn btn-primary btn-lg" autoFocus onClick={() => useGame.getState().reveal()}>
          {t('curtain.tap')}
        </button>
      </div>
    </div>
  );
}

export function Sheet({ children, label, onClose }: { children: React.ReactNode; label: string; onClose?: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="sheet">{children}</div>
    </div>
  );
}

export function MenuSheet() {
  const t = useT();
  const overlay = useGame((s) => s.overlay);
  const online = useGame((s) => !!s.session?.online);
  const [confirm, setConfirm] = useState(false);
  if (overlay !== 'menu') return null;
  const store = useGame.getState();
  return (
    <Sheet label={t('menu.title')} onClose={() => store.closeOverlay()}>
      <h2 className="sheet-title">{t('menu.title')}</h2>
      {!confirm ? (
        <div className="sheet-list">
          <button type="button" className="btn btn-primary" autoFocus onClick={() => store.closeOverlay()}>
            {t('menu.resume')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => store.go('rules')}>
            {t('menu.rules')}
          </button>
          <FullscreenButton />
          <button type="button" className="btn btn-secondary" onClick={() => store.go('settings')}>
            {t('menu.settings')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirm(true)}>
            {t('menu.quit')}
          </button>
        </div>
      ) : (
        <div className="sheet-list">
          <p className="sheet-text">{t(online ? 'online.confirmLeave' : 'confirm.quit')}</p>
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

export function ConfirmDraw() {
  const t = useT();
  const overlay = useGame((s) => s.overlay);
  if (overlay !== 'confirm-draw') return null;
  const store = useGame.getState();
  return (
    <Sheet label={t('confirm.drawWithPlay')} onClose={() => store.closeOverlay()}>
      <p className="sheet-text">{t('confirm.drawWithPlay')}</p>
      <div className="sheet-row">
        <button type="button" className="btn btn-secondary" onClick={() => store.closeOverlay()}>
          {t('action.cancel')}
        </button>
        <button type="button" className="btn btn-primary" autoFocus onClick={() => store.draw(true)}>
          {t('action.draw')}
        </button>
      </div>
    </Sheet>
  );
}

export function HintPreview() {
  const t = useT();
  const overlay = useGame((s) => s.overlay);
  const hint = useGame((s) => s.hint);
  if (overlay !== 'hint' || !hint.data) return null;
  const played = new Set(hint.data.tiles);
  const store = useGame.getState();
  return (
    <Sheet label={t('hint.l3')} onClose={() => store.closeOverlay()}>
      <h2 className="sheet-title">{t('hint.l3')}</h2>
      <div className="mini-table" style={{ ['--tw' as string]: '26px' }}>
        {hint.data.proposal.map((set, i) => (
          <div key={i} className="mini-set" data-new={set.some((x) => played.has(x)) || undefined}>
            {set.map((id) => (
              <span key={id} className="mini-slot" data-played={played.has(id) || undefined}>
                <Tile id={id} where="deco" role={analyzeSet(set).jokers.get(id) ?? null} />
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="sheet-row">
        <button type="button" className="btn btn-secondary" onClick={() => store.closeOverlay()}>
          {t('action.close')}
        </button>
        <button type="button" className="btn btn-primary" autoFocus onClick={() => store.applyHint()}>
          {t('action.apply')}
        </button>
      </div>
    </Sheet>
  );
}

function fmtDuration(ms: number, t: ReturnType<typeof useT>): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}${t('misc.min')} ${s % 60}${t('misc.sec')}` : `${s}${t('misc.sec')}`;
}

export function GameOver() {
  const t = useT();
  const lang = useLang();
  const overlay = useGame((s) => s.overlay);
  const session = useGame((s) => s.session);
  const [card, setCard] = useState<string | null>(null);
  const winners = session?.match.game.result?.winners ?? [];
  const meIdx = useMemo(() => (session ? mySeatOf(session) : 0), [session]);
  if (overlay !== 'gameover' && overlay !== 'share') return null;
  if (!session || !session.match.game.result) return null;
  const m = session.match;
  const g = m.game;
  const r = g.result as NonNullable<typeof g.result>;
  const store = useGame.getState();
  const solo = session.mode === 'solo' || session.mode === 'online';
  const guest = session.online?.role === 'guest';
  const iWon = solo && winners.includes(meIdx);
  const winnerNames = winners.map((w) => m.seats[w]?.name ?? '').join(', ');
  const title = r.reason === 'stalemate' ? t('result.stalemate') : solo ? (iWon ? t('result.youWin') : t('result.youLose', { name: winnerNames })) : t('result.winner', { name: winnerNames });
  const focus = solo ? meIdx : (winners[0] ?? 0);
  const st = g.stats[focus];
  const order = m.seats.map((_, i) => i).sort((a, b) => (r.deltas[b] ?? 0) - (r.deltas[a] ?? 0));
  const showPad = m.history.length > 1 || m.format.kind !== 'games' || m.format.games > 1;

  const share = async (): Promise<void> => {
    const url = await makeShareCard(session, lang);
    setCard(url);
  };

  return (
    <div className="result-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="result">
        <p className="result-kicker">{r.reason === 'out' ? t('result.win') : ''}</p>
        <h2 className="result-title">{title}</h2>
        {m.over && m.champions.length > 0 && (
          <p className="result-champion">{t('result.champion', { names: m.champions.map((c) => m.seats[c]?.name).join(', ') })}</p>
        )}
        <ol className="result-players">
          {order.map((i) => {
            const p = g.players[i];
            if (!p) return null;
            const won = winners.includes(i);
            return (
              <li key={i} className="result-player" data-won={won || undefined}>
                <Portrait session={session} seat={i} ex={won ? 'win' : 'lose'} size={48} />
                <div className="result-name">
                  <b>{m.seats[i]?.name}</b>
                  <span className="result-left">
                    {t('result.remaining')} {p.rack.length} · {p.rack.reduce((s, x) => s + (isJoker(x) ? m.rules.jokerPenalty : faceValue(x)), 0)}
                  </span>
                </div>
                <div className="result-rack" aria-hidden="true">
                  {p.rack.slice(0, 8).map((id: TileId) => (
                    <Tile key={id} id={id} where="deco" />
                  ))}
                  {p.rack.length > 8 && <span className="more">+{p.rack.length - 8}</span>}
                </div>
                <div className="result-score" data-sign={(r.deltas[i] ?? 0) >= 0 ? 'plus' : 'minus'}>
                  {(r.deltas[i] ?? 0) > 0 ? '+' : ''}
                  {r.deltas[i]}
                </div>
              </li>
            );
          })}
        </ol>
        {st && (
          <dl className="result-stats">
            <div>
              <dt>{t('result.duration')}</dt>
              <dd>{fmtDuration((session.endedAt ?? Date.now()) - session.startedAt, t)}</dd>
            </div>
            <div>
              <dt>{t('result.largest')}</dt>
              <dd>{t('result.tilesN', { n: st.largestMove })}</dd>
            </div>
            <div>
              <dt>{t('result.jokers')}</dt>
              <dd>{t('result.tilesN', { n: st.jokersPlayed })}</dd>
            </div>
            <div>
              <dt>{t('result.rearranged')}</dt>
              <dd>{t('result.timesN', { n: st.rearrangements })}</dd>
            </div>
          </dl>
        )}
        {showPad && (
          <table className="score-pad">
            <thead>
              <tr>
                <th />
                {m.seats.map((p, i) => (
                  <th key={i}>{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.history.map((h) => (
                <tr key={h.gameNo}>
                  <th>{t('result.game', { n: h.gameNo })}</th>
                  {h.deltas.map((d, i) => (
                    <td key={i} data-won={h.winners.includes(i) || undefined}>
                      {d > 0 ? '+' : ''}
                      {d}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>{t('result.total')}</th>
                {m.scores.map((sc, i) => (
                  <td key={i}>
                    {sc > 0 ? '+' : ''}
                    {sc}
                    <small>
                      {' '}
                      · {m.wins[i]}
                      {t('result.wins')}
                    </small>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        )}
        <div className="result-actions">
          {guest ? (
            <p className="result-wait">{t('online.waitHost')}</p>
          ) : !m.over ? (
            <button type="button" className="btn btn-primary btn-lg" autoFocus onClick={() => store.nextGame()}>
              {t('action.nextGame')}
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-lg" autoFocus onClick={() => store.rematch()}>
              {t('action.rematch')}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => void share()}>
            <Icon name="share" size={18} /> {t('action.share')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => store.quit()}>
            {session.online ? t('online.leave') : t('action.home')}
          </button>
        </div>
      </div>
      {card && <ShareSheet url={card} onClose={() => setCard(null)} />}
    </div>
  );
}

function ShareSheet({ url, onClose }: { url: string; onClose: () => void }) {
  const t = useT();
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (): Promise<void> => {
    setMsg(null);
    let blob: Blob;
    try {
      // data: URL을 직접 풀어 Blob으로 (fetch는 샌드박스의 CSP에 막힐 수 있다)
      const [head = '', body = ''] = url.split(',');
      const bin = atob(body);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      blob = new Blob([bytes], { type: /data:([^;]+)/.exec(head)?.[1] ?? 'image/png' });
    } catch {
      setMsg(t('share.fallback'));
      return;
    }
    // 1) claude.ai 아티팩트 안: 다운로드 기능 (보는 사람이 확인해야 저장된다)
    type Downloads = { save: (o: { filename: string; data: Blob }) => Promise<unknown> };
    const claude = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
    if (claude?.use) {
      const dl = (await claude.use('downloads').catch(() => null)) as Downloads | null;
      if (dl) {
        try {
          await dl.save({ filename: 'lumina.png', data: blob });
          return;
        } catch (e) {
          if ((e as { code?: string } | null)?.code === 'declined') return;
        }
      }
    }
    // 2) 휴대폰 공유 시트
    const file = new File([blob], 'lumina.png', { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    if (nav.canShare?.({ files: [file] }) && navigator.share) {
      try {
        await navigator.share({ files: [file], title: 'LUMINA' });
        return;
      } catch (e) {
        if ((e as { name?: string } | null)?.name === 'AbortError') return;
      }
    }
    // 3) 일반 브라우저: 파일로 내려받기
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lumina.png';
      a.click();
    } catch {
      /* 막힌 환경 — 아래 안내만 */
    }
    setMsg(t('share.fallback'));
  };
  return (
    <Sheet label={t('share.title')} onClose={onClose}>
      <h2 className="sheet-title">{t('share.title')}</h2>
      <img className="share-img" src={url} alt={t('share.card')} />
      {msg && <p className="sheet-text">{msg}</p>}
      <div className="sheet-row">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t('action.close')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void save()}>
          {t('share.save')}
        </button>
      </div>
    </Sheet>
  );
}

export function LessonDone() {
  const t = useT();
  const overlay = useGame((s) => s.overlay);
  const session = useGame((s) => s.session);
  if (overlay !== 'lesson-done' || !session || session.lesson === null) return null;
  const last = session.lesson >= LESSONS.length - 1;
  const store = useGame.getState();
  return (
    <Sheet label={t('lesson.done')}>
      <div className="lesson-done">
        <CharacterImg id="hwigi" ex="win" size={96} />
        <h2 className="sheet-title">{last ? t('lesson.allDone') : t('lesson.done')}</h2>
        <p className="sheet-text">{t('lesson.of', { i: session.lesson + 1, n: LESSONS.length })}</p>
        <div className="sheet-row">
          <button type="button" className="btn btn-secondary" onClick={() => store.startLesson(session.lesson as number)}>
            {t('action.retry')}
          </button>
          <button type="button" className="btn btn-primary" autoFocus onClick={() => store.nextLesson()}>
            {last ? t('action.home') : t('action.next')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function LessonBanner() {
  const t = useT();
  const session = useGame((s) => s.session);
  if (!session || session.mode !== 'lesson' || session.lesson === null) return null;
  const lesson = LESSONS[session.lesson];
  if (!lesson) return null;
  return (
    <div className="lesson-banner" role="note">
      <span className="lesson-step">{t('lesson.of', { i: session.lesson + 1, n: LESSONS.length })}</span>
      <b>{t(lesson.text(session.match.game))}</b>
      <span className="lesson-tip">{t(lesson.tip)}</span>
    </div>
  );
}

export function Toasts() {
  const toast = useGame((s) => s.toast);
  const [shown, setShown] = useState<typeof toast>(null);
  useEffect(() => {
    if (!toast) return;
    setShown(toast);
    const id = setTimeout(() => setShown((cur) => (cur?.id === toast.id ? null : cur)), toast.tone === 'bad' ? 2600 : 2000);
    return () => clearTimeout(id);
  }, [toast]);
  return (
    <div className="toast-area" aria-live="assertive">
      {shown && (
        <div key={shown.id} className="toast" data-tone={shown.tone}>
          {shown.text}
        </div>
      )}
    </div>
  );
}

export function RulesBody() {
  const lang = useLang();
  const t = useT();
  return (
    <div className="rules-body">
      <ol>
        {translateList(lang, 'rulesPage.body').map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      <p className="rules-source">{t('rulesPage.source')}</p>
    </div>
  );
}

