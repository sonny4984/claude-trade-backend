import { Fragment, memo, type CSSProperties } from 'react';
import { analyzeSet, type TableSet, type TileId } from '../../game';
import { Tile } from './Tile';
import { useDrag } from '../dnd';
import { useAssist, useGame } from '../../store/game';
import { useT } from '../../i18n';

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

/** 보드 위 세트 하나 = 가로로 붙은 타일 줄. 칸 위치(--row, --col)에 그대로 놓이고, 테두리는 ::before가 그려 타일 자리를 건드리지 않는다. */
export const SetView = memo(function SetView({ set, fresh, locked, touched, hintTarget, hintTile, recent }: Props) {
  const t = useT();
  const a = analyzeSet(set.tiles);
  const swap = useDrag((s) => (s.active && s.target?.kind === 'swap' && s.target.setId === set.id ? s : null));
  const dragTiles = useDrag((s) => s.tiles);
  const selection = useGame((s) => s.selection);
  const shake = useGame((s) => s.shake);
  const assist = useAssist();
  const swapJoker = swap && swap.target?.kind === 'swap' ? swap.target.joker : null;
  // 스스로 모드에서는 읽어 주는 이름으로도 맞는지 알려 주지 않는다
  const kindLabel = assist === 'self' ? t('table.anyLabel') : a.kind ? t(`table.${a.kind}`) : t('table.invalidLabel');
  const style = { ['--row' as string]: set.row, ['--col' as string]: set.col, ['--n' as string]: set.tiles.length } as CSSProperties;

  return (
    <div
      className="set"
      data-drop="set"
      data-set-id={set.id}
      data-state={a.state}
      data-touched={touched || undefined}
      data-preview={swap ? (swap.preview ?? undefined) : undefined}
      data-hint={hintTarget || undefined}
      data-locked={locked || undefined}
      role="group"
      aria-label={t('table.setLabel', { kind: kindLabel, count: set.tiles.length })}
      style={style}
    >
      <div className="set-tiles">
        {set.tiles.map((id) => (
          <Fragment key={id}>
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
        ))}
      </div>
    </div>
  );
});
