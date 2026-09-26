/**
 * 온라인 대전 — 방 만들기·코드로 참가·로비.
 * 방장이 방을 만들면 4자리 코드가 나오고, 친구가 같은 페이지(claude.ai)에서 그 코드를 넣으면 같은 방에 앉는다.
 */
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../../store/game';
import { useCoda } from '../../coda/store';
import { useOnline, savedRoom, normalizeCode } from '../../net/online';
import type { TableSeat } from '../../net/bridge';
import { CHARACTER_ORDER, type CharacterId } from '../../characters/roster';
import type { Expression } from '../../characters/draw2d';
import { usePortrait } from '../../characters/portrait3d';
import type { AiLevel } from '../../game/types';
import { Icon } from '../components/Icon';
import { useT } from '../../i18n';
import { sfx } from '../../audio/sfx';

const LEVELS: AiLevel[] = ['beginner', 'casual', 'advanced', 'expert'];

function Face({ id, ex = 'idle', size = 56 }: { id: CharacterId; ex?: Expression; size?: number }) {
  const src = usePortrait(id, ex, 128);
  return <img className="ol-face" src={src} alt="" width={size} height={size} />;
}

/** 방 코드를 타일처럼 */
function CodeTiles({ code }: { code: string }) {
  return (
    <span className="ol-code" aria-label={code.split('').join(' ')}>
      {code.split('').map((c, i) => (
        <b key={i} className="ol-code-tile" style={{ ['--i' as string]: i }}>
          {c.toUpperCase()}
        </b>
      ))}
    </span>
  );
}

function ErrorPill() {
  const t = useT();
  const error = useOnline((s) => s.error);
  if (!error) return null;
  return (
    <p className="ol-error" role="alert">
      <span>{t(error)}</span>
      <button type="button" className="icon-btn small" aria-label={t('action.close')} onClick={() => useOnline.getState().clearError()}>
        <Icon name="close" size={16} />
      </button>
    </p>
  );
}

/** 처음 화면: 내 캐릭터·이름, 게임 고르기, 방 만들기 / 코드로 참가 */
function Start() {
  const t = useT();
  const profile = useOnline((s) => s.profile);
  const game = useOnline((s) => s.game);
  const working = useOnline((s) => s.status === 'working');
  const [code, setCode] = useState('');
  const saved = useMemo(() => savedRoom(), []);
  const store = useOnline.getState();
  const ready = normalizeCode(code).length >= 4;
  return (
    <>
      {saved && (
        <button type="button" className="plate-btn plate-primary ol-resume" disabled={working} onClick={() => void store.resume()}>
          <span className="plate-label">{t('online.resume')}</span>
          <span className="plate-sub">{t('online.resumeInfo', { code: saved.code.toUpperCase(), role: t(`online.${saved.role}`) })}</span>
        </button>
      )}
      <section className="card ol-me">
        <h2 className="card-title">{t('online.me')}</h2>
        <div className="ol-pick" role="radiogroup" aria-label={t('character.pick')}>
          {CHARACTER_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={profile.character === c}
              className="ol-pick-btn"
              onClick={() => {
                sfx('pick');
                store.setProfile({ character: c });
              }}
            >
              <Face id={c} ex={profile.character === c ? 'happy' : 'idle'} />
              <span>{t(`character.${c}`)}</span>
            </button>
          ))}
        </div>
        <input
          className="text-input ol-name"
          value={profile.name}
          maxLength={12}
          placeholder={t('online.namePh')}
          aria-label={t('online.namePh')}
          onChange={(e) => store.setProfile({ name: e.target.value })}
        />
      </section>
      <section className="card">
        <h2 className="card-title">{t('online.game')}</h2>
        <div className="seg" role="radiogroup" aria-label={t('online.game')}>
          {(['lumina', 'coda'] as const).map((g) => (
            <button key={g} type="button" role="radio" aria-checked={game === g} onClick={() => store.setGame(g)}>
              {t(`online.${g}`)}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-lg btn-block ol-create" disabled={working} onClick={() => void store.create()}>
          <Icon name="plus" size={20} /> {t('online.create')}
        </button>
      </section>
      <section className="card">
        <h2 className="card-title">{t('online.joinTitle')}</h2>
        <form
          className="ol-join"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) void store.join(code);
          }}
        >
          <input
            className="text-input ol-code-input"
            value={code}
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('online.codePh')}
            aria-label={t('online.codePh')}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary" disabled={!ready || working}>
            {t('online.join')}
          </button>
        </form>
      </section>
      <HowTo />
    </>
  );
}

