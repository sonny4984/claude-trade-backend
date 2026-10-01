/**
 * 마피아 판 — 친구들 자리(초상화), 지금 말하는 친구의 말풍선, 대화 기록, 아래 단추(밤 행동·말하기·투표).
 * 친구를 눌러 고른 뒤 밤 행동·투표·"수상해/믿어"에 쓴다.
 */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { usePortrait } from '../../characters/portrait3d';
import type { Expression } from '../../characters/draw2d';
import { CHARACTERS } from '../../characters/roster';
import { Icon } from '../../ui/components/Icon';
import { useLang, useT } from '../../i18n';
import { quietNight, type Game, type Player } from '../engine';
import { useMafia } from '../store';
import { nameOf } from '../talk';
import { canListen, canSpeak, listen } from '../voice';

type T = ReturnType<typeof useT>;

const meOf = (g: Game): Player => g.players.find((p) => p.human) ?? (g.players[0] as Player);

/** 지금 고를 수 있는 친구인지 (밤에는 역할마다, 투표는 나 말고 살아 있는 친구) */
function pickable(g: Game, p: Player): boolean {
  const me = meOf(g);
  if (!p.alive || !me.alive) return false;
  if (g.phase === 'night') {
    if (me.role === 'doctor') return true;
    if (me.role === 'police') return p.id !== me.id && !g.checks.some(([t]) => t === p.id);
    if (me.role === 'mafia') return !quietNight(g) && p.role !== 'mafia';
    return false;
  }
  return (g.phase === 'day' || g.phase === 'vote') && p.id !== me.id;
}

/** 내가 아는 그 친구의 정체 */
function knownTag(g: Game, p: Player, t: T): { kind: string; text: string } | null {
  const me = meOf(g);
  const role = (kind: string): { kind: string; text: string } => ({ kind, text: t(`mafia.roles.${kind}`) });
  if (g.phase === 'over' || !p.alive || p.human) return role(p.role);
  if (me.role === 'mafia' && p.role === 'mafia') return role('mafia');
  if (me.role === 'police') {
    const c = g.checks.find(([x]) => x === p.id);
    if (c) return c[1] ? role('mafia') : { kind: 'town', text: t('mafia.clear') };
  }
  return null;
}

