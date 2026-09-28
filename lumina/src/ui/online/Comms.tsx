/**
 * 온라인 방 채팅·음성 화면 — 방 코드 칩 옆 말풍선 단추, 아래에서 올라오는 채팅 창,
 * 창이 닫혀 있을 때 위쪽에 잠깐 뜨는 말풍선. 방에 없으면 아무것도 그리지 않는다.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MAX_CHAT, QUICK, useComms, type ChatLine } from '../../net/comms';
import { useOnline } from '../../net/online';
import { Icon } from '../components/Icon';
import { useT } from '../../i18n';

type T = ReturnType<typeof useT>;
const useInRoom = (): boolean => useOnline((s) => s.status === 'lobby' || s.status === 'playing');
const lineText = (t: T, l: ChatLine): string => (l.quick ? t(`comms.q.${l.quick}`) : (l.text ?? ''));

export function CommsButton() {
  const t = useT();
  const inRoom = useInRoom();
  const unread = useComms((s) => s.unread);
  const voice = useComms((s) => s.voice);
  const muted = useComms((s) => s.muted);
  const talk = useComms((s) => Object.values(s.talking).some(Boolean));
  if (!inRoom) return null;
  return (
    <button
      type="button"
      className="cm-btn"
      aria-label={unread ? t('comms.openUnread', { n: unread }) : t('comms.open')}
      data-voice={voice === 'on' ? (muted ? 'muted' : 'on') : undefined}
      data-talk={talk || undefined}
      onClick={() => useComms.getState().setOpen(true)}
    >
      <Icon name={voice === 'on' ? (muted ? 'micOff' : 'mic') : 'chat'} size={17} />
      {unread > 0 && <b className="cm-badge">{unread > 9 ? '9+' : unread}</b>}
    </button>
  );
}

function Toasts() {
  const t = useT();
  const lines = useComms((s) => s.lines);
  const [, redraw] = useState(0);
  const now = Date.now();
  const fresh = lines.filter((l) => !l.me && now - l.at < 4000).slice(-3);
  const first = fresh[0];
  useEffect(() => {
    if (!first) return;
    const id = setTimeout(() => redraw((x) => x + 1), Math.max(50, 4050 - (Date.now() - first.at)));
    return () => clearTimeout(id);
  }, [first, lines]);
  if (!fresh.length) return null;
  return (
    <div className="cm-toasts" aria-live="polite">
      {fresh.map((l) => (
        <button key={l.id} type="button" className="cm-toast" data-quick={l.quick ? true : undefined} onClick={() => useComms.getState().setOpen(true)}>
          <b>{l.name}</b>
          <span>{lineText(t, l)}</span>
        </button>
      ))}
    </div>
  );
}

function Voice() {
  const t = useT();
  const voice = useComms((s) => s.voice);
  const muted = useComms((s) => s.muted);
  const err = useComms((s) => s.voiceError);
  const links = useComms((s) => s.links);
  const talking = useComms((s) => s.talking);
  const seats = useOnline((s) => s.table?.seats);
  const c = useComms.getState();
  return (
    <div className="cm-voice">
      {voice === 'off' && (
        <button type="button" className="cm-chipbtn" onClick={() => void c.startVoice()}>
          <Icon name="mic" size={15} />
          {t('comms.voiceOn')}
        </button>
      )}
      {voice === 'starting' && <span className="cm-note">{t('comms.starting')}</span>}
      {voice === 'on' && (
        <>
          <button type="button" className="cm-chipbtn" aria-pressed={muted} data-on={!muted || undefined} onClick={() => c.toggleMute()}>
            <Icon name={muted ? 'micOff' : 'mic'} size={15} />
            {muted ? t('comms.unmute') : t('comms.mute')}
          </button>
          <button type="button" className="cm-chipbtn" onClick={() => c.stopVoice()}>
            {t('comms.voiceOff')}
          </button>
        </>
      )}
      {voice === 'on' && (
        <p className="cm-links">
          {Object.keys(links).length === 0 && <span>{t('comms.waitFriend')}</span>}
          {Object.entries(links).map(([seat, l]) => (
            <span key={seat} data-link={l} data-talk={talking[Number(seat)] || undefined}>
              <i aria-hidden="true" />
              {seats?.[Number(seat)]?.name ?? '?'} · {t(`comms.link.${l}`)}
            </span>
          ))}
        </p>
      )}
      {err && <p className="cm-err">{t(`comms.err.${err}`)}</p>}
      {voice === 'on' && <p className="cm-note">{t('comms.hint')}</p>}
    </div>
  );
}

function Panel() {
  const t = useT();
  const lines = useComms((s) => s.lines);
  const talking = useComms((s) => s.talking);
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const c = useComms.getState();
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [lines.length]);
  const send = (): void => {
    if (useComms.getState().say(text)) setText('');
  };
  // 글을 치는 동안 게임 단축키(방향키·WASD 등)가 먹지 않게 여기서 멈춘다
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    e.stopPropagation();
    if (e.type !== 'keydown') return;
    if (e.key === 'Escape') c.setOpen(false);
    else if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      send();
    }
  };
  return (
    <div className="cm-panel" role="dialog" aria-label={t('comms.title')}>
      <div className="cm-head">
        <b>{t('comms.title')}</b>
        <button type="button" className="icon-btn" aria-label={t('comms.close')} onClick={() => c.setOpen(false)}>
          <Icon name="close" />
        </button>
      </div>
      <Voice />
      <ol className="cm-list" ref={list}>
        {lines.length === 0 && <li className="cm-note">{t('comms.empty')}</li>}
        {lines.map((l) => (
          <li key={l.id} className="cm-line" data-me={l.me || undefined} data-quick={l.quick ? true : undefined} data-talk={talking[l.seat] || undefined}>
            <b>{l.name}</b>
            <span>{lineText(t, l)}</span>
          </li>
        ))}
      </ol>
      <div className="cm-quick">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => c.quick(q)}>
            {t(`comms.q.${q}`)}
          </button>
        ))}
      </div>
      <div className="cm-input">
        <input
          value={text}
          maxLength={MAX_CHAT}
          placeholder={t('comms.placeholder')}
          aria-label={t('comms.placeholder')}
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onKeyUp={onKey}
        />
        <button type="button" className="cm-send" aria-label={t('comms.send')} disabled={!text.trim()} onClick={send}>
          <Icon name="send" size={18} />
        </button>
      </div>
    </div>
  );
}

export function CommsLayer() {
  const inRoom = useInRoom();
  const open = useComms((s) => s.open);
  if (!inRoom) return null;
  return open ? <Panel /> : <Toasts />;
}
