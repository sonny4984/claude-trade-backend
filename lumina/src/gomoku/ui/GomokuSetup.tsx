/**
 * 오목 준비 — 혼자 두기(AI 실력·내 돌 색) / 함께 두기(한 기기 두 사람), 흑 쌍삼 금지.
 */
import { useMemo, useState } from 'react';
import { useGame } from '../../store/game';
import type { AiLevel } from '../../game/types';
import { CHARACTER_ORDER, type CharacterId } from '../../characters/roster';
import { usePortrait } from '../../characters/portrait3d';
import { Icon } from '../../ui/components/Icon';
import { translateList, useLang, useT } from '../../i18n';
import { loadGomokuSetup, savedGomoku, useGomoku, type GomokuSeatConfig, type GomokuSetupConfig } from '../store';

const LEVELS: AiLevel[] = ['beginner', 'casual', 'advanced', 'expert'];

function defaults(mode: 'solo' | 'local', ko: boolean, keep?: GomokuSetupConfig | null): GomokuSetupConfig {
  const rule = keep?.noDoubleThree ?? true;
  if (mode === 'solo') {
    return {
      mode,
      firstStone: 1,
      noDoubleThree: rule,
      seats: [
        { name: ko ? '나' : 'You', kind: 'human', level: 'casual', character: 'moka' },
        { name: ko ? '휘기' : 'Hwigi', kind: 'ai', level: 'casual', character: 'hwigi' },
      ],
    };
  }
  return {
    mode,
    firstStone: 1,
    noDoubleThree: rule,
    seats: [
      { name: ko ? '나' : 'Player 1', kind: 'human', level: 'casual', character: 'hwigi' },
      { name: ko ? '여자친구' : 'Player 2', kind: 'human', level: 'casual', character: 'ginini' },
    ],
  };
}

function Avatar({ id }: { id: CharacterId }) {
  const src = usePortrait(id, 'idle', 128);
  return <img src={src} alt="" width={52} height={52} />;
}

export function GomokuSetup() {
  const t = useT();
  const lang = useLang();
  const go = useGame.getState().go;
  const saved = useMemo(() => savedGomoku(), []);
  const [cfg, setCfg] = useState<GomokuSetupConfig>(() => {
    const last = loadGomokuSetup();
    return last ?? defaults('solo', lang === 'ko');
  });
  const patchSeat = (i: 0 | 1, p: Partial<GomokuSeatConfig>): void =>
    setCfg((c) => ({ ...c, seats: (i === 0 ? [{ ...c.seats[0], ...p }, c.seats[1]] : [c.seats[0], { ...c.seats[1], ...p }]) as [GomokuSeatConfig, GomokuSeatConfig] }));
  const cycleCharacter = (i: 0 | 1): void => {
    const cur = cfg.seats[i].character;
    const other = cfg.seats[i === 0 ? 1 : 0].character;
    let k = CHARACTER_ORDER.indexOf(cur);
    let next = cur;
    for (let n = 0; n < CHARACTER_ORDER.length; n++) {
      k = (k + 1) % CHARACTER_ORDER.length;
      next = CHARACTER_ORDER[k] as CharacterId;
      if (next !== other) break;
    }
    patchSeat(i, { character: next, ...(cfg.seats[i].kind === 'ai' ? { name: t(`character.${next}`) } : {}) });
  };
  const start = (): void => {
    useGomoku.getState().start({
      ...cfg,
      seats: cfg.seats.map((s, i) => ({ ...s, name: s.name.trim() || `${lang === 'ko' ? '플레이어' : 'Player'} ${i + 1}` })) as unknown as [GomokuSeatConfig, GomokuSeatConfig],
    });
  };
  const solo = cfg.mode === 'solo';

  return (
    <div className="screen setup gomoku-setup">
      <header className="screen-head">
        <button type="button" className="icon-btn" aria-label={t('setup.back')} onClick={() => go('home')}>
          <Icon name="back" />
        </button>
        <h1>{t('gomoku.title')}</h1>
      </header>
      <div className="screen-body">
        {saved && (
          <button type="button" className="plate-btn plate-primary" onClick={() => useGomoku.getState().resume()}>
            <span className="plate-label">{t('gomoku.resume')}</span>
            <span className="plate-sub">{t('gomoku.resumeInfo', { n: saved.moves })}</span>
          </button>
        )}
        <div className="seg" role="radiogroup" aria-label={t('gomoku.title')}>
          {(['solo', 'local'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={cfg.mode === m} onClick={() => setCfg(defaults(m, lang === 'ko', cfg))}>
              {t(`gomoku.${m}`)}
            </button>
          ))}
        </div>
        <section className="card">
          <h2 className="card-title">{t('setup.seats')}</h2>
          <ol className="seat-list">
            {([0, 1] as const).map((i) => {
              const s = cfg.seats[i];
              const stone = i === 0 ? cfg.firstStone : cfg.firstStone === 1 ? 2 : 1;
              return (
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
                    <span className="go-dot" data-stone={stone} title={t(stone === 1 ? 'gomoku.black' : 'gomoku.white')} />
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="seg" role="radiogroup" aria-label={t('gomoku.myStone')}>
            {([1, 2] as const).map((st) => (
              <button key={st} type="button" role="radio" aria-checked={cfg.firstStone === st} onClick={() => setCfg((c) => ({ ...c, firstStone: st }))}>
                {solo ? t(st === 1 ? 'gomoku.meBlack' : 'gomoku.meWhite') : t(st === 1 ? 'gomoku.p1Black' : 'gomoku.p1White')}
              </button>
            ))}
          </div>
        </section>
        <section className="card">
          <label className="toggle-row">
            <span>
              {t('gomoku.rule33')}
              <small className="toggle-sub">{t('gomoku.rule33Sub')}</small>
            </span>
            <input type="checkbox" className="switch" checked={cfg.noDoubleThree} onChange={(e) => setCfg((c) => ({ ...c, noDoubleThree: e.target.checked }))} />
          </label>
        </section>
        <section className="card">
          <h2 className="card-title">{t('gomoku.howTitle')}</h2>
          <ol className="coda-how">
            {translateList(lang, 'gomoku.how').map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </section>
      </div>
      <footer className="screen-foot">
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={start}>
          {t('gomoku.start')}
        </button>
      </footer>
    </div>
  );
}
