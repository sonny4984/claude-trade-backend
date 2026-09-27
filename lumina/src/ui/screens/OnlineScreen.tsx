/**
 * 온라인 대전 — 한국 게임식 초대: 방 만들기 → "카카오톡으로 초대하기" → 친구가 링크를 누르면 바로 입장.
 * 링크 없이 방 코드 6자리를 쳐서 들어올 수도 있다. 로그인·설치·공유 설정은 필요 없다.
 */
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../../store/game';
import { useCoda } from '../../coda/store';
import { useOnline, savedRoom, normalizeCode, CODE_LENGTH } from '../../net/online';
import { GAME_SEATS, gameApis, type OnlineGame, type TableSeat } from '../../net/bridge';
import { canNativeShare, elsewhere, inviteUrl, shareInvite, siteUrl } from '../../net/site';
import { CHARACTER_ORDER, type CharacterId } from '../../characters/roster';
import type { Expression } from '../../characters/draw2d';
import { usePortrait } from '../../characters/portrait3d';
import type { AiLevel } from '../../game/types';
import { Icon } from '../components/Icon';
import { useT } from '../../i18n';
import { sfx } from '../../audio/sfx';

const LEVELS: AiLevel[] = ['beginner', 'casual', 'advanced', 'expert'];
const GAMES: OnlineGame[] = ['lumina', 'coda', 'gomoku', 'fireice'];

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

/** claude.ai 안처럼 주소를 나눌 수 없는 곳: 게임 사이트로 가는 길 */
function SiteHint() {
  const t = useT();
  const url = siteUrl();
  if (!elsewhere() || !url) return null;
  return (
    <section className="card ol-site">
      <p className="ol-note">{t('online.siteHint')}</p>
      <a className="btn btn-secondary btn-block" href={url} target="_blank" rel="noopener noreferrer">
        {t('online.openSite')}
      </a>
    </section>
  );
}

/** 내 캐릭터·이름 */
function Profile() {
  const t = useT();
  const profile = useOnline((s) => s.profile);
  const store = useOnline.getState();
  return (
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
      <input className="text-input ol-name" value={profile.name} maxLength={12} placeholder={t('online.namePh')} aria-label={t('online.namePh')} onChange={(e) => store.setProfile({ name: e.target.value })} />
    </section>
  );
}

/** 초대 링크로 들어왔을 때: 누구로 앉을지 고르고 바로 입장 */
function InviteJoin({ code, broker }: { code: string; broker?: number }) {
  const t = useT();
  const working = useOnline((s) => s.status === 'working');
  const store = useOnline.getState();
  return (
    <>
      <section className="card ol-room ol-invited">
        <p className="ol-kicker">{t('online.invited')}</p>
        <CodeTiles code={code} />
        <p className="ol-note">{t('online.invitedSub')}</p>
      </section>
      <Profile />
      <button type="button" className="btn btn-primary btn-lg btn-block ol-enter" disabled={working} onClick={() => void store.join(code, broker)}>
        {t('online.enter')}
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={() => store.setInvite(null)}>
        {t('online.otherWay')}
      </button>
    </>
  );
}

