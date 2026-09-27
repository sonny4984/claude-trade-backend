/**
 * 오목판 — SVG 한 장. 누르면 가장 가까운 교차점. 방향키로 옮기고 Enter로 둘 수도 있다.
 * 흑 차례이고 쌍삼 금지면, 둘 수 없는 자리(금수)에 작은 ×를 보여 준다.
 */
import { memo, useMemo, useRef } from 'react';
import { SIZE, cellAt, isDoubleThree, xy, type GomokuState } from '../engine';
import { candidates } from '../ai';

const STARS = [
  [3, 3],
  [11, 3],
  [3, 11],
  [11, 11],
  [7, 7],
] as const;
const V = SIZE + 1;

interface BoardProps {
  readonly state: GomokuState;
  readonly preview: number | null;
  readonly hint: number | null;
  /** 이 기기가 지금 둘 수 있는가 */
  readonly active: boolean;
  /** 금수 표시 (이 기기의 사람이 흑이고 규칙이 켜져 있을 때) */
  readonly showForbidden: boolean;
  readonly label: string;
  readonly onTap: (cell: number) => void;
  readonly onConfirm: () => void;
}

function BoardImpl({ state, preview, hint, active, showForbidden, label, onTap, onConfirm }: BoardProps) {
  const ref = useRef<SVGSVGElement>(null);
  const last = state.moves[state.moves.length - 1];
  const forbidden = useMemo(() => {
    if (!showForbidden || state.turn !== 1 || !state.rules.noDoubleThree || state.winner) return [] as number[];
    return candidates(state).filter((c) => isDoubleThree(state.board, c, 1));
  }, [state, showForbidden]);
  const win = state.line.length >= 5 ? [xy(state.line[0] as number), xy(state.line[state.line.length - 1] as number)] : null;

  const toCell = (clientX: number, clientY: number): number => {
    const el = ref.current;
    if (!el) return -1;
    const r = el.getBoundingClientRect();
    const x = Math.round(((clientX - r.left) / r.width) * V - 1);
    const y = Math.round(((clientY - r.top) / r.height) * V - 1);
    return cellAt(x, y);
  };

  const move = (dx: number, dy: number): void => {
    const [x, y] = preview !== null ? xy(preview) : last !== undefined ? xy(last) : [7, 7];
    const c = cellAt(Math.max(0, Math.min(SIZE - 1, x + dx)), Math.max(0, Math.min(SIZE - 1, y + dy)));
    if (c >= 0 && state.board[c] === 0) onTap(c);
  };

  return (
    <svg
      ref={ref}
      className="go-board"
      viewBox={`0 0 ${V} ${V}`}
      role="application"
      aria-label={label}
      tabIndex={0}
      data-active={active || undefined}
      onPointerUp={(e) => {
        if (!active) return;
        const c = toCell(e.clientX, e.clientY);
        if (c >= 0) onTap(c);
      }}
      onKeyDown={(e) => {
        if (!active) return;
        const k = e.key;
        if (k === 'ArrowLeft') move(-1, 0);
        else if (k === 'ArrowRight') move(1, 0);
        else if (k === 'ArrowUp') move(0, -1);
        else if (k === 'ArrowDown') move(0, 1);
        else if (k === 'Enter' || k === ' ') onConfirm();
        else return;
        e.preventDefault();
      }}
    >
      <defs>
        <radialGradient id="go-b" cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" style={{ stopColor: 'var(--go-black-hi)' }} />
          <stop offset="1" style={{ stopColor: 'var(--go-black)' }} />
        </radialGradient>
        <radialGradient id="go-w" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" style={{ stopColor: '#ffffff' }} />
          <stop offset="1" style={{ stopColor: 'var(--go-white)' }} />
        </radialGradient>
        <linearGradient id="go-wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--go-wood-0)' }} />
          <stop offset="1" style={{ stopColor: 'var(--go-wood-1)' }} />
        </linearGradient>
      </defs>
      <rect className="go-wood" x="0.15" y="0.15" width={V - 0.3} height={V - 0.3} rx="0.45" fill="url(#go-wood)" />
      <g className="go-lines">
        {Array.from({ length: SIZE }, (_, i) => (
          <g key={i}>
            <line x1={1} y1={1 + i} x2={SIZE} y2={1 + i} />
            <line x1={1 + i} y1={1} x2={1 + i} y2={SIZE} />
          </g>
        ))}
      </g>
      {STARS.map(([x, y]) => (
        <circle key={`${x}-${y}`} className="go-star" cx={1 + x} cy={1 + y} r={0.11} />
      ))}
      {forbidden.map((c) => {
        const [x, y] = xy(c);
        return (
          <g key={`f${c}`} className="go-forbid" aria-hidden="true">
            <line x1={x + 0.82} y1={y + 0.82} x2={x + 1.18} y2={y + 1.18} />
            <line x1={x + 1.18} y1={y + 0.82} x2={x + 0.82} y2={y + 1.18} />
          </g>
        );
      })}
      {state.board.map((v, c) => {
        if (!v) return null;
        const [x, y] = xy(c);
        const inLine = state.line.includes(c);
        return (
          <g key={c} className="go-stone" data-stone={v} data-win={inLine || undefined} data-last={c === last || undefined}>
            <circle className="go-shadow" cx={1 + x + 0.04} cy={1 + y + 0.07} r={0.45} />
            <circle cx={1 + x} cy={1 + y} r={0.45} fill={v === 1 ? 'url(#go-b)' : 'url(#go-w)'} />
          </g>
        );
      })}
      {last !== undefined && !state.winner && (
        <circle className="go-last" cx={1 + (xy(last)[0] as number)} cy={1 + (xy(last)[1] as number)} r={0.13} data-stone={state.board[last]} />
      )}
      {win && <line className="go-winline" x1={1 + win[0][0]} y1={1 + win[0][1]} x2={1 + win[1][0]} y2={1 + win[1][1]} />}
      {hint !== null && state.board[hint] === 0 && <circle className="go-hint" cx={1 + (xy(hint)[0] as number)} cy={1 + (xy(hint)[1] as number)} r={0.5} />}
      {preview !== null && state.board[preview] === 0 && (
        <g className="go-preview" data-stone={state.turn}>
          <circle cx={1 + (xy(preview)[0] as number)} cy={1 + (xy(preview)[1] as number)} r={0.45} fill={state.turn === 1 ? 'url(#go-b)' : 'url(#go-w)'} />
          <circle className="go-preview-ring" cx={1 + (xy(preview)[0] as number)} cy={1 + (xy(preview)[1] as number)} r={0.58} />
        </g>
      )}
    </svg>
  );
}

export const Board = memo(BoardImpl);