function Tile({ g, p }: { g: Game; p: Player }) {
  const t = useT();
  const lang = useLang();
  const speaking = useMafia((s) => s.speaking === p.id);
  const picked = useMafia((s) => s.pick === p.id);
  const count = useMafia((s) => s.counts?.[p.id] ?? 0);
  const won = g.winner !== null && (g.winner === 'mafia') === (p.role === 'mafia');
  const ex: Expression = g.phase === 'over' ? (won ? 'win' : 'lose') : !p.alive ? 'lose' : speaking ? 'happy' : 'idle';
  const src = usePortrait(p.character, ex, 96);
  const tag = knownTag(g, p, t);
  const claim = [...g.claims].reverse().find((c) => c.by === p.id && c.role !== 'citizen');
  const can = pickable(g, p);
  const style = { '--mf-accent': CHARACTERS[p.character].accent } as CSSProperties;
  return (
    <li>
      <button
        type="button"
        className="mf-tile"
        style={style}
        data-dead={!p.alive || undefined}
        data-me={p.human || undefined}
        data-speaking={speaking || undefined}
        aria-pressed={picked}
        aria-disabled={!can}
        onClick={() => can && useMafia.getState().select(p.id)}
      >
        <img src={src} alt="" width={52} height={52} />
        <span className="mf-name">
          {nameOf(g, p.id, lang)}
          {p.human && <em>{t('mafia.you')}</em>}
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

function Now({ g }: { g: Game }) {
  const t = useT();
  const lang = useLang();
  const speaking = useMafia((s) => s.speaking);
  const thinking = useMafia((s) => s.thinking);
  const line = useMafia((s) => (s.speaking === null ? null : [...s.lines].reverse().find((l) => l.by === s.speaking)));
  if (thinking)
    return (
      <div className="mf-now" data-thinking="">
        <span className="mf-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {t('mafia.thinking')}
      </div>
    );
  if (speaking === null || !line) return <div className="mf-now" data-empty="" />;
  return (
    <div className="mf-now" aria-live="polite">
      <b>{nameOf(g, speaking, lang)}</b>
      <span>{line.text}</span>
    </div>
  );
}

function Log({ g }: { g: Game }) {
  const lang = useLang();
  const lines = useMafia((s) => s.lines);
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [lines.length]);
  return (
    <ol className="mf-log" ref={ref}>
      {lines.map((l) => (
        <li key={l.id} className="mf-line" data-kind={l.kind}>
          {l.by !== null && <b>{nameOf(g, l.by, lang)}</b>}
          <span>{l.text}</span>
        </li>
      ))}
    </ol>
  );
}

function DayControls({ g }: { g: Game }) {
  const t = useT();
  const lang = useLang();
  const [text, setText] = useState('');
  const [hearing, setHearing] = useState<{ stop(): void } | null>(null);
  const pick = useMafia((s) => s.pick);
  const s = useMafia.getState();
  const me = meOf(g);
  if (!me.alive)
    return (
      <div className="mf-foot">
        <p className="mf-prompt">{t('mafia.watching')}</p>
        <div className="mf-row">
          <button type="button" className="btn" onClick={() => s.more()}>
            {t('mafia.more')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => s.toVote()}>
            {t('mafia.goVote')}
          </button>
        </div>
      </div>
    );
  const send = (): void => {
    if (s.say(text)) setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      send();
    }
  };
  const mic = (): void => {
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
  const target = pick !== null && pick !== me.id ? nameOf(g, pick, lang) : null;
  return (
    <div className="mf-foot">
      <div className="mf-chips">
        <button type="button" disabled={!target} onClick={() => s.quick('accuse')}>
          {target ? t('mafia.qAccuseN', { name: target }) : t('mafia.qAccuse')}
        </button>
        <button type="button" disabled={!target} onClick={() => s.quick('trust')}>
          {target ? t('mafia.qTrustN', { name: target }) : t('mafia.qTrust')}
        </button>
        <button type="button" onClick={() => s.quick('claim')}>
          {me.role === 'mafia' ? t('mafia.qClaimFake') : t('mafia.qClaim')}
        </button>
        <button type="button" onClick={() => s.quick('ask')}>
          {t('mafia.qAsk')}
        </button>
      </div>
      <div className="mf-input">
        {canListen() && (
          <button type="button" className="icon-btn" aria-label={hearing ? t('mafia.listening') : t('mafia.mic')} aria-pressed={!!hearing} onClick={mic}>
            <Icon name={hearing ? 'micOff' : 'mic'} />
          </button>
        )}
        <input
          value={text}
          maxLength={200}
          placeholder={hearing ? t('mafia.listening') : t('mafia.placeholder')}
          aria-label={t('mafia.placeholder')}
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <button type="button" className="icon-btn mf-send" aria-label={t('mafia.send')} disabled={!text.trim()} onClick={send}>
          <Icon name="send" />
        </button>
      </div>
      <div className="mf-row">
        <button type="button" className="btn" onClick={() => s.more()}>
          {t('mafia.more')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => s.toVote()}>
          {t('mafia.goVote')}
        </button>
      </div>
    </div>
  );
}

function Controls({ g }: { g: Game }) {
  const t = useT();
  const lang = useLang();
  const busy = useMafia((s) => s.busy);
  const pick = useMafia((s) => s.pick);
  const s = useMafia.getState();
  const me = meOf(g);
  const name = pick === null ? '' : nameOf(g, pick, lang);
  if (busy)
    return (
      <div className="mf-foot">
        <button type="button" className="btn btn-block" onClick={() => s.skip()}>
          {t('mafia.skip')}
        </button>
      </div>
    );
  if (g.phase === 'over') {
    const won = (g.winner === 'mafia') === (me.role === 'mafia');
    return (
      <div className="mf-foot">
        <p className="mf-result" data-win={won || undefined}>
          {won ? t('mafia.youWin') : t('mafia.youLose')} · {t(g.winner === 'town' ? 'mafia.townWin' : 'mafia.mafiaWin')}
        </p>
        <div className="mf-row">
          <button type="button" className="btn btn-primary" onClick={() => s.start()}>
            {t('mafia.again')}
          </button>
          <button type="button" className="btn" onClick={() => s.quit()}>
            {t('mafia.exit')}
          </button>
        </div>
      </div>
    );
  }
  if (g.phase === 'night') {
    const role = me.alive && !(me.role === 'mafia' && quietNight(g)) ? me.role : 'citizen';
    const acts = role !== 'citizen';
    return (
      <div className="mf-foot">
        <p className="mf-prompt">{me.alive ? t(`mafia.pickNight.${role}`) : t('mafia.watching')}</p>
        {acts ? (
          <button type="button" className="btn btn-primary btn-block" disabled={pick === null} onClick={() => s.night(pick)}>
            {pick === null ? t('mafia.pickFirst') : t(`mafia.nightGo.${role}`, { name })}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-block" onClick={() => s.night(null)}>
            {me.alive ? t('mafia.sleep') : t('mafia.watchNight')}
          </button>
        )}
      </div>
    );
  }
  if (g.phase === 'vote')
    return (
      <div className="mf-foot">
        <p className="mf-prompt">{me.alive ? t('mafia.pickVote') : t('mafia.watching')}</p>
        {me.alive ? (
          <div className="mf-row">
            <button type="button" className="btn btn-primary" disabled={pick === null} onClick={() => s.vote(pick)}>
              {pick === null ? t('mafia.pickFirst') : t('mafia.voteFor', { name })}
            </button>
            <button type="button" className="btn" onClick={() => s.vote(null)}>
              {t('mafia.abstain')}
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-primary btn-block" onClick={() => s.vote(null)}>
            {t('mafia.watchVote')}
          </button>
        )}
      </div>
    );
  return <DayControls g={g} />;
}

export function MafiaScreen() {
  const t = useT();
  const g = useMafia((s) => s.game);
  useMafia((s) => s.rev);
  const cfg = useMafia((s) => s.cfg);
  const claudeOk = useMafia((s) => s.claudeOk);
  const note = useMafia((s) => s.note);
  const [armed, setArm] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArm(false), 2500);
    return () => clearTimeout(id);
  }, [armed]);
  if (!g) return null;
  const s = useMafia.getState();
  const back = (): void => {
    if (g.phase === 'over' || armed) s.quit();
    else setArm(true);
  };
  const night = g.phase === 'night';
  const title = g.phase === 'over' ? t('mafia.over') : t(night ? 'mafia.night' : g.phase === 'vote' ? 'mafia.voteTitle' : 'mafia.day', { n: g.day });
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
        {canSpeak() && (
          <button type="button" className="icon-btn" aria-pressed={cfg.voice} aria-label={cfg.voice ? t('mafia.voiceOff') : t('mafia.voiceOn')} onClick={() => s.setCfg({ voice: !cfg.voice })}>
            <Icon name={cfg.voice ? 'volume' : 'volumeOff'} />
          </button>
        )}
        {claudeOk && (
          <button type="button" className="mf-claude" aria-pressed={cfg.claude} aria-label={cfg.claude ? t('mafia.claudeOffBtn') : t('mafia.claudeOnBtn')} onClick={() => s.setCfg({ claude: !cfg.claude })}>
            <Icon name="spark" size={16} />
            Claude
          </button>
        )}
      </header>
      {armed && <p className="mf-note">{t('mafia.quitAgain')}</p>}
      {note && <p className="mf-note">{t(`mafia.note.${note}`)}</p>}
      <ul className="mf-ring" data-n={g.players.length}>
        {g.players.map((p) => (
          <Tile key={p.id} g={g} p={p} />
        ))}
      </ul>
      <Now g={g} />
      <Log g={g} />
      <Controls g={g} />
    </div>
  );
}
