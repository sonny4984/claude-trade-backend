/**
 * 게임 화면의 온라인 표시 — 상단 바의 방 코드 칩(연결 점), 그 아래 필요할 때만 뜨는 알림
 * (끊긴 친구 · 방장은 AI로 바꾸기 · 닫힌 방 · 연결 끊김). 온라인 판이 아니면 아무것도 그리지 않는다.
 */
import { useOnline } from '../../net/online';
import { GAME_SEATS } from '../../net/bridge';
import { useGame } from '../../store/game';
import { useCoda } from '../../coda/store';
import { useGomoku } from '../../gomoku/store';
import { useFireIce } from '../../fireice/store';
import { useT } from '../../i18n';
import { CommsButton } from './Comms';

/** 닫힌 방에서 나오기: 게임 화면까지 정리하고 홈으로 */
function leaveGame(): void {
  if (useCoda.getState().session?.online) useCoda.getState().quit();
  else if (useGame.getState().session?.online) useGame.getState().quit();
  else if (useGomoku.getState().session?.online) useGomoku.getState().quit();
  else if (useFireIce.getState().session?.online) useFireIce.getState().quit();
  else void useOnline.getState().leave();
}

export function OnlineChip() {
  const t = useT();
  const code = useOnline((s) => s.code);
  const status = useOnline((s) => s.status);
  const connected = useOnline((s) => s.connected);
  if (!code || (status !== 'playing' && status !== 'closed')) return null;
  return (
    <>
      <CommsButton />
      <span className="ol-chip" data-on={connected || undefined} aria-label={`${t('online.codeTitle')} ${code.toUpperCase()} · ${connected ? t('online.connected') : t('online.offline')}`}>
      <i aria-hidden="true" />
      {code.toUpperCase()}
      </span>
    </>
  );
}

export function OnlineNotice() {
  const t = useT();
  const code = useOnline((s) => s.code);
  const status = useOnline((s) => s.status);
  const role = useOnline((s) => s.role);
  const connected = useOnline((s) => s.connected);
  const seats = useOnline((s) => s.table?.seats);
  const game = useOnline((s) => s.table?.game);
  const error = useOnline((s) => s.error);
  if (!code || (status !== 'playing' && status !== 'closed')) return null;
  const store = useOnline.getState();
  const away = (seats ?? []).map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'human' && x.s.away);
  if (status !== 'closed' && connected && !away.length && !error) return null;
  return (
    <div className="ol-notice" role="status">
      {error && status !== 'closed' && (
        <span className="ol-msg" data-tone="bad">
          {t(error)}
          {error === 'online.err.lost' ? (
            <button type="button" className="ol-mini" onClick={() => void store.resume()}>
              {t('online.reconnect')}
            </button>
          ) : (
            <button type="button" className="ol-mini" onClick={() => store.clearError()}>
              {t('online.ok')}
            </button>
          )}
        </span>
      )}
      {status === 'closed' ? (
        <span className="ol-msg">
          {t('online.closed')}
          <button type="button" className="ol-mini" onClick={leaveGame}>
            {t('online.ok')}
          </button>
        </span>
      ) : !connected ? (
        <span className="ol-msg">{t('online.offline')}</span>
      ) : (
        away.map(({ s, i }) => (
          <span key={i} className="ol-msg">
            {t('online.away', { name: s.name })}
            {role === 'host' && game && GAME_SEATS[game].ai && (
              <button type="button" className="ol-mini" onClick={() => store.replaceWithAi(i)}>
                {t('online.toAi')}
              </button>
            )}
          </span>
        ))
      )}
    </div>
  );
}
