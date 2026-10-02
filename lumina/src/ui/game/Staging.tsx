import { Fragment } from 'react';
import { useGame, currentSeatIsHuman } from '../../store/game';
import { useDrag } from '../dnd';
import { Tile } from '../components/Tile';
import { useT } from '../../i18n';

export function Staging() {
  const t = useT();
  const session = useGame((s) => s.session);
  const selection = useGame((s) => s.selection);
  const dragTiles = useDrag((s) => s.tiles);
  const target = useDrag((s) => (s.target?.kind === 'staging' ? s.target : null));
  if (!session) return null;
  const g = session.match.game;
  const staging = g.turn.work.staging;
  const humanTurn = currentSeatIsHuman(session);
  // 보드에 아무 데나 놓을 수 있으니 작업대는 쓸 일이 있을 때만 (풀려난 조커가 올라온다)
  const open = humanTurn && staging.length > 0;
  if (!open) return null;
  const visible = staging.filter((id) => !dragTiles.includes(id));
  const caret = target ? target.index : -1;
  return (
    <section
      className="staging"
      data-drop="staging"
      data-target={target ? true : undefined}
      aria-label={t('table.staging')}
      onClick={(e) => {
        if (e.target === e.currentTarget && selection.length) useGame.getState().moveSelectionTo({ kind: 'staging' });
      }}
    >
      <span className="staging-label">{t('table.staging')}</span>
      <div className="staging-tiles">
        {staging.map((id) => (
          <Fragment key={id}>
            {caret >= 0 && visible.indexOf(id) === caret && <i className="caret" aria-hidden="true" />}
            <Tile id={id} where="staging" selected={selection.includes(id)} lifted={dragTiles.includes(id)} />
          </Fragment>
        ))}
        {caret >= 0 && caret >= visible.length && <i className="caret" aria-hidden="true" />}
        {!staging.length && <span className="staging-hint">{t('table.stagingHint')}</span>}
      </div>
    </section>
  );
}
