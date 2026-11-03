/**
 * 별판 — SVG. 내 꼭짓점이 아래로 오게 돌려 그린다.
 * 꼭짓점은 주인 색으로 옅게, 고른 말은 고리, 갈 수 있는 곳은 점, 방금 수는 지나간 길을 옅은 선으로.
 * 새 수가 오면 말이 길을 따라 한 칸씩 폴짝 뛴다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CELLS, cornerCells, goalOf, homeOf, reach, type StarState } from '../engine';
import { HOP_MS } from '../store';
import { prefersReducedMotion } from '../../store/settings';
import { SEAT_COLORS, SEAT_DARK } from './colors';

const SQ3 = Math.sqrt(3);

interface Props {
  readonly state: StarState;
  /** 아래로 올 자리 */
  readonly bottom: number;
  readonly selected: number | null;
  /** 지금 누를 수 있는 내 말 (빛나게) */
  readonly movable: ReadonlySet<number>;
  readonly onTap: (cell: number) => void;
  readonly label: string;
}

export function Board({ state, bottom, selected, movable, onTap, label }: Props) {
  const n = state.players.length;
  const pts = useMemo(() => {
    const raw = CELLS.map((c) => ({ x: SQ3 * (c.q + c.r / 2), y: 1.5 * c.r }));
    const home = cornerCells(homeOf(state, bottom));
    const cx = home.reduce((a, i) => a + (raw[i]?.x ?? 0), 0) / home.length;
    const cy = home.reduce((a, i) => a + (raw[i]?.y ?? 0), 0) / home.length;
    const rot = Math.PI / 2 - Math.atan2(cy, cx);
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    return raw.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
  }, [state, bottom]);
  const box = useMemo(() => {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const m = 1.1;
    const x0 = Math.min(...xs) - m;
    const y0 = Math.min(...ys) - m;
    return `${x0.toFixed(2)} ${y0.toFixed(2)} ${(Math.max(...xs) - x0 + m).toFixed(2)} ${(Math.max(...ys) - y0 + m).toFixed(2)}`;
  }, [pts]);
  // 꼭짓점 칸 → 주인 자리 (출발·도착 모두)
  const owner = useMemo(() => {
    const m = new Map<number, number>();
    for (let seat = 0; seat < n; seat++) {
      for (const i of cornerCells(homeOf(state, seat))) m.set(i, seat);
      for (const i of cornerCells(goalOf(state, seat))) m.set(i, seat);
    }
    return m;
  }, [state, n]);
  const targets = useMemo(() => (selected === null ? new Map<number, number[]>() : reach(state.board, selected)), [state.board, selected]);

  // 폴짝 애니메이션
  const last = state.moves[state.moves.length - 1] ?? null;
  const seen = useRef(state.moves.length);
  const [hop, setHop] = useState<{ path: readonly number[]; seat: number; step: number } | null>(null);
  useEffect(() => {
    const count = state.moves.length;
    const grew = count === seen.current + 1;
    seen.current = count;
    if (!grew || !last || last.path.length < 2 || prefersReducedMotion()) {
      setHop(null);
      return;
    }
    let step = 0;
    setHop({ path: last.path, seat: last.seat, step });
    const id = window.setInterval(() => {
      step++;
      if (step >= last.path.length - 1) {
        window.clearInterval(id);
        setHop(null);
      } else setHop({ path: last.path, seat: last.seat, step });
    }, HOP_MS);
    return () => window.clearInterval(id);
  }, [state.moves.length, last]);

  const hidden = hop ? hop.path[hop.path.length - 1] : -1;
  const ghostAt = hop ? (hop.path[hop.step] ?? -1) : -1;
  const lastLine = last ? last.path.map((i) => `${pts[i]?.x.toFixed(2)},${pts[i]?.y.toFixed(2)}`).join(' ') : '';

  return (
    <svg className="star-board" viewBox={box} role="group" aria-label={label}>
      <defs>
        {SEAT_COLORS.slice(0, n).map((c, i) => (
          <radialGradient key={i} id={`star-p${i}`} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="35%" stopColor={c} />
            <stop offset="100%" stopColor={SEAT_DARK[i]} />
          </radialGradient>
        ))}
      </defs>
      {lastLine && <polyline className="star-trail" points={lastLine} style={{ stroke: SEAT_COLORS[last?.seat ?? 0] }} />}
      {CELLS.map((_, i) => {
        const p = pts[i];
        if (!p) return null;
        const own = owner.get(i);
        const v = state.board[i] ?? 0;
        const showPiece = v > 0 && i !== hidden;
        const isTarget = targets.has(i);
        return (
          <g
            key={i}
            className="star-cell"
            data-cell={i}
            data-piece={v > 0 ? v - 1 : undefined}
            data-target={isTarget || undefined}
            data-selected={selected === i || undefined}
            data-movable={movable.has(i) || undefined}
            onClick={() => onTap(i)}
          >
            <circle className="star-hit" cx={p.x} cy={p.y} r={0.86} />
            <circle className="star-hole" cx={p.x} cy={p.y} r={0.36} style={own !== undefined ? { fill: SEAT_COLORS[own], fillOpacity: 0.32 } : undefined} />
            {showPiece && (
              <>
                {(selected === i || movable.has(i)) && <circle className="star-ring" cx={p.x} cy={p.y} r={0.8} />}
                <circle className="star-piece" cx={p.x} cy={p.y} r={0.64} fill={`url(#star-p${v - 1})`} />
              </>
            )}
            {isTarget && <circle className="star-dot-target" cx={p.x} cy={p.y} r={0.46} />}
          </g>
        );
      })}
      {hop && ghostAt >= 0 && pts[ghostAt] && (
        <circle className="star-piece star-ghost" cx={pts[ghostAt]?.x} cy={pts[ghostAt]?.y} r={0.64} fill={`url(#star-p${hop.seat})`} />
      )}
    </svg>
  );
}