/** 처음 화면: 내 캐릭터·이름, 게임 고르기, 방 만들기 / 코드로 입장 */
function Start() {
  const t = useT();
  const game = useOnline((s) => s.game);
  const working = useOnline((s) => s.status === 'working');
  const [code, setCode] = useState('');
  const saved = useMemo(() => savedRoom(), []);
  const store = useOnline.getState();
  const ready = normalizeCode(code).length >= 4;
  const games = GAMES.filter((g) => !!gameApis[g]);
  return (
    <>
      {saved && (
        <button type="button" className="plate-btn plate-primary ol-resume" disabled={working} onClick={() => void store.resume()}>
          <span className="plate-label">{t('online.resume')}</span>
          <span className="plate-sub">{t('online.resumeInfo', { code: saved.code.toUpperCase(), role: t(`online.${saved.role}`) })}</span>
        </button>
      )}
      <Profile />
      <section className="card">
        <h2 className="card-title">{t('online.game')}</h2>
        <div className="ol-games" role="radiogroup" aria-label={t('online.game')}>
          {games.map((g) => (
            <button key={g} type="button" role="radio" aria-checked={game === g} className="ol-game" data-game={g} onClick={() => store.setGame(g)}>
              <b>{t(`online.${g}`)}</b>
              <small>{t(`online.${g}Sub`)}</small>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-lg btn-block ol-create" disabled={working} onClick={() => void store.create()}>
          <Icon name="plus" size={20} /> {t('online.create')}
        </button>
        <p className="ol-note ol-tip">{t('online.tip')}</p>
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
            placeholder={t('online.codePh', { n: CODE_LENGTH })}
            aria-label={t('online.codePh', { n: CODE_LENGTH })}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary" disabled={!ready || working}>
            {t('online.join')}
          </button>
        </form>
      </section>
      <SiteHint />
    </>
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

/** 초대 버튼 — 휴대폰은 공유 시트(카카오톡), 컴퓨터는 링크 복사. 아래에 링크를 그대로 보여 준다 */
function Invite({ code, broker, hostName, gameName }: { code: string; broker: number; hostName: string; gameName: string }) {
  const t = useT();
  const [msg, setMsg] = useState<string | null>(null);
  const url = inviteUrl(code, broker);
  const native = canNativeShare();
  const send = async (): Promise<void> => {
    const r = await shareInvite(url, t('online.inviteText', { name: hostName, game: gameName }), t('online.inviteTitle'));
    if (r === 'shared') setMsg(t('online.shared'));
    else if (r === 'copied') setMsg(t('online.copied'));
    else if (r === 'failed') setMsg(t('online.copyFail'));
    if (r === 'shared' || r === 'copied') sfx('pop');
  };
  return (
    <div className="ol-invite">
      <button type="button" className="btn btn-lg btn-block ol-kakao" onClick={() => void send()}>
        <span className="ol-kakao-bubble" aria-hidden="true" />
        {native ? t('online.kakao') : t('online.copyLink')}
      </button>
      <label className="ol-link-row">
        <span className="sr-only">{t('online.linkLabel')}</span>
        <input className="text-input ol-link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
      </label>
      {msg && (
        <p className="ol-note" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}

/** 로비: 코드와 초대, 자리, (방장) AI 추가·시작 */
function Lobby() {
  const t = useT();
  const table = useOnline((s) => s.table);
  const role = useOnline((s) => s.role);
  const myPeer = useOnline((s) => s.myPeer);
  const status = useOnline((s) => s.status);
  const broker = useOnline((s) => s.broker);
  const store = useOnline.getState();
  if (!table) return null;
  const host = role === 'host';
  const seated = table.seats.some((s) => s.peer === myPeer);
  const n = table.seats.length;
  const rule = GAME_SEATS[table.game];
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
  const gameName = t(`online.${table.game}`);
  return (
    <>
      <section className="card ol-room">
        <p className="ol-kicker">
          {host ? gameName : t('online.roomOf', { name: table.hostName })} · {t('online.codeTitle')}
        </p>
        <CodeTiles code={table.code} />
        {host && status === 'lobby' && <Invite code={table.code} broker={broker} hostName={table.hostName} gameName={gameName} />}
      </section>
      <section className="card">
        <h2 className="card-title">{t('online.seats', { n, max: rule.max })}</h2>
        <ol className="ol-seats">
          {table.seats.map((s, i) => (
            <SeatRow key={`${s.peer ?? 'ai'}-${i}`} seat={s} i={i} host={host && status === 'lobby'} me={s.peer === myPeer} />
          ))}
          {Array.from({ length: Math.max(0, rule.max - n) }, (_, k) => (
            <li key={`empty-${k}`} className="ol-seat ol-seat-empty" aria-hidden="true">
              <span className="ol-empty-face" />
              <span className="ol-role">{t('online.emptySeat')}</span>
            </li>
          ))}
        </ol>
        {host && status === 'lobby' && rule.ai && n < rule.max && (
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
    </>
  );
}

/** 지금 온라인 판이 도는 게임 화면 */
function screenOf(game: OnlineGame): 'game' | 'coda' | 'gomoku' | 'fireice' {
  return game === 'lumina' ? 'game' : game;
}

export function OnlineScreen() {
  const t = useT();
  const status = useOnline((s) => s.status);
  const role = useOnline((s) => s.role);
  const table = useOnline((s) => s.table);
  const connected = useOnline((s) => s.connected);
  const invite = useOnline((s) => s.invite);
  const go = useGame.getState().go;
  useEffect(() => {
    void useOnline.getState().check();
  }, []);
  const inRoom = status === 'lobby' || status === 'playing' || status === 'closed';
  const host = role === 'host';
  const canStart = host && status === 'lobby' && !!table && table.seats.length >= GAME_SEATS[table.game].min;
  const playingHere = status === 'playing' && !!table && (table.game === 'coda' ? !!useCoda.getState().session?.online : table.game === 'lumina' ? !!useGame.getState().session?.online : true);
  return (
    <div className="screen online-screen">
      <header className="screen-head">
        <button type="button" className="icon-btn" aria-label={t('setup.back')} onClick={() => go('home')}>
          <Icon name="back" />
        </button>
        <h1>{t('online.title')}</h1>
        {inRoom && <span className="ol-link-dot" data-on={connected || undefined} aria-label={connected ? t('online.connected') : t('online.offline')} />}
      </header>
      <div className="screen-body">
        <ErrorPill />
        {status === 'unavailable' ? (
          <section className="card ol-center">
            <Face id="ginini" ex="surprised" size={96} />
            <p className="ol-big">{t('online.unavailableTitle')}</p>
            <p className="ol-note">{t('online.unavailable')}</p>
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
        ) : invite ? (
          <InviteJoin code={invite.code} {...(invite.broker !== undefined ? { broker: invite.broker } : {})} />
        ) : (
          <Start />
        )}
      </div>
      {inRoom && (
        <footer className="screen-foot ol-foot">
          {playingHere && table ? (
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => go(screenOf(table.game))}>
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
