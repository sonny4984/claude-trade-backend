import type { CSSProperties } from 'react';
import { useDrag, registerGhost } from '../dnd';
import { Tile } from '../components/Tile';

/** 손가락(마우스)을 따라다니는 고스트 타일 — 위치는 dnd.ts가 직접 transform으로 옮긴다 */
export function DragLayer() {
  const active = useDrag((s) => s.active);
  const tiles = useDrag((s) => s.tiles);
  const preview = useDrag((s) => s.preview);
  const touch = useDrag((s) => s.touch);
  const width = useDrag((s) => s.ghostW);
  if (!active) return null;
  return (
    <div className="drag-layer" aria-hidden="true">
      <div className="ghost" ref={registerGhost} data-preview={preview ?? undefined} data-touch={touch || undefined} style={{ ['--tw' as string]: `${width}px` } as CSSProperties}>
        {tiles.map((id) => (
          <Tile key={id} id={id} where="ghost" />
        ))}
      </div>
    </div>
  );
}
