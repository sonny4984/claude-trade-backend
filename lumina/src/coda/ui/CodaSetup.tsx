import { useMemo, useState } from 'react';
import { useGame } from '../../store/game';
import type { AiLevel } from '../../game/types';
import { CHARACTER_ORDER, type CharacterId } from '../../characters/roster';
import { usePortrait } from '../../characters/portrait3d';
import { Icon } from '../../ui/components/Icon';
import { translateList, useLang, useT } from '../../i18n';
import { loadCodaSetup, savedCoda, useCoda, type CodaSeatConfig, type CodaSetupConfig } from '../store';
import { CodaTile } from './CodaTile';

const LEVELS: AiLevel[] = ['beginner', 'casual', 'advanced', 'expert'];

function defaults(mode: 'solo' | 'local', lang: 'ko' | 'en', jokers = true): CodaSetupConfig {
  const ko = lang === 'ko';
  if (mode === 'solo') {
    return {
      mode,
      jokers,
      seats: [
        { name: ko ? '나' : 'You', kind: 'human', level: 'casual', character: 'moka' },
        { name: ko ? '휘기' : 'Hwigi', kind: 'ai', level: 'beginner', character: 'hwigi' },
        { name: ko ? '기니니' : 'Ginini', kind: 'ai', level: 'casual', character: 'ginini' },
      ],
    };
  }
  return {
    mode,
    jokers,
    seats: [
      { name: ko ? '나' : 'Player 1', kind: 'human', level: 'casual', character: 'hwigi' },
      { name: ko ? '여자친구' : 'Player 2', kind: 'human', level: 'casual', character: 'ginini' },
      { name: ko ? '동생' : 'Player 3', kind: 'human', level: 'casual', character: 'pponi' },
    ],
  };
}

function Avatar({ id }: { id: CharacterId }) {
  const src = usePortrait(id, 'idle', 128);
  return <img src={src} alt="" width={52} height={52} />;
}

/** 규칙 예시: 검정3 · 하양3 · 조커 · 검정7 (공개된 것 하나 포함) */
function Example() {
  const t = useT();
  return (
    <div className="coda-example" aria-hidden="true">
      <CodaTile id={3} faceUp revealed={false} secret label="" size="sm" />
      <CodaTile id={16} faceUp revealed={false} secret label="" size="sm" />
      <CodaTile id={25} faceUp revealed={false} secret label="" size="sm" />
      <CodaTile id={7} faceUp revealed label="" size="sm" />
      <span className="coda-example-arrow">→</span>
      <CodaTile id={9} faceUp={false} revealed={false} label="" size="sm" />
      <CodaTile id={20} faceUp={false} revealed={false} label="" size="sm" />
      <small>{t('coda.pick')}</small>
    </div>
  );
}

