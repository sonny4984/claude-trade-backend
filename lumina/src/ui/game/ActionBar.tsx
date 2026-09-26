import { useGame, turnSummary, currentSeatIsHuman } from '../../store/game';
import { useSettings } from '../../store/settings';
import { Icon } from '../components/Icon';
import { useT } from '../../i18n';
import { sfx } from '../../audio/sfx';

export function ActionBar() {
  const t = useT();
  const session = useGame((s) => s.session);
  const curtain = useGame((s) => s.curtain);
  const ai = useGame((s) => s.ai);
  const hint = useGame((s) => s.hint);
  const hintsSetting = useSettings((s) => s.hints);
  if (!session) return null;
  const g = session.match.game;
  const store = useGame.getState();
  const human = currentSeatIsHuman(session) && !curtain && !ai && g.phase === 'playing';
  const { changed, check } = turnSummary(g);
  const turn = g.turn;
  const canCommit = human && check.ok && (changed || turn.meldedNow);
  const commitLabel = turn.meldedNow && !changed ? t('action.endTurn') : check.kind === 'meld' ? t('action.meld') : t('action.commit');
  const drawLabel = turn.meldedNow ? t('action.endTurn') : g.pool.length === 0 ? t('action.pass') : changed ? t('action.resetDraw') : t('action.draw');
  const hintsLeft = session.hintsLeft;
  const hintDisabled = !human || hintsSetting === 'off' || (hint.level === 0 && hintsLeft <= 0);
  const sortNext = (): void => {
    const modes = ['color', 'number', 'smart'] as const;
    const cur = (document.documentElement.dataset.sort as (typeof modes)[number]) ?? 'smart';
    const next = modes[(modes.indexOf(cur) + 1) % modes.length] as (typeof modes)[number];
    document.documentElement.dataset.sort = next;
    store.sortRack(next);
    store.toastMsg(t(`action.sort${next[0]?.toUpperCase()}${next.slice(1)}`), 'info');
  };

  return (
    <nav className="actions" aria-label="actions">
      <div className="tools">
        <button type="button" className="tool" disabled={!human || !turn.past.length} onClick={() => store.act({ type: 'undo' })} title="U">
          <Icon name="undo" />
          <span>{t('action.undo')}</span>
        </button>
        <button type="button" className="tool" disabled={!human || !turn.future.length} onClick={() => store.act({ type: 'redo' })} title="Shift+U">
          <Icon name="redo" />
          <span>{t('action.redo')}</span>
        </button>
        <button type="button" className="tool" disabled={!human || !changed} onClick={() => store.act({ type: 'reset' })} title="R">
          <Icon name="reset" />
          <span>{t('action.reset')}</span>
        </button>
        <button type="button" className="tool" disabled={hintDisabled} onClick={() => store.requestHint()} title="H" data-active={hint.level > 0 || undefined}>
          <Icon name="hint" />
          <span>
            {t('action.hint')}
            {hintsSetting === 'limited' && Number.isFinite(hintsLeft) ? ` ${hintsLeft}` : ''}
          </span>
        </button>
        <button type="button" className="tool" onClick={sortNext} disabled={!human} title="S">
          <Icon name="sort" />
          <span>{t('action.sort')}</span>
        </button>
      </div>
      <div className="moves">
        <button
          type="button"
          className="btn btn-secondary draw-btn"
          disabled={!human || (turn.meldedNow && changed && !check.ok)}
          onClick={() => {
            sfx('button');
            if (turn.meldedNow) store.commit();
            else store.draw();
          }}
          title="D"
        >
          {drawLabel}
        </button>
        <button
          type="button"
          className="btn btn-primary commit-btn"
          disabled={!canCommit}
          data-ready={canCommit || undefined}
          onClick={() => store.commit()}
          title="Space"
        >
          {commitLabel}
        </button>
      </div>
    </nav>
  );
}
