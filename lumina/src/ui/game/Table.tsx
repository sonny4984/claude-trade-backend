import { useMemo, useRef, type CSSProperties } from 'react';
import { BOARD_COLS, canManipulate, findSpot, occupancy, playedSince, playedTiles, sameMembers, tilesOf, type TileId } from '../../game';
import { CHARACTERS } from '../../characters/roster';
import { useAssist, useGame, currentSeatIsHuman, mySeatOf } from '../../store/game';
import { useDrag } from '../dnd';
import { SetView } from '../components/SetView';
import { Icon } from '../components/Icon';
import { cellAt, startCell } from './boardGeometry';
import { strideX, strideY, useBoardFit } from './fit';
import { useT } from '../../i18n';

export function TableArea() {
  const t = useT();
  const session = useGame((s) => s.session);
  const selection = useGame((s) => s.selection);
  const hint = useGame((s) => s.hint);
  const assist = useAssist();
  const dragActive = useDrag((s) => s.active);
  const dragCount = useDrag((s) => s.tiles.length);
  const cellTarget = useDrag((s) => (s.target?.kind === 'cell' ? s.target : null));
  const cellPreview = useDrag((s) => (s.target?.kind === 'cell' ? s.preview : null));
  const ref = useRef<HTMLDivElement>(null);
  const g = session?.match.game;
  const turn = g?.turn;
  const work = turn?.work;
  const { tw, viewRows } = useBoardFit(ref);
  const fresh = useMemo(() => new Set<TileId>(turn ? playedTiles(turn) : []), [turn]);
  // 내가 지난번에 둔 뒤 다른 사람들이 낸 타일 (함께 두기면 지금 차례인 사람 기준)
  const viewer = session && g ? (session.mode === 'local' ? g.current : mySeatOf(session)) : -1;
  const recent = useMemo(() => {
    const out = new Map<TileId, { color: string; name: string }>();
    if (!session || !g || viewer < 0) return out;
    for (const [id, p] of playedSince(g, viewer)) {
      const meta = session.seatsMeta[p];
      if (meta) out.set(id, { color: CHARACTERS[meta.character].accent, name: session.match.seats[p]?.name ?? '' });
    }
    return out;
    // 기록(log)과 보는 자리가 바뀔 때만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g?.log, viewer, session?.seatsMeta]);
  if (!g || !turn || !work) return null;
  const manip = canManipulate(turn);
  const startTiles = new Set(tilesOf(turn.start.sets));
  const startMap = new Map(turn.start.sets.map((s) => [s.id, s.tiles] as const));
  const hintTile = hint.level >= 1 ? hint.data?.focus ?? null : null;
  const hintSet = hint.level >= 2 ? hint.data?.targetSetId ?? null : null;
  const humanTurn = !!session && currentSeatIsHuman(session);
  const usedRows = work.sets.reduce((m, s) => Math.max(m, s.row + 1), 0);
  // 보드 높이는 끄는 동안 그대로 — 아래 칸에 가까이 가도 판이 늘어나며 따라 내려가지 않게
  const rows = Math.max(viewRows, usedRows + 2);

  // 새 세트를 만들라는 힌트: 비어 있는 자리를 반짝여 보여 준다
  let hintSpot: { row: number; col: number; n: number } | null = null;
  if (hint.level >= 2 && !hintSet && hint.data?.kind !== undefined && hint.data.focus !== null) {
    const home = hint.data.proposal.find((p) => p.includes(hint.data?.focus as TileId));
    const n = home ? home.length : 3;
    const taken = new Set(occupancy(work.sets).keys());
    hintSpot = { ...findSpot(taken, n), n };
  }

  const style = { ['--tw' as string]: `${tw}px` } as CSSProperties;
  const boardStyle = { ['--cols' as string]: BOARD_COLS, ['--rows' as string]: rows } as CSSProperties;
  const ghost = cellTarget ? { row: cellTarget.row, col: cellTarget.col, n: dragCount } : null;

  return (
    <main className="felt" data-assist={assist} aria-label={t('table.label')} style={style}>
      <div className="felt-scroll" data-scroll="felt" data-drop="felt" ref={ref}>
        <div
          className="board"
          data-board
          data-tw={tw}
          data-sx={strideX(tw)}
          data-sy={strideY(tw)}
          data-rows={rows}
          style={boardStyle}
          onClick={(e) => {
            // 고른 타일이 있을 때 빈 칸을 누르면 그 칸에 (타일·단추를 누른 건 따로 처리)
            if (!selection.length || !humanTurn) return;
            if ((e.target as HTMLElement).closest('[data-tile-id], button')) return;
            const c = cellAt(e.clientX, e.clientY);
            if (!c) return;
            const at = startCell(c, 0, selection.length);
            useGame.getState().moveSelectionTo({ kind: 'cell', row: at.row, col: at.col });
          }}
        >
          {work.sets.map((s) => {
            const before = startMap.get(s.id);
            return (
              <SetView
                key={s.id}
                set={s}
                fresh={fresh}
                locked={humanTurn && !manip && s.tiles.some((x) => startTiles.has(x))}
                touched={!before || !sameMembers(before, s.tiles)}
                hintTarget={hintSet === s.id}
                hintTile={hintTile}
                recent={recent}
              />
            );
          })}
          {ghost && dragActive && <i className="cell-ghost" data-preview={cellPreview ?? undefined} style={{ ['--row' as string]: ghost.row, ['--col' as string]: ghost.col, ['--n' as string]: ghost.n } as CSSProperties} aria-hidden="true" />}
          {hintSpot && <i className="cell-ghost" data-hint style={{ ['--row' as string]: hintSpot.row, ['--col' as string]: hintSpot.col, ['--n' as string]: hintSpot.n } as CSSProperties} aria-hidden="true" />}
        </div>
        {!work.sets.length && !dragActive && (
          <div className="felt-empty">
            <p className="felt-empty-title">{t('table.empty')}</p>
            <p className="felt-empty-sub">{t('table.emptySub', { n: g.rules.initialMeldPoints })}</p>
          </div>
        )}
      </div>
      {humanTurn && work.sets.length > 1 && (
        <button type="button" className="board-tidy" onClick={() => useGame.getState().act({ type: 'tidy' })} title="T" aria-label={t('table.tidy')} aria-keyshortcuts="T">
          <Icon name="tidy" size={16} />
          <span>{t('table.tidy')}</span>
        </button>
      )}
    </main>
  );
}