export function CodaSetup() {
  const t = useT();
  const lang = useLang();
  const [cfg, setCfg] = useState<CodaSetupConfig>(() => loadCodaSetup() ?? defaults('solo', lang));
  const saved = useMemo(() => savedCoda(), []);
  const seats = cfg.seats;
  const n = seats.length;
  const go = useGame.getState().go;

  const patchSeat = (i: number, patch: Partial<CodaSeatConfig>): void => setCfg((c) => ({ ...c, seats: c.seats.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  const cycleCharacter = (i: number): void => {
    const used = new Set(seats.filter((_, k) => k !== i).map((s) => s.character));
    let idx = CHARACTER_ORDER.indexOf(seats[i]?.character ?? 'hwigi');
    for (let step = 0; step < CHARACTER_ORDER.length; step++) {
      idx = (idx + 1) % CHARACTER_ORDER.length;
      const next = CHARACTER_ORDER[idx] as CharacterId;
      if (!used.has(next)) {
        patchSeat(i, { character: next, ...(seats[i]?.kind === 'ai' ? { name: t(`character.${next}`) } : {}) });
        return;
      }
    }
  };
  const addSeat = (): void => {
    if (n >= 4) return;
    const used = new Set(seats.map((s) => s.character));
    const character = CHARACTER_ORDER.find((c) => !used.has(c)) ?? 'hwigi';
    const kind = cfg.mode === 'solo' ? 'ai' : 'human';
    const name = kind === 'ai' ? t(`character.${character}`) : `${lang === 'ko' ? '플레이어' : 'Player'} ${n + 1}`;
    setCfg((c) => ({ ...c, seats: [...c.seats, { name, kind, level: 'casual', character }] }));
  };
  const removeSeat = (i: number): void => {
    if (n <= 2) return;
    setCfg((c) => ({ ...c, seats: c.seats.filter((_, k) => k !== i) }));
  };
  const setMode = (mode: 'solo' | 'local'): void => {
    if (mode === cfg.mode) return;
    setCfg(defaults(mode, lang, cfg.jokers));
  };
  const start = (): void => {
    useCoda.getState().start({
      ...cfg,
      seats: cfg.seats.map((s, i) => ({ ...s, name: s.name.trim() || `${lang === 'ko' ? '플레이어' : 'Player'} ${i + 1}` })),
    });
  };

  return (
    <div className="screen setup coda-setup">
      <header className="screen-head">
        <button type="button" className="icon-btn" aria-label={t('setup.back')} onClick={() => go('home')}>
          <Icon name="back" />
        </button>
        <h1>{t('coda.title')}</h1>
      </header>
      <div className="screen-body">
        {saved && (
          <button type="button" className="plate-btn plate-primary coda-resume" onClick={() => useCoda.getState().resume()}>
            <span className="plate-label">{t('coda.resume')}</span>
            <span className="plate-sub">{t('coda.resumeInfo', { turn: saved.turn, n: saved.players })}</span>
          </button>
        )}
        <div className="seg" role="radiogroup" aria-label={t('coda.title')}>
          {(['solo', 'local'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={cfg.mode === m} onClick={() => setMode(m)}>
              {t(`coda.${m}`)}
            </button>
          ))}
        </div>
        {cfg.mode === 'local' && <p className="note">{t('setup.handoffNote')}</p>}
        <section className="card">
          <h2 className="card-title">{t('setup.seats')}</h2>
          <ol className="seat-list">
            {seats.map((s, i) => (
              <li key={i} className="seat-row">
                <button type="button" className="seat-avatar" onClick={() => cycleCharacter(i)} aria-label={`${t('character.pick')}: ${t(`character.${s.character}`)}`}>
                  <Avatar id={s.character} />
                  <span className="seat-avatar-name">{t(`character.${s.character}`)}</span>
                </button>
                <div className="seat-fields">
                  {s.kind === 'human' ? (
                    <input className="text-input" value={s.name} maxLength={12} placeholder={t('setup.namePh')} aria-label={t('setup.namePh')} onChange={(e) => patchSeat(i, { name: e.target.value })} />
                  ) : (
                    <div className="ai-name">
                      <b>{s.name}</b>
                    </div>
                  )}
                  {s.kind === 'ai' && (
                    <div className="seg" role="radiogroup" aria-label={t('ai.level')}>
                      {LEVELS.map((l) => (
                        <button key={l} type="button" role="radio" aria-checked={s.level === l} onClick={() => patchSeat(i, { level: l })}>
                          {t(`ai.${l}`)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="seat-side">
                  {cfg.mode === 'local' && i > 0 && (
                    <button
                      type="button"
                      className="chip"
                      onClick={() =>
                        patchSeat(i, s.kind === 'human' ? { kind: 'ai', name: t(`character.${s.character}`) } : { kind: 'human', name: `${lang === 'ko' ? '플레이어' : 'Player'} ${i + 1}` })
                      }
                    >
                      {s.kind === 'human' ? t('setup.human') : t('setup.ai')}
                    </button>
                  )}
                  {i > 0 && n > 2 && (
                    <button type="button" className="icon-btn small" aria-label={t('setup.remove')} onClick={() => removeSeat(i)}>
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {n < 4 && (
            <button type="button" className="btn btn-ghost add-seat" onClick={addSeat}>
              <Icon name="plus" size={18} /> {t('setup.addSeat')}
            </button>
          )}
        </section>
        <section className="card">
          <label className="toggle-row">
            <span>
              {t('coda.jokers')}
              <small className="toggle-sub">{t('coda.jokersSub')}</small>
            </span>
            <input type="checkbox" className="switch" checked={cfg.jokers} onChange={(e) => setCfg((c) => ({ ...c, jokers: e.target.checked }))} />
          </label>
        </section>
        <section className="card">
          <h2 className="card-title">{t('coda.howTitle')}</h2>
          <Example />
          <ol className="coda-how">
            {translateList(lang, 'coda.how').map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </section>
      </div>
      <footer className="screen-foot">
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={start}>
          {t('coda.start')}
        </button>
      </footer>
    </div>
  );
}
