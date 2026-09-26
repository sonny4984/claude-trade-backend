import { useGame } from '../../store/game';
import { Icon } from '../components/Icon';
import { Tile } from '../components/Tile';
import { RulesBody } from '../game/Overlays';
import { TS } from '../../game/fixtures';
import { translateList, useLang, useT } from '../../i18n';
import { CodaTile } from '../../coda/ui/CodaTile';

const EXAMPLES = [TS('r7 b7 o7 k7'), TS('b3 b4 b5 b6'), TS('o10 o11 J'), TS('k12 k13 k1')];

function CodaRules() {
  const t = useT();
  const lang = useLang();
  return (
    <section className="card coda-rules" aria-labelledby="coda-rules-title">
      <h2 className="card-title" id="coda-rules-title">
        {t('coda.rulesTitle')}
      </h2>
      <div className="coda-example" aria-hidden="true">
        <CodaTile id={2} faceUp revealed={false} secret label="" size="sm" />
        <CodaTile id={15} faceUp revealed={false} secret label="" size="sm" />
        <CodaTile id={5} faceUp revealed label="" size="sm" />
        <CodaTile id={25} faceUp revealed={false} secret label="" size="sm" />
        <CodaTile id={11} faceUp revealed={false} secret label="" size="sm" />
      </div>
      <div className="rules-body">
        <ol>
          {translateList(lang, 'coda.rules').map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
        <p className="rules-source">{t('coda.rulesSource')}</p>
      </div>
    </section>
  );
}

export function RulesScreen() {
  const t = useT();
  const fromCoda = useGame((s) => s.prevScreen === 'coda');
  const back = useGame((s) => (s.prevScreen === 'game' || s.prevScreen === 'coda' ? s.prevScreen : 'home'));
  return (
    <div className="screen rules">
      <header className="screen-head">
        <button type="button" className="icon-btn" aria-label={t('setup.back')} onClick={() => useGame.getState().go(back)}>
          <Icon name="back" />
        </button>
        <h1>{t('rulesPage.title')}</h1>
      </header>
      <div className="screen-body">
        {fromCoda && <CodaRules />}
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
        {!fromCoda && <CodaRules />}
      </div>
    </div>
  );
}
