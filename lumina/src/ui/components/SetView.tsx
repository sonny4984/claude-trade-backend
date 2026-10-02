import { Fragment, memo } from 'react';
import { analyzeSet, type TableSet, type TileId } from '../../game';
import { Tile } from './Tile';
import { useDrag } from '../dnd';
import { useAssist, useGame } from '../../store/game';
import { setIssueText, useLang, useT } from '../../i18n';

interface Props {
  set: TableSet;
  fresh: ReadonlySet<TileId>;
  locked: boolean;
  touched: boolean;
  hintTarget: boolean;
  hintTile: TileId | null;
  /** 다른 사람이 최근에 낸 타일 → 그 사람 색·이름 */
  recent?: ReadonlyMap<TileId, { readonly color: string; readonly name: string }>;
}

export const SetView = memo(function SetView({ set, fresh, locked, touched, hintTarget, hintTile, recent }: Props) {
  const t = useT();
  const lang = useLang();
  const a = analyzeSet(set.tiles);
  const drag = useDrag((s) => (s.active && (s.target?.kind === 'set' || s.target?.kind === 'swap') && s.target.setId === set.id ? s : null));
  const dragTiles = useDrag((s) => s.tiles);
  const selection = useGame((s) => s.selection);
  const splitSet = useGame((s) => s.splitSet);
  const shake = useGame((s) => s.shake);
  const assist = useAssist();
  const hasSelection = selection.length > 0;
  const caret = drag && drag.target?.kind === 'set' ? drag.target.index : -1;
  const swapJoker = drag && drag.target?.kind === 'swap' ? drag.target.joker : null;
  const splitting = splitSet === set.id;
  const visible = set.tiles.filter((id) => !dragTiles.includes(id));
  const state = a.state;
  // 스스로 모드에서는 읽어 주는 이름으로도 맞는지 알려 주지 않는다
  const kindLabel = assist === 'self' ? t('table.anyLabel') : a.kind ? t(`table.${a.kind}`) : t('table.invalidLabel');

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
      data-can-place={(hasSelection && !locked) || undefined}
      onClick={(e) => {
        // 고른 타일이 있으면 세트 아무 데나 눌러도 여기에 (타일·단추를 누른 건 따로 처리)
        if (!(e.target as HTMLElement).closest('[data-tile-id], button') && !locked) place();
      }}
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
                by={fresh.has(id) ? null : (recent?.get(id) ?? null)}
              />
              {swapJoker === id && <i className="swap-ring" aria-hidden="true" />}
            </Fragment>
          );
        })}
        {caret >= 0 && caret >= visible.length && <i className="caret" aria-hidden="true" />}
        {hasSelection && !locked && (
          <button type="button" className="set-add" aria-label={t('table.addHere')} onClick={place}>
            <span aria-hidden="true">+</span>
          </button>
        )}
      </div>
      {/* 스스로 모드: 3장이 안 되는 세트만 알려 준다 (맞는지 틀렸는지는 스스로 확인) */}
      {state !== 'valid' && a.issue && touched && (assist !== 'self' || state === 'incomplete') && (
        <p className="set-note" data-state={state}>
          {state === 'incomplete' ? t('set.too-short') : setIssueText(lang, a.issue)}
        </p>
      )}
    </div>
  );
});
