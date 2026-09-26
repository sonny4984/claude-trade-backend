import { useMemo, useRef } from 'react';
import { canManipulate, playedTiles, sameMembers, tilesOf, type TileId } from '../../game';
import { useGame } from '../../store/game';
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
  if (!g || !turn || !work) return null;
  const manip = canManipulate(turn);
  const startTiles = new Set(tilesOf(turn.start.sets));
  const startMap = new Map(turn.start.sets.map((s) => [s.id, s.tiles] as const));
  const hintTile = hint.level >= 1 ? hint.data?.focus ?? null : null;
  const hintSet = hint.level >= 2 ? hint.data?.targetSetId ?? null : null;
  const humanTurn = session?.match.seats[g.current]?.seat === 'human';

  return (
    <main className="felt" aria-label={t('table.group')} style={{ ['--tw' as string]: `${tw}px` }}>
      <div className="felt-scroll" data-scroll="felt" data-drop="felt" ref={ref}>
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
