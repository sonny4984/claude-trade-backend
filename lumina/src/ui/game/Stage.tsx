import { lazy, Suspense, useState } from 'react';
import { useGame } from '../../store/game';
import { useSettings } from '../../store/settings';
import { SeatStrip } from './SeatStrip';
import { webglOK } from '../../characters/portrait3d';

const Stage3D = lazy(() => import('../../stage/Stage3D'));


/** 캐릭터 무대: 3D가 되면 3D, 아니면 2D 자리표 */
export function Stage() {
  const session = useGame((s) => s.session);
  const show3d = useSettings((s) => s.show3d);
  const [gl] = useState(webglOK);
  const [failed, setFailed] = useState(false);
  if (!session) return null;
  if (!show3d || !gl || failed) return <SeatStrip session={session} />;
  return (
    <Suspense fallback={<div className="stage stage-loading" />}>
      <Stage3D onFail={() => setFailed(true)} />
    </Suspense>
  );
}
