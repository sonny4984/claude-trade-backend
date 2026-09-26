/**
 * 게임 화면 위의 작은 온라인 알림 — 방 코드·연결 상태, 끊긴 친구(방장은 AI로 바꾸기), 닫힌 방.
 * 온라인 판이 아니면 아무것도 그리지 않는다.
 */
import { useOnline } from '../../net/online';
import { useT } from '../../i18n';

export function OnlineNotice() {
  const t = useT();
  const code = useOnline((s) => s.code);
  const status = useOnline((s) => s.status);
  const role = useOnline((s) => s.role);
  const connected = useOnline((s) => s.connected);
  const seats = useOnline((s) => s.table?.seats);
  if (!code || (status !== 'playing' && status !== 'closed')) return null;
  const store = useOnline.getState();
  const away = (seats ?? []).map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'human' && x.s.away);
  return (
    <div className="ol-notice" role="status">
      <span className="ol-chip" data-on={connected || undefined}>
        <i aria-hidden="true" />
        {code.toUpperCase()}
      </span>
      {status === 'closed' ? (
        <span className="ol-msg">
          {t('online.closed')}
          <button type="button" className="ol-mini" onClick={() => void store.leave()}>
            {t('online.ok')}
          </button>
        </span>
      ) : !connected ? (
        <span className="ol-msg">{t('online.offline')}</span>
      ) : (
        away.map(({ s, i }) => (
          <span key={i} className="ol-msg">
            {t('online.away', { name: s.name })}
            {role === 'host' && (
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
