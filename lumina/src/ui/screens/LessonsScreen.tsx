import { useGame } from '../../store/game';
import { Icon } from '../components/Icon';
import { LESSONS } from '../../lessons/lessons';
import { usePortrait } from '../../characters/portrait3d';
import { useT } from '../../i18n';

const TITLES = ['lesson.l1', 'lesson.l2', 'lesson.l3', 'lesson.l4', 'lesson.l5', 'lesson.l6'];

export function LessonsScreen() {
  const t = useT();
  const store = useGame.getState();
  const hero = usePortrait('ginini', 'happy', 256);
  return (
    <div className="screen lessons">
      <header className="screen-head">
        <button type="button" className="icon-btn" aria-label={t('setup.back')} onClick={() => store.go('home')}>
          <Icon name="back" />
        </button>
        <h1>{t('lesson.title')}</h1>
      </header>
      <div className="screen-body">
        <div className="lesson-hero">
          <img src={hero} width={112} height={112} alt="" />
        </div>
        <ol className="lesson-list">
          {LESSONS.map((_, i) => (
            <li key={i}>
              <button type="button" className="lesson-item" onClick={() => store.startLesson(i)}>
                <span className="lesson-no">{i + 1}</span>
                <span className="lesson-text">{t(TITLES[i] as string)}</span>
                <Icon name="back" size={16} />
              </button>
            </li>
          ))}
        </ol>
      </div>
      <footer className="screen-foot">
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => store.startLesson(0)}>
          {t('lesson.start')}
        </button>
      </footer>
    </div>
  );
}