function HowTo() {
  const t = useT();
  return (
    <section className="card ol-how">
      <h2 className="card-title">{t('online.howTitle')}</h2>
      <ol>
        <li>{t('online.how1')}</li>
        <li>{t('online.how2')}</li>
        <li>{t('online.how3')}</li>
      </ol>
    </section>
  );
}

function SeatRow({ seat, i, host, me }: { seat: TableSeat; i: number; host: boolean; me: boolean }) {
  const t = useT();
  const hostPeer = useOnline((s) => s.table?.hostPeer);
  const store = useOnline.getState();
  const isHostSeat = seat.peer !== null && seat.peer === hostPeer;
  const role = seat.kind === 'ai' ? t(`ai.${seat.level ?? 'casual'}`) : isHostSeat ? t('online.host') : t('online.guest');
  return (
    <li className="ol-seat" data-ai={seat.kind === 'ai' || undefined} data-away={seat.away || undefined} style={{ ['--i' as string]: i }}>
      <Face id={seat.character} ex={seat.away ? 'lose' : 'idle'} size={48} />
      <div className="ol-seat-info">
        <b>
          {seat.name}
          {me && <small className="ol-you">{t('online.you')}</small>}
        </b>
        <span className="ol-role">{seat.away ? t('online.awayShort') : role}</span>
      </div>
      {host && seat.kind === 'ai' && (
        <select className="ol-level" value={seat.level ?? 'casual'} aria-label={t('ai.level')} onChange={(e) => store.setLevel(i, e.target.value as AiLevel)}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {t(`ai.${l}`)}
            </option>
          ))}
        </select>
      )}
      {host && !isHostSeat && (
        <button type="button" className="icon-btn small" aria-label={t('online.remove')} onClick={() => store.removeSeat(i)}>
          <Icon name="close" size={16} />
        </button>
      )}
    </li>
  );
}

/** 로비: 코드 크게, 자리, (방장) AI 추가·시작 */
function Lobby() {
  const t = useT();
  const table = useOnline((s) => s.table);
  const role = useOnline((s) => s.role);
  const myPeer = useOnline((s) => s.myPeer);
  const status = useOnline((s) => s.status);
  const [copied, setCopied] = useState<null | 'ok' | 'fail'>(null);
  const store = useOnline.getState();
  if (!table) return null;
  const host = role === 'host';
  const seated = table.seats.some((s) => s.peer === myPeer);
  const n = table.seats.length;
  const copy = async (): Promise<void> => {
    const text = t('online.inviteText', { code: table.code.toUpperCase() });
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
      sfx('pop');
    } catch {
      setCopied('fail');
    }
  };
  if (status === 'closed') {
    return (
      <section className="card ol-center">
        <Face id="moka" ex="lose" size={96} />
        <p className="ol-big">{t('online.closed')}</p>
        <button type="button" className="btn btn-primary btn-block" onClick={() => void store.leave()}>
          {t('online.ok')}
        </button>
      </section>
    );
  }
  if (status === 'playing' && !seated) {
    return (
      <section className="card ol-center">
        <Face id="pponi" ex="surprised" size={96} />
        <p className="ol-big">{t('online.full')}</p>
        <button type="button" className="btn btn-primary btn-block" onClick={() => void store.leave()}>
          {t('online.leave')}
        </button>
      </section>
    );
  }
  return (
    <>
      <section className="card ol-room">
        <p className="ol-kicker">
          {t(`online.${table.game}`)} · {t('online.codeTitle')}
        </p>
        <CodeTiles code={table.code} />
        <button type="button" className="btn btn-secondary btn-block" onClick={() => void copy()}>
          <Icon name="share" size={18} /> {t('online.copy')}
        </button>
        {copied && <p className="ol-note" role="status">{t(copied === 'ok' ? 'online.copied' : 'online.copyFail')}</p>}
      </section>
      <section className="card">
        <h2 className="card-title">{t('online.seats', { n })}</h2>
        <ol className="ol-seats">
          {table.seats.map((s, i) => (
            <SeatRow key={`${s.peer ?? 'ai'}-${i}`} seat={s} i={i} host={host && status === 'lobby'} me={s.peer === myPeer} />
          ))}
          {Array.from({ length: Math.max(0, 4 - n) }, (_, k) => (
            <li key={`empty-${k}`} className="ol-seat ol-seat-empty" aria-hidden="true">
              <span className="ol-empty-face" />
              <span className="ol-role">{t('online.emptySeat')}</span>
            </li>
          ))}
        </ol>
        {host && status === 'lobby' && n < 4 && (
          <button type="button" className="btn btn-ghost add-seat" onClick={() => store.addAi('casual')}>
            <Icon name="plus" size={18} /> {t('online.addAi')}
          </button>
        )}
      </section>
      {host && status === 'lobby' && table.game === 'coda' && (
        <section className="card">
          <label className="toggle-row">
            <span>
              {t('coda.jokers')}
              <small className="toggle-sub">{t('coda.jokersSub')}</small>
            </span>
            <input type="checkbox" className="switch" checked={table.jokers} onChange={(e) => store.setJokers(e.target.checked)} />
          </label>
        </section>
      )}
      {!host && status === 'lobby' && (
        <section className="card ol-center ol-wait">
          <span className="ol-bounce" aria-hidden="true">
            <Face id={table.seats[0]?.character ?? 'hwigi'} ex="happy" size={72} />
          </span>
          <p>{t('online.waiting')}</p>
        </section>
      )}
      {host && <HowTo />}
    </>
  );
}

