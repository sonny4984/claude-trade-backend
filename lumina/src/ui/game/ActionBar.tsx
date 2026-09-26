import { useGame, turnSummary, currentSeatIsHuman } from '../../store/game';
import { useSettings } from '../../store/settings';
import { Icon } from '../components/Icon';
import { translate, useT } from '../../i18n';
import { sfx } from '../../audio/sfx';

/** 정렬 방식 돌리기: 색 → 숫자 → 묶음 (버튼과 S 키가 같이 쓴다) */
export function cycleSort(): void {
  const modes = ['color', 'number', 'smart'] as const;
  const cur = (document.documentElement.dataset.sort as (typeof modes)[number]) ?? 'smart';
  const next = modes[(modes.indexOf(cur) + 1) % modes.length] as (typeof modes)[number];
  document.documentElement.dataset.sort = next;
  const store = useGame.getState();
  store.sortRack(next);
  store.toastMsg(translate(useSettings.getState().lang, `action.sort${next[0]?.toUpperCase()}${next.slice(1)}`), 'info');
}

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

  return (
    <nav className="actions" aria-label="actions">
      <div className="tools">
        <button type="button" className="tool" disabled={!human || !turn.past.length} onClick={() => store.act({ type: 'undo' })} title="U" aria-label={t('action.undo')} aria-keyshortcuts="U">
          <Icon name="undo" />
          <span>{t('action.undo')}</span>
        </button>
        <button type="button" className="tool" disabled={!human || !turn.future.length} onClick={() => store.act({ type: 'redo' })} title="Shift+U" aria-label={t('action.redo')} aria-keyshortcuts="Shift+U">
          <Icon name="redo" />
          <span>{t('action.redo')}</span>
        </button>
        <button type="button" className="tool" disabled={!human || !changed} onClick={() => store.act({ type: 'reset' })} title="R" aria-label={t('action.reset')} aria-keyshortcuts="R">
          <Icon name="reset" />
          <span>{t('action.reset')}</span>
        </button>
        <button type="button" className="tool" disabled={hintDisabled} onClick={() => store.requestHint()} title="H" aria-label={t('action.hint')} aria-keyshortcuts="H" data-active={hint.level > 0 || undefined}>
          <Icon name="hint" />
          <span>
            {t('action.hint')}
            {hintsSetting === 'limited' && Number.isFinite(hintsLeft) ? ` ${hintsLeft}` : ''}
          </span>
        </button>
        <button type="button" className="tool" onClick={cycleSort} disabled={!human} title="S" aria-label={t('action.sort')} aria-keyshortcuts="S">
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
          aria-keyshortcuts="D"
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
          aria-keyshortcuts="Space"
        >
          {commitLabel}
        </button>
      </div>
    </nav>
  );
}
