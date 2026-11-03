/**
 * 별판 점프 준비 — 인원(2·3명), 자리마다 사람/AI·캐릭터·이름(AI는 실력), 온라인.
 */
import { useMemo, useState } from 'react';
import { useGame } from '../../store/game';
import type { AiLevel } from '../../game/types';
import { CHARACTER_ORDER, type CharacterId } from '../../characters/roster';
import { usePortrait } from '../../characters/portrait3d';
import { Icon } from '../../ui/components/Icon';
import { translateList, useLang, useT } from '../../i18n';
import { useOnline } from '../../net/online';
import { loadStarSetup, savedStar, useStar, type StarSeatConfig, type StarSetupConfig } from '../store';
import { SEAT_COLORS } from './colors';

const LEVELS: AiLevel[] = ['beginner', 'casual', 'advanced', 'expert'];

function defaults(ko: boolean): StarSetupConfig {
  return {
    seats: [
      { name: ko ? '나' : 'Me', kind: 'human', level: 'casual', character: 'moka' },
      { name: ko ? '여자친구' : 'Player 2', kind: 'human', level: 'casual', character: 'ginini' },
      { name: ko ? '동생' : 'Player 3', kind: 'human', level: 'casual', character: 'pponi' },
    ],
  };
}

function Avatar({ id }: { id: CharacterId }) {
  const src = usePortrait(id, 'idle', 128);
  return <img src={src} alt="" width={52} height={52} />;
}

export function StarSetup() {
  const t = useT();
  const lang = useLang();
  const go = useGame.getState().go;
  const saved = useMemo(() => savedStar(), []);
  const [cfg, setCfg] = useState<StarSetupConfig>(() => loadStarSetup() ?? defaults(lang === 'ko'));
  const n = cfg.seats.length;
  const patch = (i: number, p: Partial<StarSeatConfig>): void => setCfg((c) => ({ seats: c.seats.map((x, k) => (k === i ? { ...x, ...p } : x)) }));
  const setCount = (want: number): void =>
    setCfg((c) => {
      if (want <= c.seats.length) return { seats: c.seats.slice(0, want) };
      const used = new Set(c.seats.map((x) => x.character));
      const character = CHARACTER_ORDER.find((x) => !used.has(x)) ?? 'hwigi';
      return { seats: [...c.seats, { name: t(`character.${character}`), kind: 'ai', level: 'casual', character }] };
    });
  const cycle = (i: number): void => {
    const s = cfg.seats[i];
    if (!s) return;
    const used = new Set(cfg.seats.filter((_, k) => k !== i).map((x) => x.character));
    let k = CHARACTER_ORDER.indexOf(s.character);
    for (let step = 0; step < CHARACTER_ORDER.length; step++) {
      k = (k + 1) % CHARACTER_ORDER.length;
      const next = CHARACTER_ORDER[k] as CharacterId;
      if (!used.has(next)) {
        patch(i, { character: next, ...(s.kind === 'ai' ? { name: t(`character.${next}`) } : {}) });
        return;
      }
    }
  };
  const start = (): void => {
    useStar.getState().start({ seats: cfg.seats.map((s, i) => ({ ...s, name: s.name.trim() || `${t('setup.namePh')} ${i + 1}` })) });
  };

  return (
    <div className="screen setup star-setup">
      <header className="screen-head">
        <button type="button" className="icon-btn" aria-label={t('setup.back')} onClick={() => go('home')}>
          <Icon name="back" />
        </button>
        <h1>{t('star.title')}</h1>
      </header>
      <div className="screen-body">
        <p className="fi-mode-sub">{t('star.intro')}</p>
        {saved && (
          <button type="button" className="plate-btn plate-primary" onClick={() => useStar.getState().resume()}>
            <span className="plate-label">{t('star.resume')}</span>
            <span className="plate-sub">{t('star.resumeInfo', { players: saved.players, n: saved.moves })}</span>
          </button>
        )}
        <div className="seg" role="radiogroup" aria-label={t('star.count')}>
          {[2, 3].map((k) => (
            <button key={k} type="button" role="radio" aria-checked={n === k} onClick={() => setCount(k)}>
              {t('star.countN', { n: k })}
            </button>
          ))}
        </div>
        <section className="card">
          <h2 className="card-title">{t('star.seats')}</h2>
          <ol className="seat-list">
            {cfg.seats.map((s, i) => (
              <li key={i} className="seat-row star-seat">
                <button type="button" className="seat-avatar" onClick={() => cycle(i)} aria-label={`${t('character.pick')}: ${t(`character.${s.character}`)}`}>
                  <Avatar id={s.character} />
                  <span className="seat-avatar-name">{t(`character.${s.character}`)}</span>
                </button>
                <div className="seat-fields">
                  {s.kind === 'human' ? (
                    <input className="text-input" value={s.name} maxLength={12} placeholder={t('star.namePh')} aria-label={t('star.namePh')} onChange={(e) => patch(i, { name: e.target.value })} />
                  ) : (
                    <div className="ai-name">
                      <b>{s.name}</b>
                    </div>
                  )}
                  <div className="seg" role="radiogroup" aria-label={t('star.seats')}>
                    {(['human', 'ai'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={s.kind === k}
                        onClick={() => patch(i, { kind: k, name: k === 'ai' ? t(`character.${s.character}`) : s.kind === 'ai' ? '' : s.name })}
                      >
                        {t(`star.${k}`)}
                      </button>
                    ))}
                  </div>
                  {s.kind === 'ai' && (
                    <div className="seg" role="radiogroup" aria-label={t('ai.level')}>
                      {LEVELS.map((l) => (
                        <button key={l} type="button" role="radio" aria-checked={s.level === l} onClick={() => patch(i, { level: l })}>
                          {t(`ai.${l}`)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="seat-side">
                  <span className="star-dot" style={{ background: SEAT_COLORS[i] }} aria-hidden="true" />
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="card">
          <h2 className="card-title">{t('star.howTitle')}</h2>
          <ol className="coda-how">
            {translateList(lang, 'star.how').map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </section>
      </div>
      <footer className="screen-foot">
        <button type="button" className="btn btn-primary btn-lg btn-block star-start" onClick={start}>
          {t('star.start')}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => {
            useOnline.getState().setGame('star');
            go('online');
          }}
        >
          {t('star.online')}
        </button>
      </footer>
    </div>
  );
}
