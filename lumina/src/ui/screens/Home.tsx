import { useMemo } from 'react';
import { savedSessionInfo, useGame } from '../../store/game';
import { savedRoom } from '../../net/online';
import { useSettings } from '../../store/settings';
import { usePortrait } from '../../characters/portrait3d';
import type { CharacterId } from '../../characters/roster';
import type { Expression } from '../../characters/draw2d';
import { Tile } from '../components/Tile';
import { Icon } from '../components/Icon';
import { TS } from '../../game/fixtures';
import { useT } from '../../i18n';

const DECOR = [TS('r4 r5 r6 r7'), TS('b9 o9 k9'), TS('o11 o12 J'), TS('k1 k2 k3')];

function Friend({ id, ex, i }: { id: CharacterId; ex: Expression; i: number }) {
  const src = usePortrait(id, ex, 256);
  return <img className="friend" style={{ ['--i' as string]: i }} src={src} alt="" />;
}

export function Home() {
  const t = useT();
  const store = useGame.getState();
  const saved = useMemo(() => savedSessionInfo(), []);
  const room = useMemo(() => savedRoom(), []);
  const lastSolo = useSettings((s) => s.lastSolo);
  return (
    <div className="home">
      <div className="home-table" aria-hidden="true">
        <div className="home-felt">
          {DECOR.map((set, i) => (
            <div key={i} className="home-set" style={{ ['--i' as string]: i }}>
              {set.map((id) => (
                <Tile key={id} id={id} where="deco" />
              ))}
            </div>
          ))}
        </div>
        <div className="home-friends">
          {(['hwigi', 'ginini', 'pponi'] as const).map((c, i) => (
            <Friend key={c} id={c} ex={i === 1 ? 'happy' : 'idle'} i={i} />
          ))}
        </div>
      </div>
      <header className="home-brand">
        <h1 className="wordmark">LUMINA</h1>
        <p className="wordmark-sub">{t('brand.sub')}</p>
        <p className="tagline">{t('brand.tagline')}</p>
      </header>
      <nav className="home-plate" aria-label="menu">
        {saved && (
          <button type="button" className="plate-btn plate-primary" onClick={() => store.resume()}>
            <span className="plate-label">{t('home.continue')}</span>
            <span className="plate-sub">
              {t('home.resumeInfo', { mode: t(`mode.${saved.mode}`), game: saved.gameNo, turn: saved.turnNo })}
            </span>
          </button>
        )}
        <button
          type="button"
          className={`plate-btn ${saved ? '' : 'plate-primary'}`}
          onClick={() => store.go('setup-solo')}
          onDoubleClick={() => lastSolo && store.startMatch(lastSolo)}
        >
          <span className="plate-label">{t('home.solo')}</span>
          <span className="plate-sub">{t('home.soloSub')}</span>
        </button>
        <button type="button" className="plate-btn" onClick={() => store.go('setup-local')}>
          <span className="plate-label">{t('home.local')}</span>
          <span className="plate-sub">{t('home.localSub')}</span>
        </button>
        <button type="button" className="plate-btn plate-coda" onClick={() => store.go('coda-setup')}>
          <span className="plate-label">{t('coda.title')}</span>
          <span className="plate-sub">{t('coda.sub')}</span>
          <span className="plate-tiles" aria-hidden="true">
            <i data-c="b">7</i>
            <i data-c="w" />
            <i data-c="b" />
          </span>
        </button>
        <button type="button" className="plate-btn plate-gomoku" onClick={() => store.go('gomoku-setup')}>
          <span className="plate-label">{t('gomoku.title')}</span>
          <span className="plate-sub">{t('gomoku.sub')}</span>
          <span className="plate-stones" aria-hidden="true">
            <i data-s="1" />
            <i data-s="2" />
            <i data-s="1" />
          </span>
        </button>
        <button type="button" className="plate-btn plate-online" onClick={() => store.go('online')}>
          <span className="plate-label">{t('online.title')}</span>
          <span className="plate-sub">{room ? t('online.resumeInfo', { code: room.code.toUpperCase(), role: t(`online.${room.role}`) }) : t('online.sub')}</span>
          <span className="plate-paws" aria-hidden="true">
            <i />
            <i />
          </span>
        </button>
        <button type="button" className="plate-btn" onClick={() => store.go('lessons')}>
          <span className="plate-label">{t('home.learn')}</span>
          <span className="plate-sub">{t('home.learnSub')}</span>
        </button>
      </nav>
      <footer className="home-links">
        <button type="button" className="link-btn" onClick={() => store.go('stats')}>
          <Icon name="chart" size={18} /> {t('home.stats')}
        </button>
        <button type="button" className="link-btn" onClick={() => store.go('rules')}>
          <Icon name="book" size={18} /> {t('home.rules')}
        </button>
        <button type="button" className="link-btn" onClick={() => store.go('settings')}>
          <Icon name="gear" size={18} /> {t('home.settings')}
        </button>
      </footer>
    </div>
  );
}
