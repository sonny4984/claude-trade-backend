import { Fragment, useMemo, useRef } from 'react';
import { useGame, visibleRack, smartOrder, type Session } from '../../store/game';
import { useDrag } from '../dnd';
import { Tile } from '../components/Tile';
import { useRackFit } from './fit';
import { useT } from '../../i18n';
import { syncRackOrder } from './rackOrder';
import type { TileId } from '../../game';

/** 지금 이 화면에서 보여도 되는 랙의 주인 (혼자 두기: 늘 나 / 함께 두기: 지금 차례인 사람, 가림막이 없을 때) */
export function rackOwner(s: Session, curtain: boolean): number | null {
  const g = s.match.game;
  if (s.mode !== 'local') {
    const me = s.match.seats.findIndex((p) => p.seat === 'human');
    return me >= 0 ? me : null;
  }
  if (curtain) return null;
  return s.match.seats[g.current]?.seat === 'human' ? g.current : null;
}

export function Rack() {
  const t = useT();
  const session = useGame((s) => s.session);
  const curtain = useGame((s) => s.curtain);
  const selection = useGame((s) => s.selection);
  const hint = useGame((s) => s.hint);
  const shake = useGame((s) => s.shake);
  const dragTiles = useDrag((s) => s.tiles);
  const target = useDrag((s) => (s.target?.kind === 'rack' ? s.target : null));
  const refuse = useDrag((s) => s.target?.kind === 'rack' && s.preview === 'refuse');
  const wellRef = useRef<HTMLDivElement>(null);
  const owner = session ? rackOwner(session, curtain) : null;
  const tiles: TileId[] = useMemo(() => {
    if (!session || owner === null) return [];
    const g = session.match.game;
    if (owner === g.current) return visibleRack(session);
    return syncRackOrder(session.rackOrder[owner] ?? [], g.players[owner]?.rack ?? []);
  }, [session, owner]);
  const clusters = useMemo(() => {
    const m = new Map<TileId, number>();
    smartOrder(tiles).clusters.forEach((c, i) => c.forEach((id) => m.set(id, i)));
    return m;
  }, [tiles]);
  const backs = session && owner === null ? session.match.game.players[session.match.game.current]?.rack.length ?? 0 : 0;
  const rw = useRackFit(wellRef, owner === null ? Math.min(backs, 20) : tiles.length);
  if (!session) return null;
  const g = session.match.game;
  const active = owner !== null && owner === g.current && !curtain;
  const drawn = owner !== null ? session.drawn[owner] ?? [] : [];
  const visible = tiles.filter((id) => !dragTiles.includes(id));
  const caret = target && !refuse ? target.index : -1;
  const hintTile = hint.level >= 1 ? hint.data?.focus ?? null : null;

  return (
    <section className="rack" aria-label={t('hud.yourTurn')} data-active={active || undefined} style={{ ['--rw' as string]: `${rw}px` }}>
      <div className="rack-tray">
        <div className="rack-well" data-drop={active ? 'rack' : undefined} data-refuse={refuse || undefined} ref={wellRef}>
          {owner === null
            ? Array.from({ length: Math.min(backs, 20) }, (_, i) => <Tile key={i} id={0} where="deco" faceDown />)
            : tiles.map((id, i) => {
                const prev = tiles[i - 1];
                const cl = clusters.get(id);
                const joinsPrev = cl !== undefined && prev !== undefined && clusters.get(prev) === cl;
                return (
                  <Fragment key={id}>
                    {caret >= 0 && visible.indexOf(id) === caret && <i className="caret" aria-hidden="true" />}
                    <span className="rack-slot" data-join={joinsPrev || undefined} data-cluster={cl !== undefined || undefined}>
                      <Tile
                        id={id}
                        where="rack"
                        selected={active && selection.includes(id)}
                        drawn={drawn.includes(id)}
                        lifted={dragTiles.includes(id)}
                        hint={hintTile === id}
                        shaking={!!shake && shake.tiles.includes(id)}
                      />
                    </span>
                  </Fragment>
                );
              })}
          {caret >= 0 && caret >= visible.length && <i className="caret" aria-hidden="true" />}
        </div>
      </div>
    </section>
  );
}
