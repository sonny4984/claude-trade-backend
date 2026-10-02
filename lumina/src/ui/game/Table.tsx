import { useMemo, useRef } from 'react';
import { canManipulate, playedSince, playedTiles, sameMembers, tilesOf, type TileId } from '../../game';
import { CHARACTERS } from '../../characters/roster';
import { useGame, currentSeatIsHuman, mySeatOf } from '../../store/game';
import { useDrag } from '../dnd';
import { SetView } from '../components/SetView';
import { useTableFit } from './fit';
import { useT } from '../../i18n';

export function TableArea() {
  const t = useT();
  const session = useGame((s) => s.session);
  const selection = useGame((s) => s.selection);
  const hint = useGame((s) => s.hint);
  const dragActive = useDrag((s) => s.active);
  const newTarget = useDrag((s) => (s.target?.kind === 'new' ? s.preview ?? 'valid' : null));
  const ref = useRef<HTMLDivElement>(null);
  const g = session?.match.game;
  const turn = g?.turn;
  const work = turn?.work;
  const showNew = dragActive || selection.length > 0 || (hint.level >= 2 && !hint.data?.targetSetId && hint.data?.kind !== undefined);
  const lens = useMemo(() => {
    const l = (work?.sets ?? []).map((s) => s.tiles.length);
    return showNew ? [...l, 2] : l;
  }, [work?.sets, showNew]);
  const tw = useTableFit(ref, lens, dragActive);
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

  return (
    <main className="felt" aria-label={t('table.label')} style={{ ['--tw' as string]: `${tw}px` }}>
      <div
        className="felt-scroll"
        data-scroll="felt"
        data-drop="felt"
        ref={ref}
        onClick={(e) => {
          // 고른 타일이 있을 때 빈 탁자를 누르면 새 세트로
          if (selection.length && humanTurn && !(e.target as HTMLElement).closest('.set, [data-tile-id], button')) useGame.getState().moveSelectionTo({ kind: 'new' });
        }}
      >
        <div className="sets">
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
          {showNew && humanTurn && (
            <button
              type="button"
              className="new-set"
              data-drop="new"
              data-preview={newTarget ?? undefined}
              data-hint={(hint.level >= 2 && !hintSet) || undefined}
              onClick={() => useGame.getState().moveSelectionTo({ kind: 'new' })}
            >
              <span aria-hidden="true">+</span> {t('table.newSet')}
            </button>
          )}
        </div>
        {!work.sets.length && !showNew && (
          <div className="felt-empty">
            <p className="felt-empty-title">{t('table.empty')}</p>
            <p className="felt-empty-sub">{t('table.emptySub', { n: g.rules.initialMeldPoints })}</p>
          </div>
        )}
      </div>
    </main>
  );
}
