import { useGame } from '../../store/game';
import { Icon } from '../components/Icon';
import { Tile } from '../components/Tile';
import { RulesBody } from '../game/Overlays';
import { TS } from '../../game/fixtures';
import { useT } from '../../i18n';

const EXAMPLES = [TS('r7 b7 o7 k7'), TS('b3 b4 b5 b6'), TS('o10 o11 J'), TS('k12 k13 k1')];

export function RulesScreen() {
  const t = useT();
  const back = useGame((s) => (s.session && s.session.match.game.phase === 'playing' ? 'game' : 'home'));
  return (
    <div className="screen rules">
      <header className="screen-head">
        <button type="button" className="icon-btn" aria-label={t('setup.back')} onClick={() => useGame.getState().go(back)}>
          <Icon name="back" />
        </button>
        <h1>{t('rulesPage.title')}</h1>
      </header>
      <div className="screen-body">
        <section className="card examples" style={{ ['--tw' as string]: '32px' }}>
          {EXAMPLES.map((set, i) => (
            <div key={i} className="example" data-bad={i === 3 || undefined}>
              {set.map((id) => (
                <Tile key={id} id={id} where="deco" />
              ))}
              <span className="example-label">{i === 0 ? t('table.group') : i === 3 ? '✕' : t('table.run')}</span>
            </div>
          ))}
        </section>
        <section className="card">
          <RulesBody />
        </section>
      </div>
    </div>
  );
}
