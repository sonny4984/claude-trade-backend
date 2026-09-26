/**
 * 다빈치 코드 게임 화면 — 위에서부터: 상단 바, 3D 무대, 상대들의 코드(펠트), 상태 줄, 내 코드, 조작.
 */
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../../store/game';
import { useT, useLang, subj } from '../../i18n';
import { Icon } from '../../ui/components/Icon';
import { Sheet } from '../../ui/game/Overlays';
import { usePortrait } from '../../characters/portrait3d';
import type { CharacterId } from '../../characters/roster';
import type { Expression } from '../../characters/draw2d';
import { codaColor, codaTiles, codaValue, guessOf, hiddenCount, validSlots, type CodaGuess, type CodaPlayer, type CodaSlot } from '../engine';
import { knownTiles } from '../deduce';
import { isHumanTurn, useCoda, valueText, viewerOf, type CodaSession } from '../store';
import { CodaTile } from './CodaTile';
import { CodaStage } from './CodaStage';
import { OnlineChip, OnlineNotice } from '../../ui/online/OnlineNotice';

type T = ReturnType<typeof useT>;

function colorWord(t: T, c: 'black' | 'white'): string {
  return t(`coda.${c}`);
}

function ownerOf(lang: 'ko' | 'en', name: string): string {
  return lang === 'ko' ? `${name}의` : `${name}’s`;
}

function slotLabel(t: T, lang: 'ko' | 'en', owner: string | null, pos: number, slot: CodaSlot, faceUp: boolean): string {
  const color = colorWord(t, codaColor(slot.tile));
  let state = slot.revealed ? t('coda.stateOpen') : t('coda.stateHidden');
  if (slot.misses.length) state += t('coda.stateMisses', { list: slot.misses.map((m) => (m === 'joker' ? t('coda.joker') : m)).join('·') });
  if (owner === null) {
    const v = codaValue(slot.tile);
    return t('coda.tileMine', { pos: pos + 1, color, value: v === null ? t('coda.joker') : v, state });
  }
  const shown = faceUp && slot.revealed ? `, ${valueText(guessOf(slot.tile))}` : '';
  return t('coda.tileOther', { owner: ownerOf(lang, owner), pos: pos + 1, color, state: shown + state });
}

// ─────────────────────────────── 상대 줄 ───────────────────────────────

function Face({ character, ex, size }: { character: CharacterId; ex: Expression; size: number }) {
  const src = usePortrait(character, ex, 128);
  return <img className="portrait" src={src} width={size} height={size} alt="" />;
}

