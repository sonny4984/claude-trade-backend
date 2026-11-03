/**
 * 바다거북 스프 판 — 위: 문제(이상한 상황)와 연 힌트, 가운데: 질문·답 기록, 아래: 묻는 사람·질문 칸·정답 단추.
 * 사람 진행자는 "진행자만 보기"를 꾹 눌러 전말을 몰래 보고, 기록마다 예/아니요 단추로 답한다.
 */
import { useEffect, useRef, useState } from 'react';
import { usePortrait } from '../../characters/portrait3d';
import type { CharacterId } from '../../characters/roster';
import { Icon } from '../../ui/components/Icon';
import { Sheet } from '../../ui/game/Overlays';
import { OnlineChip, OnlineNotice } from '../../ui/online/OnlineNotice';
import { useGame } from '../../store/game';
import { useT } from '../../i18n';
import { ANSWERS, MAX_TEXT, VERDICTS, guessers, pointsFor, tally, type SoupEntry, type SoupReply, type SoupState } from '../engine';
import { puzzleById, type SoupPuzzle } from '../puzzles';
import { canHost, canSeeAnswer, mySeat, useSoup, type SoupSession } from '../store';

type T = ReturnType<typeof useT>;

function Face({ id, size = 26 }: { id: CharacterId; size?: number }) {
  const src = usePortrait(id, 'idle', 96);
  return <img className="portrait" src={src} width={size} height={size} alt="" />;
}

