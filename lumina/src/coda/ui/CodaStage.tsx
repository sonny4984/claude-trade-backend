import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useSettings } from '../../store/settings';
import { webglOK, usePortrait } from '../../characters/portrait3d';
import type { CharacterId } from '../../characters/roster';
import { useT } from '../../i18n';
import { hiddenCount } from '../engine';
import { useCoda, viewerOf } from '../store';
import type { StagePlate, StageReaction } from '../../stage/Stage3D';

const Stage3D = lazy(() => import('../../stage/Stage3D'));

function subscribeReactions(fn: (r: StageReaction) => void): () => void {
  let last = useCoda.getState().reactions.at(-1)?.id ?? 0;
  return useCoda.subscribe((st, prev) => {
    if (st.reactions === prev.reactions) return;
    for (const r of st.reactions) {
      if (r.id <= last) continue;
      last = r.id;
      fn(r);
    }
  });
}

function Badge({ plate, current }: { plate: StagePlate; current: boolean }) {
  const src = usePortrait(plate.character as CharacterId, plate.out ? 'lose' : 'idle', 128);
  return (
    <div className="seat" data-current={current || undefined} data-seat-origin={plate.seat}>
      <img className="portrait" src={src} width={44} height={44} alt="" />
      <div className="seat-info">
        <b className="seat-name">{plate.name}</b>
        <span className="seat-meta">{plate.aria}</span>
      </div>
    </div>
  );
}

/** 다빈치 코드의 캐릭터 무대: 3D가 되면 3D, 아니면 2D 자리표 */
export function CodaStage() {
  const t = useT();
  const session = useCoda((s) => s.session);
  const ai = useCoda((s) => s.ai);
  const show3d = useSettings((s) => s.show3d);
  const [gl] = useState(webglOK);
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);

  const plates = useMemo<StagePlate[]>(() => {
    if (!session) return [];
    const st = session.state;
    const n = st.players.length;
    const me = viewerOf(session);
    return Array.from({ length: n - 1 }, (_, k) => (me + 1 + k) % n).flatMap((i) => {
      const p = st.players[i];
      const meta = session.meta[i];
      if (!p || !meta) return [];
      const hidden = hiddenCount(p);
      return [{ seat: i, character: meta.character, name: p.name, count: hidden, out: p.out, aria: t('coda.hiddenN', { n: hidden }) }];
    });
  }, [session, t]);

  if (!session) return null;
  const st = session.state;
  const current = st.phase === 'over' ? null : st.current;
  if (!show3d || !gl || failed) {
    return (
      <div className="seat-strip">
        {plates.map((p) => (
          <Badge key={p.seat} plate={p} current={current === p.seat} />
        ))}
      </div>
    );
  }
  return (
    <Suspense fallback={<div className="stage stage-loading" />}>
      <Stage3D
        plates={plates}
        current={current}
        thinking={ai?.phase === 'thinking' ? ai.seat : null}
        moving={ai?.phase === 'speaking' ? ai.seat : null}
        roundKey={session.id}
        subscribe={subscribeReactions}
        onFail={onFail}
      />
    </Suspense>
  );
}