export function OnlineScreen() {
  const t = useT();
  const status = useOnline((s) => s.status);
  const role = useOnline((s) => s.role);
  const table = useOnline((s) => s.table);
  const connected = useOnline((s) => s.connected);
  const go = useGame.getState().go;
  useEffect(() => {
    void useOnline.getState().check();
  }, []);
  const inRoom = status === 'lobby' || status === 'playing' || status === 'closed';
  const host = role === 'host';
  const canStart = host && status === 'lobby' && (table?.seats.length ?? 0) >= 2;
  const playingHere = status === 'playing' && (table?.game === 'coda' ? !!useCoda.getState().session?.online : !!useGame.getState().session?.online);
  return (
    <div className="screen online-screen">
      <header className="screen-head">
        <button type="button" className="icon-btn" aria-label={t('setup.back')} onClick={() => go('home')}>
          <Icon name="back" />
        </button>
        <h1>{t('online.title')}</h1>
        {inRoom && <span className="ol-link" data-on={connected || undefined} aria-label={connected ? t('online.connected') : t('online.offline')} />}
      </header>
      <div className="screen-body">
        <ErrorPill />
        {status === 'unavailable' ? (
          <section className="card ol-center">
            <Face id="ginini" ex="surprised" size={96} />
            <p className="ol-big">{t('online.unavailableTitle')}</p>
            <p className="ol-note">{t('online.unavailable')}</p>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => useOnline.setState({ status: 'idle', error: null })}>
              {t('online.retry')}
            </button>
          </section>
        ) : status === 'working' ? (
          <section className="card ol-center ol-wait">
            <span className="ol-bounce" aria-hidden="true">
              <Face id={useOnline.getState().profile.character} ex="happy" size={72} />
            </span>
            <p>{t('online.connecting')}</p>
          </section>
        ) : inRoom ? (
          <Lobby />
        ) : (
          <Start />
        )}
      </div>
      {inRoom && (
        <footer className="screen-foot ol-foot">
          {playingHere ? (
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => go(table?.game === 'coda' ? 'coda' : 'game')}>
              {t('online.back')}
            </button>
          ) : host && status === 'lobby' ? (
            <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!canStart} onClick={() => useOnline.getState().start()}>
              {canStart ? t('online.start') : t('online.needTwo')}
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost btn-block" onClick={() => void useOnline.getState().leave()}>
            {t('online.leave')}
          </button>
        </footer>
      )}
    </div>
  );
}
