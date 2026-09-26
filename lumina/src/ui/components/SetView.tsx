import { Fragment, memo } from 'react';
import { analyzeSet, type TableSet, type TileId } from '../../game';
import { Tile } from './Tile';
import { useDrag } from '../dnd';
import { useGame } from '../../store/game';
import { setIssueText, useLang, useT } from '../../i18n';

interface Props {
  set: TableSet;
  fresh: ReadonlySet<TileId>;
  locked: boolean;
  touched: boolean;
  hintTarget: boolean;
  hintTile: TileId | null;
}

export const SetView = memo(function SetView({ set, fresh, locked, touched, hintTarget, hintTile }: Props) {
  const t = useT();
  const lang = useLang();
  const a = analyzeSet(set.tiles);
  const drag = useDrag((s) => (s.active && (s.target?.kind === 'set' || s.target?.kind === 'swap') && s.target.setId === set.id ? s : null));
  const dragTiles = useDrag((s) => s.tiles);
  const selection = useGame((s) => s.selection);
  const splitSet = useGame((s) => s.splitSet);
  const shake = useGame((s) => s.shake);
  const hasSelection = selection.length > 0;
  const caret = drag && drag.target?.kind === 'set' ? drag.target.index : -1;
  const swapJoker = drag && drag.target?.kind === 'swap' ? drag.target.joker : null;
  const splitting = splitSet === set.id;
  const visible = set.tiles.filter((id) => !dragTiles.includes(id));
  const state = a.state;
  const kindLabel = a.kind ? t(`table.${a.kind}`) : t('table.invalidLabel');

  const place = (): void => {
    if (hasSelection) useGame.getState().moveSelectionTo({ kind: 'set', setId: set.id });
  };

  return (
    <div
      className="set"
      data-drop="set"
      data-set-id={set.id}
      data-state={state}
      data-touched={touched || undefined}
      data-preview={drag ? drag.preview ?? undefined : undefined}
      data-hint={hintTarget || undefined}
      data-locked={locked || undefined}
      role="group"
      aria-label={t('table.setLabel', { kind: kindLabel, count: set.tiles.length })}
    >
      <div className="set-tiles">
        {set.tiles.map((id, i) => {
          const vi = visible.indexOf(id);
          return (
            <Fragment key={id}>
              {caret >= 0 && vi === caret && <i className="caret" aria-hidden="true" />}
              {splitting && i > 0 && (
                <button
                  type="button"
                  className="scissor"
                  aria-label={t('table.split')}
                  onClick={() => useGame.getState().act({ type: 'split', setId: set.id, at: i })}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="6" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M8.1 8.1 20 20M8.1 15.9 20 4" />
                  </svg>
                </button>
              )}
              <Tile
                id={id}
                where="table"
                selected={selection.includes(id)}
                fresh={fresh.has(id)}
                lifted={dragTiles.includes(id)}
                hint={hintTile === id}
                shaking={!!shake && shake.tiles.includes(id)}
                locked={locked}
                role={a.jokers.get(id) ?? null}
              />
              {swapJoker === id && <i className="swap-ring" aria-hidden="true" />}
            </Fragment>
          );
        })}
        {caret >= 0 && caret >= visible.length && <i className="caret" aria-hidden="true" />}
        {hasSelection && !locked && (
          <button type="button" className="set-add" aria-label={t('table.newSet')} onClick={place}>
            <span aria-hidden="true">+</span>
          </button>
        )}
      </div>
      {state !== 'valid' && a.issue && touched && (
        <p className="set-note" data-state={state}>
          {state === 'incomplete' ? t('set.too-short') : setIssueText(lang, a.issue)}
        </p>
      )}
    </div>
  );
});