function Story({ s, p }: { s: SoupSession; p: SoupPuzzle }) {
  const t = useT();
  const peek = useSoup((x) => x.peek);
  const st = s.state;
  const host = canSeeAnswer(s);
  const showAnswer = st.phase === 'over' || (host && peek);
  return (
    <section className="card soup-story" aria-label={t('soup.storyLabel')}>
      <header className="soup-story-head">
        <h2>{p.title}</h2>
        <span className="soup-badges">
          <span className="soup-badge" data-level={p.level}>
            {t(`soup.levels.${p.level}`)}
          </span>
          {p.spice === 'dark' && <span className="soup-badge" data-spice="dark">{t('soup.dark')}</span>}
        </span>
      </header>
      <p className="soup-story-text">{p.story}</p>
      {st.hints > 0 && (
        <ol className="soup-hints" aria-label={t('soup.hintsLabel')}>
          {p.hints.slice(0, st.hints).map((h, i) => (
            <li key={i}>
              <b>{t('soup.hintN', { n: i + 1 })}</b> {h}
            </li>
          ))}
        </ol>
      )}
      {host && st.phase === 'play' && (
        <button
          type="button"
          className="btn btn-secondary soup-peek"
          onPointerDown={() => useSoup.getState().setPeek(true)}
          onPointerUp={() => useSoup.getState().setPeek(false)}
          onPointerLeave={() => useSoup.getState().setPeek(false)}
          onPointerCancel={() => useSoup.getState().setPeek(false)}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => e.key === ' ' && useSoup.getState().setPeek(true)}
          onKeyUp={() => useSoup.getState().setPeek(false)}
        >
          <Icon name="eye" size={18} /> {t('soup.peek')}
        </button>
      )}
      {showAnswer && (
        <div className="soup-answer" data-peek={st.phase === 'play' || undefined}>
          <b>{t('soup.answerTitle')}</b>
          <p>{p.answer}</p>
          <ul className="soup-keys">
            {p.keys.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function replyText(t: T, r: SoupReply): string {
  return t(`soup.reply.${r}`);
}

function Entry({ s, e }: { s: SoupSession; e: SoupEntry }) {
  const t = useT();
  const thinking = useSoup((x) => x.thinking === e.n);
  const st = s.state;
  const p = st.players[e.by];
  const hostHere = canHost(s) && st.host === 'human' && st.phase === 'play';
  const options: readonly SoupReply[] = e.kind === 'ask' ? ANSWERS : VERDICTS;
  return (
    <li className="soup-entry" data-kind={e.kind} data-reply={e.reply ?? 'wait'}>
      <span className="soup-who">
        {p && <Face id={p.character} size={22} />}
        <b>{p?.name ?? '?'}</b>
        {e.kind === 'guess' && <span className="soup-guess-tag">{t('soup.guessTag')}</span>}
      </span>
      <p className="soup-q">{e.text || t('soup.spoken')}</p>
      {e.reply ? (
        <span className="soup-reply" data-reply={e.reply}>
          {replyText(t, e.reply)}
          {e.note && <small>{e.note}</small>}
        </span>
      ) : hostHere ? (
        <span className="soup-reply-btns" role="group" aria-label={t('soup.answerFor', { n: e.n })}>
          {options.map((r) => (
            <button key={r} type="button" className="btn btn-secondary" data-reply={r} onClick={() => useSoup.getState().reply(e.n, r)}>
              {replyText(t, r)}
            </button>
          ))}
        </span>
      ) : st.phase === 'over' ? (
        <span className="soup-reply" data-reply="none">
          —
        </span>
      ) : (
        <span className="soup-reply" data-reply="wait">
          {thinking || st.host === 'ai' ? t('soup.thinking') : t('soup.waitHost')}
          <span className="mf-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </span>
      )}
    </li>
  );
}

function Log({ s }: { s: SoupSession }) {
  const t = useT();
  const ref = useRef<HTMLOListElement>(null);
  const n = s.state.log.length;
  const last = s.state.log[n - 1]?.reply;
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [n, last]);
  if (!n) return <p className="soup-empty">{t(s.state.host === 'ai' ? 'soup.emptyAi' : 'soup.emptyHuman')}</p>;
  return (
    <ol className="soup-log" ref={ref} aria-live="polite">
      {s.state.log.map((e) => (
        <Entry key={e.n} s={s} e={e} />
      ))}
    </ol>
  );
}

function Askers({ st }: { st: SoupState }) {
  const t = useT();
  const asker = useSoup((x) => x.asker);
  const list = guessers(st);
  if (list.length < 2) return null;
  return (
    <div className="soup-askers" role="radiogroup" aria-label={t('soup.asker')}>
      {list.map((i) => {
        const p = st.players[i];
        if (!p) return null;
        return (
          <button key={i} type="button" role="radio" aria-checked={asker === i} className="soup-asker" onClick={() => useSoup.getState().setAsker(i)}>
            <Face id={p.character} size={22} />
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

function Composer({ s }: { s: SoupSession }) {
  const t = useT();
  const [text, setText] = useState('');
  const waiting = useSoup((x) => x.waiting);
  const st = s.state;
  const me = mySeat(s);
  // 온라인 사람 진행자: 진행자 자리는 묻지 않는다
  const iAmHost = st.host === 'human' && me !== null && me === st.hostSeat;
  const localHost = st.host === 'human' && !s.online;
  const send = (kind: 'ask' | 'guess'): void => {
    const store = useSoup.getState();
    const ok = kind === 'ask' ? store.ask(text) : store.guess(text);
    if (ok) setText('');
  };
  return (
    <div className="soup-composer">
      {!s.online && <Askers st={st} />}
      {localHost && (
        <div className="soup-quick" role="group" aria-label={t('soup.quickLabel')}>
          <small>{t('soup.quickLabel')}</small>
          {ANSWERS.map((r) => (
            <button key={r} type="button" className="btn btn-secondary" data-reply={r} onClick={() => useSoup.getState().quick(r)}>
              {replyText(t, r)}
            </button>
          ))}
        </div>
      )}
      {!iAmHost && (
        <form
          className="soup-input"
          onSubmit={(e) => {
            e.preventDefault();
            send('ask');
          }}
        >
          <input
            className="text-input"
            value={text}
            maxLength={MAX_TEXT}
            enterKeyHint="send"
            placeholder={t(localHost ? 'soup.typeOptional' : 'soup.typeQuestion')}
            aria-label={t('soup.typeQuestion')}
            onChange={(e) => setText(e.target.value)}
            disabled={waiting}
          />
          <button type="submit" className="btn btn-primary soup-ask" disabled={!text.trim() || waiting}>
            {t('soup.ask')}
          </button>
          <button type="button" className="btn btn-secondary soup-guess" disabled={!text.trim() || waiting} onClick={() => send('guess')}>
            {t('soup.guess')}
          </button>
        </form>
      )}
    </div>
  );
}

function Tools({ s }: { s: SoupSession }) {
  const t = useT();
  const st = s.state;
  const host = canHost(s);
  return (
    <div className="soup-tools">
      <button type="button" className="btn btn-ghost soup-hint" disabled={st.hints >= 3} onClick={() => useSoup.getState().hint()}>
        <Icon name="hint" size={18} /> {t('soup.hint', { n: 3 - st.hints })}
      </button>
      {(host || !s.online) && (
        <button type="button" className="btn btn-ghost soup-giveup" onClick={() => useSoup.getState().reveal()} disabled={!host}>
          {t('soup.giveUp')}
        </button>
      )}
    </div>
  );
}

function Result({ s }: { s: SoupSession }) {
  const t = useT();
  const st = s.state;
  const solver = st.solvedBy === null ? null : st.players[st.solvedBy];
  const n = tally(st);
  const host = canHost(s);
  const order = st.players.map((p, i) => ({ p, i, score: st.scores[i] ?? 0 })).sort((a, b) => b.score - a.score);
  return (
    <section className="card soup-result" aria-live="polite">
      <h2>{solver ? t('soup.solved', { name: solver.name, pts: pointsFor(st.hints) }) : t('soup.revealed')}</h2>
      <p className="mf-sub">{t('soup.stats', { asks: n.asks, yes: n.yes, hints: st.hints })}</p>
      <ol className="soup-scores">
        {order.map(({ p, i, score }) => (
          <li key={i} data-host={(st.host === 'human' && st.hostSeat === i) || undefined}>
            <Face id={p.character} size={24} />
            <span>{p.name}</span>
            <b>{t('soup.points', { n: score })}</b>
          </li>
        ))}
      </ol>
      {host ? (
        <button type="button" className="btn btn-primary btn-lg btn-block soup-next" autoFocus onClick={() => useSoup.getState().next()}>
          {t('soup.next')}
        </button>
      ) : (
        <p className="mf-sub">{t('soup.waitNext')}</p>
      )}
    </section>
  );
}

function FailBar() {
  const t = useT();
  const fail = useSoup((x) => x.fail);
  if (!fail) return null;
  return (
    <div className="soup-fail" role="alert">
      <span>{t(`soup.fail.${fail}`)}</span>
      <button type="button" className="btn btn-secondary" onClick={() => useSoup.getState().retry()}>
        {t('soup.retry')}
      </button>
    </div>
  );
}

function Menu() {
  const t = useT();
  const overlay = useSoup((x) => x.overlay);
  const s = useSoup((x) => x.session);
  const [confirm, setConfirm] = useState(false);
  if (overlay !== 'menu' || !s) return null;
  const store = useSoup.getState();
  return (
    <Sheet label={t('menu.title')} onClose={() => store.closeOverlay()}>
      <h2 className="sheet-title">{t('menu.title')}</h2>
      {!confirm ? (
        <div className="sheet-list">
          <button type="button" className="btn btn-primary" autoFocus onClick={() => store.closeOverlay()}>
            {t('menu.resume')}
          </button>
          {canHost(s) && s.state.phase === 'play' && (
            <button type="button" className="btn btn-secondary" onClick={() => store.reveal()}>
              {t('soup.giveUp')}
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
          <p className="sheet-text">{t(s.online ? 'online.confirmLeave' : 'soup.confirmQuit')}</p>
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

export function SoupScreen() {
  const t = useT();
  const s = useSoup((x) => x.session);
  const who = useSoup((x) => x.who);
  if (!s) return null;
  const st = s.state;
  const p = puzzleById(st.puzzle);
  if (!p) return null;
  const hostName = st.host === 'human' && st.hostSeat !== null ? st.players[st.hostSeat]?.name ?? '' : '';
  return (
    <div className="game soup" data-phase={st.phase}>
      <header className="hud">
        <button type="button" className="icon-btn" aria-label={t('hud.menu')} onClick={() => useSoup.getState().openMenu()}>
          <Icon name="menu" />
        </button>
        <div className="hud-turn">
          <span className="hud-turn-text">{t('soup.round', { n: st.round })}</span>
        </div>
        <div className="hud-right">
          <OnlineChip />
          <span className="hud-chip soup-host-chip">{st.host === 'ai' ? t(who === 'gemini' ? 'soup.hostGemini' : 'soup.hostClaude') : t('soup.hostIs', { name: hostName })}</span>
        </div>
      </header>
      <main className="soup-main">
        <Story s={s} p={p} />
        {st.phase === 'over' && <Result s={s} />}
        <Log s={s} />
      </main>
      <FailBar />
      {st.phase === 'play' && (
        <footer className="soup-foot">
          <Tools s={s} />
          <Composer s={s} />
        </footer>
      )}
      <OnlineNotice />
      <Menu />
    </div>
  );
}
