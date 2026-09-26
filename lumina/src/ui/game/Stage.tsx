import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useGame, mySeatOf, currentSeatIsHuman } from '../../store/game';
import { useSettings } from '../../store/settings';
import { SeatStrip } from './SeatStrip';
import { webglOK } from '../../characters/portrait3d';
import { useT } from '../../i18n';
import type { StagePlate, StageReaction } from '../../stage/Stage3D';

const Stage3D = lazy(() => import('../../stage/Stage3D'));

/** 게임 스토어의 반응 목록을 새로 생긴 것만 하나씩 흘려보낸다 */
function subscribeReactions(fn: (r: StageReaction) => void): () => void {
  let last = useGame.getState().reactions.at(-1)?.id ?? 0;
  return useGame.subscribe((st, prev) => {
    if (st.reactions === prev.reactions) return;
    for (const r of st.reactions) {
      if (r.id <= last) continue;
      last = r.id;
      fn(r);
    }
  });
}

/** 캐릭터 무대: 3D가 되면 3D, 아니면 2D 자리표 */
export function Stage() {
  const t = useT();
  const session = useGame((s) => s.session);
  const ai = useGame((s) => s.ai);
  const show3d = useSettings((s) => s.show3d);
  const [gl] = useState(webglOK);
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);

  const g = session?.match.game;
  const plates = useMemo<StagePlate[]>(() => {
    if (!session || !g) return [];
    const n = g.players.length;
    const me = session.mode === 'local' ? g.current : mySeatOf(session);
    return Array.from({ length: Math.max(0, n - 1) }, (_, k) => (me + 1 + k) % n).flatMap((i) => {
      const p = g.players[i];
      const info = session.match.seats[i];
      const meta = session.seatsMeta[i];
      if (!p || !info || !meta) return [];
      return [
        {
          seat: i,
          character: meta.character,
          name: info.name,
          count: p.rack.length,
          dot: p.melded,
          aria: `${info.name}, ${t('hud.tiles', { n: p.rack.length })}${p.melded ? `, ${t('hud.melded')}` : ''}`,
        },
      ];
    });
  }, [session, g, t]);

  if (!session || !g) return null;
  if (!show3d || !gl || failed) return <SeatStrip session={session} />;
  return (
    <Suspense fallback={<div className="stage stage-loading" />}>
      <Stage3D
        plates={plates}
        current={g.phase === 'playing' ? g.current : null}
        thinking={ai && ai.phase === 'thinking' ? ai.seat : session.online && g.phase === 'playing' && !currentSeatIsHuman(session) && !ai ? g.current : null}
        moving={ai && ai.phase === 'moving' ? ai.seat : null}
        roundKey={`${session.match.id}:${session.match.gameNo}`}
        subscribe={subscribeReactions}
        onFail={onFail}
      />
    </Suspense>
  );
}
