/**
 * 마피아 판 — 친구들 자리(초상화), 지금 말하는 친구의 말풍선, 대화 기록, 아래 단추(밤 행동·말하기·투표).
 * 친구를 눌러 고른 뒤 밤 행동·투표·"수상해/믿어"에 쓴다. 온라인이면 방 코드 칩과 누구를 기다리는지 보여 준다.
 */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { usePortrait } from '../../characters/portrait3d';
import type { Expression } from '../../characters/draw2d';
import { CHARACTERS } from '../../characters/roster';
import { Icon } from '../../ui/components/Icon';
import { OnlineChip, OnlineNotice } from '../../ui/online/OnlineNotice';
import { useLang, useT } from '../../i18n';
import type { Game, Player } from '../engine';
import { deciders, mySeatOf, useMafia, visible, type MafiaSession, type VoiceMode } from '../store';
import { nameOf } from '../talk';
import { DAILY_TOKENS } from '../budget';
import { canListen, listen } from '../voice';

type T = ReturnType<typeof useT>;

/** 위쪽 소리 단추: 켜져 있으면 끄고, 꺼져 있으면 기니피그 목소리로 */
const nextVoice = (v: VoiceMode): VoiceMode => (v === 'off' ? 'squeak' : 'off');

interface View {
  s: MafiaSession;
  g: Game;
  seat: number;
  me: Player;
}

/** 지금 고를 수 있는 친구인지 (밤에는 역할마다, 투표는 나 말고 살아 있는 친구) */
function pickable({ s, g, me }: View, p: Player): boolean {
  if (!p.alive || !me.alive || s.done.includes(me.id)) return false;
  if (g.phase === 'night') {
    if (me.role === 'doctor') return true;
    if (me.role === 'police') return p.id !== me.id && !g.checks.some(([t]) => t === p.id);
    if (me.role === 'mafia') return p.role !== 'mafia';
    return false;
  }
  return (g.phase === 'day' || g.phase === 'vote') && p.id !== me.id;
}

/** 내가 아는 그 친구의 정체 */
function knownTag({ g, me }: View, p: Player, t: T): { kind: string; text: string } | null {
  const role = (kind: string): { kind: string; text: string } => ({ kind, text: t(`mafia.roles.${kind}`) });
  if (g.phase === 'over' || !p.alive || p.id === me.id) return role(p.role);
  if (me.role === 'mafia' && p.role === 'mafia') return role('mafia');
  if (me.role === 'police') {
    const c = g.checks.find(([x]) => x === p.id);
    if (c) return c[1] ? role('mafia') : { kind: 'town', text: t('mafia.clear') };
  }
  return null;
}

function Tile({ v, p }: { v: View; p: Player }) {
  const t = useT();
  const lang = useLang();
  const speaking = useMafia((st) => st.speaking === p.id);
  const picked = useMafia((st) => st.pick === p.id);
  const { g } = v;
  const won = g.winner !== null && (g.winner === 'mafia') === (p.role === 'mafia');
  const ex: Expression = g.phase === 'over' ? (won ? 'win' : 'lose') : !p.alive ? 'lose' : speaking ? 'happy' : 'idle';
  const src = usePortrait(p.character, ex, 96);
  const tag = knownTag(v, p, t);
  const claim = [...g.claims].reverse().find((c) => c.by === p.id && c.role !== 'citizen');
  const can = pickable(v, p);
  const count = v.s.counts?.[p.id] ?? 0;
  const style = { '--mf-accent': CHARACTERS[p.character].accent } as CSSProperties;
  return (
    <li>
      <button
        type="button"
        className="mf-tile"
        style={style}
        data-dead={!p.alive || undefined}
        data-me={p.id === v.seat || undefined}
        data-human={(p.human && p.id !== v.seat) || undefined}
        data-speaking={speaking || undefined}
        data-accused={((g.phase === 'defense' || g.phase === 'verdict') && g.accused === p.id) || undefined}
        aria-pressed={picked}
        aria-disabled={!can}
        onClick={() => can && useMafia.getState().select(p.id)}
      >
        <img src={src} alt="" width={52} height={52} />
        <span className="mf-name">
          {nameOf(g, p.id, lang)}
          {p.id === v.seat && <em>{t('mafia.you')}</em>}
        </span>
        {tag ? (
          <span className="mf-tag" data-kind={tag.kind}>
            {tag.text}
          </span>
        ) : claim ? (
          <span className="mf-tag" data-kind="claim">
            {t('mafia.claimed', { role: t(`mafia.roles.${claim.role}`) })}
          </span>
        ) : null}
        {count > 0 && <b className="mf-count">{count}</b>}
      </button>
    </li>
  );
}

