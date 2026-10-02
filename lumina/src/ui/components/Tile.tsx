import { memo, useCallback, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { tile, type JokerRole, type TileId } from '../../game';
import { registerTile } from '../flip';
import { tilePointerDown } from '../dnd';
import { useGame } from '../../store/game';
import { useSettings } from '../../store/settings';
import { subj, tileLabel, useLang, translate } from '../../i18n';

export type TileWhere = 'table' | 'rack' | 'staging' | 'ghost' | 'deco';

interface Props {
  id: TileId;
  where: TileWhere;
  selected?: boolean;
  fresh?: boolean;
  drawn?: boolean;
  hint?: boolean;
  lifted?: boolean;
  shaking?: boolean;
  locked?: boolean;
  role?: JokerRole | null;
  faceDown?: boolean;
  /** 내가 지난번에 둔 뒤 다른 사람이 낸 타일: 그 사람 색과 이름 */
  by?: { readonly color: string; readonly name: string } | null;
}

const SHAPE = { red: 'circle', blue: 'diamond', orange: 'triangle', black: 'square' } as const;

/** 조커 문양 — 황동 해 위에 옥스블러드 초승달 (독자 디자인) */
export function JokerMark() {
  return (
    <svg className="joker-mark" viewBox="0 0 40 40" aria-hidden="true">
      <g className="joker-rays">
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="20" y1="4.5" x2="20" y2="8.5" transform={`rotate(${i * 30} 20 20)`} />
        ))}
      </g>
      <circle className="joker-sun" cx="20" cy="20" r="9.5" />
      <path className="joker-moon" d="M24.6 11.2a10 10 0 1 0 4.2 15.6a8.2 8.2 0 1 1 -4.2 -15.6z" />
      <circle className="joker-star" cx="13.5" cy="14" r="1.3" />
    </svg>
  );
}

export const Tile = memo(function Tile({ id, where, selected, fresh, drawn, hint, lifted, shaking, locked, role, faceDown, by }: Props) {
  const lang = useLang();
  const marks = useSettings((s) => s.colorMarks);
  const t = tile(id);
  const interactive = where === 'table' || where === 'rack' || where === 'staging';
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (where === 'table' || where === 'rack' || where === 'staging') registerTile(id, el);
    },
    [id, where],
  );
  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (interactive && !faceDown) tilePointerDown(e, id);
    },
    [id, interactive, faceDown],
  );
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!interactive) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        useGame.getState().select(id);
      }
    },
    [id, interactive],
  );

  if (faceDown) {
    return <div className="tile is-back" data-where={where} aria-hidden="true" />;
  }

  let label = tileLabel(lang, id);
  if (t.kind === 'joker' && role) {
    const what = role.color ? `${translate(lang, `color.${role.color}`)} ${role.value}` : String(role.value);
    label = translate(lang, 'tile.jokerAs', { what });
  }
  if (selected) label += `, ${translate(lang, 'tile.selected')}`;
  if (fresh) label += `, ${translate(lang, 'tile.fresh')}`;
  if (by) label += `, ${translate(lang, 'tile.playedBy', { name: by.name, subj: subj(lang, by.name) })}`;

  const cls = [
    'tile',
    t.kind === 'joker' ? 'is-joker' : '',
    selected ? 'is-selected' : '',
    fresh ? 'is-fresh' : '',
    drawn ? 'is-drawn' : '',
    hint ? 'is-hint' : '',
    lifted ? 'is-lifted' : '',
    shaking ? 'is-shaking' : '',
    locked ? 'is-locked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={ref}
      className={cls}
      data-tile-id={where === 'ghost' ? undefined : id}
      data-ghost-id={where === 'ghost' ? id : undefined}
      data-where={where}
      data-color={t.kind === 'number' ? t.color : 'joker'}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label}
      aria-pressed={interactive ? !!selected : undefined}
      style={by ? ({ ['--by' as string]: by.color } as CSSProperties) : undefined}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      {by && <i className="tile-by" aria-hidden="true" />}
      {t.kind === 'number' ? (
        <span className="tile-face">
          <span className={t.value >= 10 ? 'tile-num is-wide' : 'tile-num'}>{t.value}</span>
          {marks && <i className={`tile-mark mark-${SHAPE[t.color]}`} aria-hidden="true" />}
        </span>
      ) : (
        <span className="tile-face">
          <JokerMark />
          {role && (
            <span className="joker-role" data-color={role.color ?? 'any'}>
              {role.value}
            </span>
          )}
        </span>
      )}
    </div>
  );
});