function OpponentRow({ session, seat }: { session: CodaSession; seat: number }) {
  const t = useT();
  const lang = useLang();
  const selected = useCoda((s) => s.selected);
  const pending = useCoda((s) => s.pending);
  const flash = useCoda((s) => s.flash);
  const hint = useCoda((s) => s.hint);
  const curtain = useCoda((s) => s.curtain);
  const st = session.state;
  const p = st.players[seat] as CodaPlayer;
  const meta = session.meta[seat];
  const over = st.phase === 'over';
  const canPick = isHumanTurn(session) && st.phase === 'guess' && !pending && !curtain && !p.out;
  return (
    <section className="code-row" data-current={!over && st.current === seat ? true : undefined} data-out={p.out || undefined} aria-label={p.name}>
      <header className="code-row-head">
        {meta && <Face character={meta.character} ex={p.out ? 'lose' : 'idle'} size={26} />}
        <b>{p.name}</b>
        <span>{p.out ? t('coda.out', { name: '' }).trim() : t('coda.hiddenN', { n: hiddenCount(p) })}</span>
      </header>
      <div className="code-tiles">
        {p.row.map((slot, i) => {
          const faceUp = slot.revealed || over;
          const isSel = selected?.target === seat && selected.index === i;
          const isPending = pending?.target === seat && pending.index === i;
          const isFlash = flash && flash.target === seat && flash.tile === slot.tile;
          return (
            <CodaTile
              key={slot.tile}
              id={slot.tile}
              faceUp={faceUp}
              revealed={slot.revealed}
              selected={isSel}
              pending={isPending}
              flash={isFlash ? (flash.hit ? 'hit' : 'open') : null}
              hinted={hint?.target === seat && hint.index === i}
              misses={slot.revealed ? undefined : slot.misses}
              callout={isPending ? t('coda.say', { value: valueText(pending.value) }) : null}
              label={slotLabel(t, lang, p.name, i, slot, faceUp)}
              onClick={canPick && !slot.revealed ? () => useCoda.getState().select(seat, i) : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}

// ─────────────────────────────── 내 줄 ───────────────────────────────

function MyCode({ session }: { session: CodaSession }) {
  const t = useT();
  const lang = useLang();
  const flash = useCoda((s) => s.flash);
  const curtain = useCoda((s) => s.curtain);
  const st = session.state;
  const viewer = viewerOf(session);
  const me = st.players[viewer] as CodaPlayer;
  const mine = st.current === viewer && isHumanTurn(session) && !curtain;
  const placing = mine && st.phase === 'place' && st.drawn !== null;
  const gaps = placing ? validSlots(me.row, st.drawn as number) : [];
  const revealing = mine && st.phase === 'reveal-own';
  const showDrawn = st.current === viewer && st.drawn !== null && !curtain && st.phase !== 'over';
  const tiles: React.ReactNode[] = [];
  me.row.forEach((slot, i) => {
    if (gaps.includes(i)) tiles.push(<button key={`g${i}`} type="button" className="code-gap" aria-label={t('coda.gap')} onClick={() => useCoda.getState().place(i)} />);
    const isFlash = flash && flash.target === viewer && flash.tile === slot.tile;
    tiles.push(
      <CodaTile
        key={slot.tile}
        id={slot.tile}
        faceUp
        revealed={slot.revealed}
        secret={!slot.revealed}
        flash={isFlash ? 'open' : null}
        size="lg"
        label={slotLabel(t, lang, null, i, slot, true)}
        onClick={revealing && !slot.revealed ? () => useCoda.getState().revealOwn(i) : undefined}
      />,
    );
  });
  if (gaps.includes(me.row.length)) tiles.push(<button key="gend" type="button" className="code-gap" aria-label={t('coda.gap')} onClick={() => useCoda.getState().place(me.row.length)} />);
  return (
    <section className="my-code" aria-label={t('coda.myCode')} data-choosing={placing || revealing || undefined}>
      <header className="my-code-head">
        <b>{session.mode === 'local' ? me.name : t('coda.myCode')}</b>
        <span>{t('coda.hiddenN', { n: hiddenCount(me) })}</span>
        {showDrawn && (
          <span className="my-drawn">
            <small>{t('coda.drawn')}</small>
            <CodaTile id={st.drawn as number} faceUp revealed={st.phase === 'place' && st.placeRevealed} secret size="sm" label={`${t('coda.drawn')} ${slotLabel(t, lang, null, 0, { tile: st.drawn as number, revealed: false, misses: [] }, true)}`} />
          </span>
        )}
      </header>
      <div className="code-tiles mine">{tiles}</div>
    </section>
  );
}

// ─────────────────────────────── 조작 ───────────────────────────────

function NumberPad({ session }: { session: CodaSession }) {
  const t = useT();
  const lang = useLang();
  const selected = useCoda((s) => s.selected);
  const hint = useCoda((s) => s.hint);
  const st = session.state;
  const viewer = st.current;
  const known = useMemo(() => knownTiles(st, viewer), [st, viewer]);
  if (!selected) return null;
  const owner = st.players[selected.target] as CodaPlayer;
  const slot = owner.row[selected.index];
  if (!slot) return null;
  const color = codaColor(slot.tile);
  const values: CodaGuess[] = codaTiles(st.jokers)
    .filter((id) => codaColor(id) === color)
    .map(guessOf);
  const store = useCoda.getState();
  const hintHere = hint && hint.target === selected.target && hint.index === selected.index ? hint : null;
  return (
    <div className="numpad-wrap">
      <p className="numpad-title">{t('coda.pickValue', { owner: ownerOf(lang, owner.name), color: colorWord(t, color) })}</p>
      <div className="numpad" data-color={color} role="group" aria-label={t('coda.pickValue', { owner: ownerOf(lang, owner.name), color: colorWord(t, color) })}>
        {values.map((v) => {
          const id = v === 'joker' ? (color === 'black' ? 12 : 25) : (color === 'black' ? 0 : 13) + v;
          const impossible = known.has(id) || slot.misses.includes(v);
          const p = hintHere?.candidates?.find((c) => c.value === v)?.p ?? (hintHere?.best?.value === v ? hintHere.best.p : undefined);
          return (
            <button key={String(v)} type="button" disabled={impossible} data-hint={p !== undefined ? Math.round(p * 100) : undefined} onClick={() => store.guess(v)}>
              {v === 'joker' ? '−' : v}
              {p !== undefined && <small>{Math.round(p * 100)}%</small>}
            </button>
          );
        })}
      </div>
      <div className="numpad-row">
        <button type="button" className="btn btn-ghost" onClick={() => store.clearSelect()}>
          {t('coda.cancel')}
        </button>
        <HintButton session={session} />
      </div>
    </div>
  );
}

function HintButton({ session }: { session: CodaSession }) {
  const t = useT();
  const left = session.hintsLeft;
  if (left <= 0 && left !== Infinity) return null;
  return (
    <button type="button" className="btn btn-secondary coda-hint" onClick={() => useCoda.getState().requestHint()}>
      <Icon name="hint" size={18} />
      {Number.isFinite(left) ? t('coda.hintLeft', { n: left }) : t('coda.hint')}
    </button>
  );
}

function Actions({ session }: { session: CodaSession }) {
  const t = useT();
  const selected = useCoda((s) => s.selected);
  const pending = useCoda((s) => s.pending);
  const curtain = useCoda((s) => s.curtain);
  const st = session.state;
  if (st.phase === 'over' || curtain) return <nav className="coda-actions" />;
  if (!isHumanTurn(session)) return <nav className="coda-actions" aria-hidden="true" />;
  const store = useCoda.getState();
  if (st.phase === 'guess') {
    if (pending) return <nav className="coda-actions" />;
    if (selected) return <nav className="coda-actions"><NumberPad session={session} /></nav>;
    return (
      <nav className="coda-actions">
        <div className="numpad-row">
          <HintButton session={session} />
        </div>
      </nav>
    );
  }
  if (st.phase === 'decide') {
    return (
      <nav className="coda-actions">
        <div className="moves">
          <button type="button" className="btn btn-secondary" onClick={() => store.stop()}>
            {st.drawn === null ? t('coda.stopNoDraw') : t('coda.stop')}
          </button>
          <button type="button" className="btn btn-primary" autoFocus onClick={() => store.cont()}>
            {t('coda.continue')}
          </button>
        </div>
      </nav>
    );
  }
  return <nav className="coda-actions" />;
}

function statusText(t: T, lang: 'ko' | 'en', session: CodaSession, ai: { seat: number; phase: string } | null, last: string | null, selected: boolean, waiting: boolean): string {
  const st = session.state;
  if (st.phase === 'over') return last ?? '';
  if (waiting) return t('online.sending');
  if (ai) {
    const name = st.players[ai.seat]?.name ?? '';
    return ai.phase === 'thinking' ? t('coda.aiThinking', { subj: subj(lang, name) }) : last ?? '';
  }
  if (!isHumanTurn(session)) {
    // 온라인에서 친구 차례: 방금 일어난 일, 없으면 누구 차례인지
    if (session.online && st.players[st.current]?.seat === 'human') return last ?? t('online.turnOf', { subj: subj(lang, st.players[st.current]?.name ?? '') });
    return last ?? '';
  }
  switch (st.phase) {
    case 'guess':
      return selected ? '' : st.streak > 0 ? (last ?? t('coda.pick')) : t('coda.pick');
    case 'decide':
      return t('coda.decide');
    case 'place':
      return st.placeRevealed ? t('coda.placeRevealed') : t('coda.place');
    case 'reveal-own':
      return t('coda.revealOwn');
    default:
      return '';
  }
}

// ─────────────────────────────── 겹치는 화면 ───────────────────────────────

function Curtain({ session }: { session: CodaSession }) {
  const t = useT();
  const curtain = useCoda((s) => s.curtain);
  const last = useCoda((s) => s.lastText);
  if (!curtain) return null;
  const st = session.state;
  const name = st.players[st.current]?.name ?? '';
  const meta = session.meta[st.current];
  return (
    <div className="curtain" role="dialog" aria-modal="true" aria-label={t('curtain.title', { name })}>
      <div className="curtain-card">
        {meta && <Face character={meta.character} ex="idle" size={96} />}
        <h2 className="curtain-title">{t('curtain.title', { name })}</h2>
        <p className="curtain-sub">{t('curtain.sub', { name })}</p>
        {last && <p className="curtain-last">{t('curtain.last', { text: last })}</p>}
        <button type="button" className="btn btn-primary btn-lg" autoFocus onClick={() => useCoda.getState().reveal()}>
          {t('curtain.tap')}
        </button>
      </div>
    </div>
  );
}

function Menu() {
  const t = useT();
  const overlay = useCoda((s) => s.overlay);
  const online = useCoda((s) => !!s.session?.online);
  const [confirm, setConfirm] = useState(false);
  if (overlay !== 'menu') return null;
  const store = useCoda.getState();
  const go = useGame.getState().go;
  return (
    <Sheet label={t('menu.title')} onClose={() => store.closeOverlay()}>
      <h2 className="sheet-title">{t('menu.title')}</h2>
      {!confirm ? (
        <div className="sheet-list">
          <button type="button" className="btn btn-primary" autoFocus onClick={() => store.closeOverlay()}>
            {t('menu.resume')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => go('rules')}>
            {t('menu.rules')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => go('settings')}>
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

function Log({ session }: { session: CodaSession }) {
  const t = useT();
  const overlay = useCoda((s) => s.overlay);
  if (overlay !== 'log') return null;
  const st = session.state;
  const entries = [...st.log].reverse();
  return (
    <Sheet label={t('coda.log')} onClose={() => useCoda.getState().closeOverlay()}>
      <h2 className="sheet-title">{t('coda.log')}</h2>
      {!entries.length ? (
        <p className="sheet-text">{t('coda.logEmpty')}</p>
      ) : (
        <ol className="coda-log">
          {entries.map((e, i) => (
            <li key={i} data-hit={e.hit || undefined}>
              <span className="coda-log-who">
                {st.players[e.p]?.name} → {st.players[e.target]?.name}
              </span>
              <span className="coda-log-tile" data-color={e.color}>
                {e.value === 'joker' ? '−' : e.value}
              </span>
              <b>{e.hit ? '✓' : '✕'}</b>
            </li>
          ))}
        </ol>
      )}
      <div className="sheet-row">
        <button type="button" className="btn btn-secondary" autoFocus onClick={() => useCoda.getState().closeOverlay()}>
          {t('action.close')}
        </button>
      </div>
    </Sheet>
  );
}

function Result({ session }: { session: CodaSession }) {
  const t = useT();
  const lang = useLang();
  const overlay = useCoda((s) => s.overlay);
  if (overlay !== 'over') return null;
  const st = session.state;
  const w = st.winner ?? 0;
  const winner = st.players[w];
  const humanIdx = session.online ? session.online.mySeat : st.players.findIndex((p) => p.seat === 'human');
  const solo = session.mode === 'solo' || session.mode === 'online';
  const guest = session.online?.role === 'guest';
  const title = solo ? (w === humanIdx ? t('coda.youWin') : t('coda.youLose', { subj: subj(lang, winner?.name ?? '') })) : t('coda.winner', { name: winner?.name ?? '' });
  const focus = solo ? Math.max(0, humanIdx) : w;
  const fs = st.players[focus]?.stats;
  const order = st.players.map((_, i) => i).sort((a, b) => (a === w ? -1 : b === w ? 1 : hiddenCount(st.players[b] as CodaPlayer) - hiddenCount(st.players[a] as CodaPlayer)));
  const store = useCoda.getState();
  const pct = (c: number, g: number): string => `${g ? Math.round((c / g) * 100) : 0}%`;
  return (
    <div className="result-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="result coda-result">
        <p className="result-kicker">{t('coda.kicker')}</p>
        <h2 className="result-title">{title}</h2>
        <ol className="result-players">
          {order.map((i) => {
            const p = st.players[i] as CodaPlayer;
            const meta = session.meta[i];
            const won = i === w;
            return (
              <li key={i} className="result-player" data-won={won || undefined}>
                {meta && <Face character={meta.character} ex={won ? 'win' : 'lose'} size={48} />}
                <div className="result-name">
                  <b>{p.name}</b>
                  <span className="result-left">
                    {t('coda.accuracy')} {pct(p.stats.correct, p.stats.guesses)} · {t('coda.bestStreak')} {p.stats.bestStreak}
                  </span>
                </div>
                <div className="result-rack coda-rack" aria-hidden="true">
                  {p.row.map((slot) => (
                    <CodaTile key={slot.tile} id={slot.tile} faceUp revealed={slot.revealed} size="sm" label="" />
                  ))}
                </div>
                <div className="result-score" data-sign={won ? 'plus' : 'minus'}>
                  {hiddenCount(p)}
                </div>
              </li>
            );
          })}
        </ol>
        {fs && (
          <dl className="result-stats">
            <div>
              <dt>{t('coda.accuracy')}</dt>
              <dd>{pct(fs.correct, fs.guesses)}</dd>
            </div>
            <div>
              <dt>{t('coda.guesses')}</dt>
              <dd>{fs.guesses}</dd>
            </div>
            <div>
              <dt>{t('coda.bestStreak')}</dt>
              <dd>{fs.bestStreak}</dd>
            </div>
            <div>
              <dt>{t('coda.turns')}</dt>
              <dd>{st.turnNo}</dd>
            </div>
          </dl>
        )}
        <div className="result-actions">
          {guest ? (
            <p className="result-wait">{t('online.waitHost')}</p>
          ) : (
            <button type="button" className="btn btn-primary btn-lg btn-block" autoFocus onClick={() => store.rematch()}>
              {t('coda.rematch')}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => store.quit()}>
            {session.online ? t('online.leave') : t('coda.home')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────── 화면 ───────────────────────────────

export function CodaScreen() {
  const t = useT();
  const lang = useLang();
  const session = useCoda((s) => s.session);
  const ai = useCoda((s) => s.ai);
  const last = useCoda((s) => s.lastText);
  const selected = useCoda((s) => s.selected);
  const hint = useCoda((s) => s.hint);
  const waiting = useCoda((s) => s.waiting);

  // 키보드: 숫자 0~9로 바로 추리, Esc 선택 취소, H 도우미, M 메뉴, L 기록
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const st = useCoda.getState();
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (st.overlay || st.curtain || !st.session) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') st.clearSelect();
      else if (k === 'h') st.requestHint();
      else if (k === 'm') st.openMenu();
      else if (k === 'l') st.openLog();
      else if (/^[0-9]$/.test(k) && st.selected) st.guess(Number(k));
      else if (k === 'j' && st.selected && st.session.state.jokers) st.guess('joker');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!session) return null;
  const st = session.state;
  const viewer = viewerOf(session);
  const n = st.players.length;
  const others = Array.from({ length: n - 1 }, (_, k) => (viewer + 1 + k) % n);
  const cur = st.players[st.current];
  const turnLabel =
    st.phase === 'over'
      ? ''
      : isHumanTurn(session) && (session.mode === 'solo' || session.mode === 'online')
        ? t('hud.yourTurn')
        : ai?.phase === 'thinking'
          ? t('coda.aiThinking', { subj: subj(lang, cur?.name ?? '') })
          : t('hud.turnOf', { name: cur?.name ?? '' });
  const status = statusText(t, lang, session, ai, last, !!selected, waiting);
  const hintBest = hint?.best && !selected ? null : hint?.best;
  const store = useCoda.getState();
  return (
    <div className="game coda" data-mode={session.mode}>
      <header className="hud">
        <button type="button" className="icon-btn" aria-label={t('hud.menu')} onClick={() => store.openMenu()}>
          <Icon name="menu" />
        </button>
        <div className="hud-turn" aria-live="polite">
          <span className="hud-turn-dot" data-ai={cur?.seat === 'ai' || undefined} />
          <span className="hud-turn-text">{turnLabel}</span>
        </div>
        <div className="hud-right">
          <OnlineChip />
          <button type="button" className="icon-btn small" aria-label={t('coda.log')} onClick={() => store.openLog()}>
            <Icon name="list" size={18} />
          </button>
          <span className="hud-chip hud-pool" aria-label={`${t('coda.pool')} ${st.pool.length}`}>
            <span className="pool-stack coda-pool" aria-hidden="true" />
            <b>{st.pool.length}</b>
          </span>
        </div>
      </header>
      <CodaStage />
      <main className="felt coda-felt" aria-label={t('coda.title')}>
        <div className="felt-scroll">
          {others.map((seat) => (
            <OpponentRow key={seat} session={session} seat={seat} />
          ))}
        </div>
      </main>
      <p className="status" aria-live="polite">
        <span className="status-text">{hintBest ? t('coda.hintBest', { value: valueText(hintBest.value), p: Math.round(hintBest.p * 100) }) : status}</span>
      </p>
      <MyCode session={session} />
      <Actions session={session} />
      <OnlineNotice />
      <Curtain session={session} />
      <Menu />
      <Log session={session} />
      <Result session={session} />
    </div>
  );
}