function Now({ v }: { v: View }) {
  const t = useT();
  const lang = useLang();
  const speaking = useMafia((st) => st.speaking);
  const thinking = useMafia((st) => st.thinking);
  const shownId = useMafia((st) => st.shownId);
  const pending = v.s.lines.some((l) => l.id > shownId && visible(l, v.seat));
  const line = speaking === null ? undefined : [...v.s.lines].reverse().find((l) => l.id <= shownId && l.by === speaking && visible(l, v.seat));
  const skip =
    pending || thinking ? (
      <button type="button" className="mf-skip" onClick={() => useMafia.getState().skip()}>
        {t('mafia.skip')}
      </button>
    ) : null;
  if (thinking && !line)
    return (
      <div className="mf-now" data-thinking="">
        <span className="mf-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>{t('mafia.thinking')}</span>
        {skip}
      </div>
    );
  if (speaking === null || !line)
    return (
      <div className="mf-now" data-empty={skip ? undefined : ''}>
        {skip}
      </div>
    );
  return (
    <div className="mf-now" aria-live="polite">
      <b>{nameOf(v.g, speaking, lang)}</b>
      <span>{line.text}</span>
      {skip}
    </div>
  );
}

function Log({ v }: { v: View }) {
  const lang = useLang();
  const shownId = useMafia((st) => st.shownId);
  const lines = v.s.lines.filter((l) => l.id <= shownId && visible(l, v.seat));
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [lines.length]);
  return (
    <ol className="mf-log" ref={ref}>
      {lines.map((l) => (
        <li key={l.id} className="mf-line" data-kind={l.kind} data-mine={(l.kind === 'chat' && l.by === v.seat) || undefined} data-whisper={(l.kind === 'secret' && l.by !== null) || undefined}>
          {l.by !== null && <b>{nameOf(v.g, l.by, lang)}</b>}
          <span>{l.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** 글 입력 (낮 대화 · 밤 마피아 귓속말) */
function TextBox({ placeholder, onSend, mic }: { placeholder: string; onSend: (text: string) => boolean; mic: boolean }) {
  const t = useT();
  const lang = useLang();
  const waiting = useMafia((st) => st.waiting);
  const [text, setText] = useState('');
  const [hearing, setHearing] = useState<{ stop(): void } | null>(null);
  const send = (): void => {
    if (onSend(text)) setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      send();
    }
  };
  const listenNow = (): void => {
    if (hearing) {
      hearing.stop();
      return;
    }
    const h = listen(lang);
    setHearing(h);
    void h.done.then((said) => {
      setHearing(null);
      if (said) setText((v) => (v ? `${v} ${said}` : said));
    });
  };
  return (
    <div className="mf-input">
      {mic && canListen() && (
        <button type="button" className="icon-btn" aria-label={hearing ? t('mafia.listening') : t('mafia.mic')} aria-pressed={!!hearing} onClick={listenNow}>
          <Icon name={hearing ? 'micOff' : 'mic'} />
        </button>
      )}
      <input
        value={text}
        maxLength={200}
        placeholder={hearing ? t('mafia.listening') : placeholder}
        aria-label={placeholder}
        enterKeyHint="send"
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
      />
      <button type="button" className="icon-btn mf-send" aria-label={t('mafia.send')} disabled={!text.trim() || waiting} onClick={send}>
        <Icon name="send" />
      </button>
    </div>
  );
}

/** "누구누구를 기다리는 중 (2/3)" */
function Wait({ v, have }: { v: View; have: readonly number[] }) {
  const t = useT();
  const lang = useLang();
  const need = deciders(v.g);
  const left = need.filter((x) => !have.includes(x));
  if (!left.length) return null;
  return <p className="mf-prompt">{t('mafia.waitFor', { names: left.map((x) => nameOf(v.g, x, lang)).join(', '), n: need.length - left.length, m: need.length })}</p>;
}

function DayControls({ v }: { v: View }) {
  const t = useT();
  const lang = useLang();
  const pick = useMafia((st) => st.pick);
  const waiting = useMafia((st) => st.waiting);
  const st = useMafia.getState();
  const { s, g, me } = v;
  const need = deciders(g);
  const ready = s.ready.filter((x) => need.includes(x)).length;
  const online = !!s.online;
  if (!me.alive)
    return (
      <div className="mf-foot">
        <p className="mf-prompt">{t('mafia.watching')}</p>
        {need.length ? (
          <Wait v={v} have={s.ready} />
        ) : (
          <div className="mf-row">
            <button type="button" className="btn" disabled={waiting} onClick={() => st.more()}>
              {t('mafia.more')}
            </button>
            <button type="button" className="btn btn-primary" disabled={waiting} onClick={() => st.ready()}>
              {t('mafia.watchVote')}
            </button>
          </div>
        )}
      </div>
    );
  const target = pick !== null && pick !== me.id ? nameOf(g, pick, lang) : null;
  const iAmReady = s.ready.includes(me.id);
  return (
    <div className="mf-foot">
      <div className="mf-chips">
        <button type="button" disabled={!target || waiting} onClick={() => st.quick('accuse')}>
          {target ? t('mafia.qAccuseN', { name: target }) : t('mafia.qAccuse')}
        </button>
        <button type="button" disabled={!target || waiting} onClick={() => st.quick('trust')}>
          {target ? t('mafia.qTrustN', { name: target }) : t('mafia.qTrust')}
        </button>
        <button type="button" disabled={waiting} onClick={() => st.quick('claim')}>
          {me.role === 'mafia' ? t('mafia.qClaimFake') : t('mafia.qClaim')}
        </button>
        <button type="button" disabled={waiting} onClick={() => st.quick('ask')}>
          {t('mafia.qAsk')}
        </button>
      </div>
      <TextBox placeholder={t('mafia.placeholder')} onSend={(text) => st.say(text)} mic />
      <div className="mf-row">
        <button type="button" className="btn" disabled={waiting} onClick={() => st.more()}>
          {t('mafia.more')}
        </button>
        <button type="button" className="btn btn-primary" disabled={waiting || iAmReady} onClick={() => st.ready()}>
          {online && need.length > 1 ? t('mafia.goVoteN', { n: ready, m: need.length }) : t('mafia.goVote')}
        </button>
      </div>
      {iAmReady && <Wait v={v} have={s.ready} />}
    </div>
  );
}

function NightControls({ v }: { v: View }) {
  const t = useT();
  const lang = useLang();
  const pick = useMafia((st) => st.pick);
  const waiting = useMafia((st) => st.waiting);
  const st = useMafia.getState();
  const { s, g, me } = v;
  const done = s.done.includes(me.id);
  const role = me.alive ? me.role : 'citizen';
  // 마피아끼리 귓속말 (동료가 살아 있을 때)
  const whisper = me.alive && me.role === 'mafia' && g.players.some((p) => p.alive && p.role === 'mafia' && p.id !== me.id);
  const box = whisper ? <TextBox placeholder={t('mafia.whisperPh')} onSend={(text) => st.whisper(text)} mic={false} /> : null;
  if (!me.alive)
    return (
      <div className="mf-foot">
        <p className="mf-prompt">{t('mafia.watching')}</p>
        {deciders(g).length ? (
          <Wait v={v} have={s.done} />
        ) : (
          <button type="button" className="btn btn-primary btn-block" disabled={waiting} onClick={() => st.night(null)}>
            {t('mafia.watchNight')}
          </button>
        )}
      </div>
    );
  if (done)
    return (
      <div className="mf-foot">
        {box}
        <Wait v={v} have={s.done} />
      </div>
    );
  const acts = role !== 'citizen';
  return (
    <div className="mf-foot">
      {box}
      <p className="mf-prompt">{t(`mafia.pickNight.${role}`)}</p>
      {acts ? (
        <button type="button" className="btn btn-primary btn-block" disabled={pick === null || waiting} onClick={() => st.night(pick)}>
          {pick === null ? t('mafia.pickFirst') : t(`mafia.nightGo.${role}`, { name: nameOf(g, pick, lang) })}
        </button>
      ) : (
        <button type="button" className="btn btn-primary btn-block" disabled={waiting} onClick={() => st.night(null)}>
          {t('mafia.sleep')}
        </button>
      )}
    </div>
  );
}

function VoteControls({ v }: { v: View }) {
  const t = useT();
  const lang = useLang();
  const pick = useMafia((st) => st.pick);
  const waiting = useMafia((st) => st.waiting);
  const st = useMafia.getState();
  const { s, g, me } = v;
  if (!me.alive || s.done.includes(me.id))
    return (
      <div className="mf-foot">
        {!me.alive && <p className="mf-prompt">{t('mafia.watching')}</p>}
        {deciders(g).length ? (
          <Wait v={v} have={s.done} />
        ) : (
          <button type="button" className="btn btn-primary btn-block" disabled={waiting} onClick={() => st.vote(null)}>
            {t('mafia.watchVote')}
          </button>
        )}
      </div>
    );
  return (
    <div className="mf-foot">
      <p className="mf-prompt">{t('mafia.pickVote')}</p>
      <div className="mf-row">
        <button type="button" className="btn btn-primary" disabled={pick === null || waiting} onClick={() => st.vote(pick)}>
          {pick === null ? t('mafia.pickFirst') : t('mafia.voteFor', { name: nameOf(g, pick, lang) })}
        </button>
        <button type="button" className="btn" disabled={waiting} onClick={() => st.vote(null)}>
          {t('mafia.abstain')}
        </button>
      </div>
    </div>
  );
}

/** 최후의 변론: 변론대에 선 게 나면 억울함을 말하고 마친다, 아니면 듣는다 */
function DefenseControls({ v }: { v: View }) {
  const t = useT();
  const lang = useLang();
  const waiting = useMafia((st) => st.waiting);
  const st = useMafia.getState();
  const { g, me } = v;
  const name = g.accused === null ? '' : nameOf(g, g.accused, lang);
  if (g.accused !== me.id)
    return (
      <div className="mf-foot">
        <p className="mf-prompt">{t('mafia.listenDefense', { name })}</p>
      </div>
    );
  return (
    <div className="mf-foot">
      <p className="mf-prompt mf-alert">{t('mafia.yourStand')}</p>
      <TextBox placeholder={t('mafia.defensePh')} onSend={(text) => (text.trim() ? (st.defend(text), true) : false)} mic />
      <div className="mf-row">
        <button type="button" className="btn" disabled={waiting} onClick={() => st.defend(st.pleaText())}>
          {t('mafia.quickPlea')}
        </button>
        <button type="button" className="btn btn-primary" disabled={waiting} onClick={() => st.defend('')}>
          {t('mafia.endDefense')}
        </button>
      </div>
    </div>
  );
}

/** 찬반 투표: 변론대의 친구를 처형할지 */
function VerdictControls({ v }: { v: View }) {
  const t = useT();
  const lang = useLang();
  const waiting = useMafia((st) => st.waiting);
  const st = useMafia.getState();
  const { s, g, me } = v;
  const name = g.accused === null ? '' : nameOf(g, g.accused, lang);
  const have = [...s.done, ...(g.accused === null ? [] : [g.accused])];
  if (!me.alive || me.id === g.accused || s.done.includes(me.id))
    return (
      <div className="mf-foot">
        {me.id === g.accused && <p className="mf-prompt mf-alert">{t('mafia.judged')}</p>}
        {!me.alive && <p className="mf-prompt">{t('mafia.watching')}</p>}
        {deciders(g).some((x) => x !== g.accused) ? (
          <Wait v={v} have={have} />
        ) : (
          <button type="button" className="btn btn-primary btn-block" disabled={waiting} onClick={() => st.verdict(false)}>
            {t('mafia.watchVote')}
          </button>
        )}
      </div>
    );
  return (
    <div className="mf-foot">
      <p className="mf-prompt">{t('mafia.verdictAsk', { name })}</p>
      <div className="mf-row">
        <button type="button" className="btn mf-yes" disabled={waiting} onClick={() => st.verdict(true)}>
          {t('mafia.yes')}
        </button>
        <button type="button" className="btn mf-no" disabled={waiting} onClick={() => st.verdict(false)}>
          {t('mafia.no')}
        </button>
      </div>
    </div>
  );
}

function OverControls({ v }: { v: View }) {
  const t = useT();
  const st = useMafia.getState();
  const { s, g, me } = v;
  const won = (g.winner === 'mafia') === (me.role === 'mafia');
  const host = !s.online || s.online.role === 'host';
  return (
    <div className="mf-foot">
      <p className="mf-result" data-win={won || undefined}>
        {won ? t('mafia.youWin') : t('mafia.youLose')} · {t(g.winner === 'town' ? 'mafia.townWin' : 'mafia.mafiaWin')}
      </p>
      {!host && <p className="mf-prompt">{t('mafia.hostAgain')}</p>}
      <div className="mf-row">
        {host && (
          <button type="button" className="btn btn-primary" onClick={() => st.again()}>
            {t('mafia.again')}
          </button>
        )}
        <button type="button" className="btn" onClick={() => st.quit()}>
          {t('mafia.exit')}
        </button>
      </div>
    </div>
  );
}

export function MafiaScreen() {
  const t = useT();
  const s = useMafia((st) => st.session);
  useMafia((st) => st.rev);
  const cfg = useMafia((st) => st.cfg);
  const claudeOk = useMafia((st) => st.claudeOk);
  const locked = useMafia((st) => st.claudeUsed >= DAILY_TOKENS);
  const geminiModel = useMafia((st) => st.geminiModel);
  const note = useMafia((st) => st.note);
  const [armed, setArm] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArm(false), 2500);
    return () => clearTimeout(id);
  }, [armed]);
  // 밤·낮·투표가 바뀌면 고른 친구를 놓는다 (다시 누르면 고르기가 풀리지 않게)
  const phaseKey = s ? `${s.game.phase}${s.game.day}` : '';
  useEffect(() => {
    useMafia.setState({ pick: null });
  }, [phaseKey]);
  const seat = mySeatOf(s);
  const me = s?.game.players[seat];
  if (!s || !me) return null;
  const v: View = { s, g: s.game, seat, me };
  const g = s.game;
  const st = useMafia.getState();
  const host = !s.online || s.online.role === 'host';
  const back = (): void => {
    if (g.phase === 'over' || armed) st.quit();
    else setArm(true);
  };
  const night = g.phase === 'night';
  const title = g.phase === 'over' ? t('mafia.over') : t(`mafia.phaseTitle.${g.phase}`, { n: g.day });
  return (
    <div className="screen mafia-screen" data-phase={g.phase}>
      <header className="mf-head">
        <button type="button" className="icon-btn" aria-label={armed ? t('mafia.quitAgain') : t('mafia.quit')} onClick={back}>
          <Icon name="back" />
        </button>
        <h1>
          <Icon name={night ? 'moon' : 'sun'} size={18} />
          {title}
        </h1>
        {s.online && <OnlineChip />}
        <button type="button" className="icon-btn" data-voice={cfg.voice} aria-label={t(`mafia.voiceNext.${cfg.voice}`)} title={t(`mafia.voiceNext.${cfg.voice}`)} onClick={() => st.setCfg({ voice: nextVoice(cfg.voice) })}>
          <Icon name={cfg.voice === 'off' ? 'volumeOff' : 'volume'} />
        </button>
        {host && claudeOk ? (
          <button
            type="button"
            className="mf-claude"
            aria-pressed={cfg.claude && !locked}
            disabled={locked}
            aria-label={locked ? t('mafia.claudeLockedBtn') : cfg.claude ? t('mafia.claudeOffBtn') : t('mafia.claudeOnBtn')}
            title={locked ? t('mafia.claudeLockedBtn') : undefined}
            onClick={() => st.setCfg({ claude: !cfg.claude })}
          >
            <Icon name={locked ? 'lock' : 'spark'} size={16} />
            Claude
          </button>
        ) : host && geminiModel ? (
          <button type="button" className="mf-claude" aria-pressed={cfg.gemini} aria-label={cfg.gemini ? t('mafia.geminiOffBtn') : t('mafia.geminiOnBtn')} onClick={() => st.setCfg({ gemini: !cfg.gemini })}>
            <Icon name="spark" size={16} />
            Gemini
          </button>
        ) : null}
      </header>
      {s.online && <OnlineNotice />}
      {armed && <p className="mf-note">{t(s.online ? 'mafia.quitOnline' : 'mafia.quitAgain')}</p>}
      {note && <p className="mf-note">{t(`mafia.note.${note}`)}</p>}
      <ul className="mf-ring" data-n={g.players.length}>
        {g.players.map((p) => (
          <Tile key={p.id} v={v} p={p} />
        ))}
      </ul>
      <Now v={v} />
      <Log v={v} />
      {g.phase === 'over' ? (
        <OverControls v={v} />
      ) : night ? (
        <NightControls v={v} />
      ) : g.phase === 'vote' ? (
        <VoteControls v={v} />
      ) : g.phase === 'defense' ? (
        <DefenseControls v={v} />
      ) : g.phase === 'verdict' ? (
        <VerdictControls v={v} />
      ) : (
        <DayControls v={v} />
      )}
    </div>
  );
}
