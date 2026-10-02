import { useState } from 'react';
import { useGame } from '../../store/game';
import { useSettings, type SeatConfig, type SetupConfig } from '../../store/settings';
import { CLASSIC_RULES, CAFE_HOUSE_RULES, type RuleSet } from '../../game/rules';
import type { AiLevel } from '../../game/types';
import type { MatchFormat } from '../../game/match';
import { CHARACTER_ORDER, type CharacterId } from '../../characters/roster';
import { usePortrait } from '../../characters/portrait3d';
import { Icon } from '../components/Icon';
import { useT, useLang } from '../../i18n';

const LEVELS: AiLevel[] = ['beginner', 'casual', 'advanced', 'expert'];

function defaults(mode: 'solo' | 'local', lang: 'ko' | 'en'): SetupConfig {
  const ko = lang === 'ko';
  if (mode === 'solo') {
    return {
      mode,
      seats: [
        { name: ko ? '나' : 'You', kind: 'human', level: 'casual', character: 'moka' },
        { name: ko ? '휘기' : 'Hwigi', kind: 'ai', level: 'beginner', character: 'hwigi' },
        { name: ko ? '기니니' : 'Ginini', kind: 'ai', level: 'casual', character: 'ginini' },
      ],
      format: { kind: 'games', games: 1 },
      rules: { ...CLASSIC_RULES, turnSeconds: null },
    };
  }
  return {
    mode,
    seats: [
      { name: ko ? '나' : 'Player 1', kind: 'human', level: 'casual', character: 'hwigi' },
      { name: ko ? '여자친구' : 'Player 2', kind: 'human', level: 'casual', character: 'ginini' },
      { name: ko ? '동생' : 'Player 3', kind: 'human', level: 'casual', character: 'pponi' },
    ],
    format: { kind: 'games', games: 1 },
    rules: CLASSIC_RULES,
  };
}

function Seg<T extends string | number | null>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={o.v === value} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Avatar({ id }: { id: CharacterId }) {
  const src = usePortrait(id, 'idle', 128);
  return <img src={src} alt="" width={52} height={52} />;
}

export function Setup({ mode }: { mode: 'solo' | 'local' }) {
  const t = useT();
  const lang = useLang();
  const last = useSettings((s) => (mode === 'solo' ? s.lastSolo : s.lastLocal));
  const assist = useSettings((s) => s.assist);
  const [cfg, setCfg] = useState<SetupConfig>(() => last ?? defaults(mode, lang));
  const [openRules, setOpenRules] = useState(false);
  const store = useGame.getState();
  const seats = cfg.seats;

  const patchSeat = (i: number, patch: Partial<SeatConfig>): void => {
    setCfg((c) => ({ ...c, seats: c.seats.map((s, k) => (k === i ? { ...s, ...patch } : s)) }));
  };
  const cycleCharacter = (i: number): void => {
    const used = new Set(seats.filter((_, k) => k !== i).map((s) => s.character));
    const cur = seats[i]?.character ?? 'hwigi';
    let idx = CHARACTER_ORDER.indexOf(cur);
    for (let step = 0; step < CHARACTER_ORDER.length; step++) {
      idx = (idx + 1) % CHARACTER_ORDER.length;
      const next = CHARACTER_ORDER[idx] as CharacterId;
      if (!used.has(next)) {
        const seat = seats[i];
        const renamed = seat && seat.kind === 'ai' ? { name: t(`character.${next}`) } : {};
        patchSeat(i, { character: next, ...renamed });
        return;
      }
    }
  };
  const addSeat = (): void => {
    if (seats.length >= 4) return;
    const used = new Set(seats.map((s) => s.character));
    const character = CHARACTER_ORDER.find((c) => !used.has(c)) ?? 'hwigi';
    const kind = mode === 'solo' ? 'ai' : 'human';
    const name = kind === 'ai' ? t(`character.${character}`) : `${lang === 'ko' ? '플레이어' : 'Player'} ${seats.length + 1}`;
    setCfg((c) => ({ ...c, seats: [...c.seats, { name, kind, level: 'casual', character }] }));
  };
  const removeSeat = (i: number): void => {
    if (seats.length <= 2) return;
    setCfg((c) => ({ ...c, seats: c.seats.filter((_, k) => k !== i) }));
  };
  const setRules = (patch: Partial<RuleSet>): void => setCfg((c) => ({ ...c, rules: { ...c.rules, ...patch } }));
  const n = seats.length;
  const formatValue = cfg.format.kind === 'points' ? 'points' : cfg.format.games === 1 ? 'single' : 'round';
  const setFormat = (v: string): void => {
    const f: MatchFormat = v === 'points' ? { kind: 'points', target: 100 } : { kind: 'games', games: v === 'round' ? n : 1 };
    setCfg((c) => ({ ...c, format: f }));
  };
  const start = (): void => {
    const fixed: SetupConfig = {
      ...cfg,
      seats: cfg.seats.map((s, i) => ({ ...s, name: s.name.trim() || `${lang === 'ko' ? '플레이어' : 'Player'} ${i + 1}` })),
      format: cfg.format.kind === 'games' && cfg.format.games > 1 ? { kind: 'games', games: n } : cfg.format,
    };
    store.startMatch(fixed);
  };
  const isCafe = JSON.stringify({ ...cfg.rules, turnSeconds: null }) === JSON.stringify({ ...CAFE_HOUSE_RULES, turnSeconds: null });

  return (
    <div className="screen setup">
      <header className="screen-head">
        <button type="button" className="icon-btn" aria-label={t('setup.back')} onClick={() => store.go('home')}>
          <Icon name="back" />
        </button>
        <h1>{mode === 'solo' ? t('setup.titleSolo') : t('setup.titleLocal')}</h1>
      </header>
      <div className="screen-body">
        {mode === 'local' && <p className="note">{t('setup.handoffNote')}</p>}
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
                    <input
                      className="text-input"
                      value={s.name}
                      maxLength={12}
                      placeholder={t('setup.namePh')}
                      aria-label={t('setup.namePh')}
                      onChange={(e) => patchSeat(i, { name: e.target.value })}
                    />
                  ) : (
                    <div className="ai-name">
                      <b>{s.name}</b> <span>{t(`ai.${s.level}Sub`)}</span>
                    </div>
                  )}
                  {s.kind === 'ai' && (
                    <Seg<AiLevel>
                      label={t('ai.level')}
                      value={s.level}
                      options={LEVELS.map((l) => ({ v: l, label: t(`ai.${l}`) }))}
                      onChange={(v) => patchSeat(i, { level: v })}
                    />
                  )}
                </div>
                <div className="seat-side">
                  {mode === 'local' && i > 0 && (
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
          <h2 className="card-title">{t('settings.assistShort')}</h2>
          <Seg<'self' | 'some' | 'lots'>
            label={t('settings.assistShort')}
            value={assist}
            options={(['self', 'some', 'lots'] as const).map((v) => ({ v, label: t(`settings.assistOpt.${v}`) }))}
            onChange={(v) => useSettings.getState().set({ assist: v })}
          />
          <p className="note setup-note">{t(`settings.assistSub.${assist}`)}</p>
          <h2 className="card-title">{t('setup.timer')}</h2>
          <Seg<number | null>
            label={t('setup.timer')}
            value={cfg.rules.turnSeconds}
            options={[null, 30, 60, 90, 120].map((v) => ({ v, label: v === null ? t('setup.timerOff') : t('setup.seconds', { n: v }) }))}
            onChange={(v) => setRules({ turnSeconds: v })}
          />
          <h2 className="card-title">{t('setup.format')}</h2>
          <Seg<string>
            label={t('setup.format')}
            value={formatValue}
            options={[
              { v: 'single', label: t('setup.single') },
              { v: 'round', label: t('setup.round', { n }) },
              { v: 'points', label: t('setup.points') },
            ]}
            onChange={setFormat}
          />
        </section>

        <section className="card">
          <button type="button" className="disclosure" aria-expanded={openRules} onClick={() => setOpenRules((o) => !o)}>
            <span>{t('setup.house')}</span>
            <span className="disclosure-value">{isCafe ? t('setup.presetCafe') : t('setup.presetClassic')}</span>
          </button>
          {openRules && (
            <div className="rules-grid">
              <label>{t('setup.preset')}</label>
              <Seg<string>
                label={t('setup.preset')}
                value={isCafe ? 'cafe' : 'classic'}
                options={[
                  { v: 'classic', label: t('setup.presetClassic') },
                  { v: 'cafe', label: t('setup.presetCafe') },
                ]}
                onChange={(v) => setRules({ ...(v === 'cafe' ? CAFE_HOUSE_RULES : CLASSIC_RULES), turnSeconds: cfg.rules.turnSeconds })}
              />
              <label>{t('setup.meldPoints')}</label>
              <Seg<number> label={t('setup.meldPoints')} value={cfg.rules.initialMeldPoints} options={[30, 40, 50].map((v) => ({ v, label: String(v) }))} onChange={(v) => setRules({ initialMeldPoints: v })} />
              <label>{t('setup.continueAfterMeld')}</label>
              <Seg<string>
                label={t('setup.continueAfterMeld')}
                value={cfg.rules.initialMeldContinuesTurn ? 'on' : 'off'}
                options={[
                  { v: 'off', label: t('settings.off') },
                  { v: 'on', label: t('settings.on') },
                ]}
                onChange={(v) => setRules({ initialMeldContinuesTurn: v === 'on' })}
              />
              <label>{t('setup.jokerReplace')}</label>
              <Seg<RuleSet['jokerReplace']>
                label={t('setup.jokerReplace')}
                value={cfg.rules.jokerReplace}
                options={[
                  { v: 'any-legal', label: t('setup.jokerAny') },
                  { v: 'exact-tile', label: t('setup.jokerExact') },
                ]}
                onChange={(v) => setRules({ jokerReplace: v })}
              />
              <label>{t('setup.jokerLocked')}</label>
              <Seg<string>
                label={t('setup.jokerLocked')}
                value={cfg.rules.jokerSetLocked ? 'on' : 'off'}
                options={[
                  { v: 'off', label: t('settings.off') },
                  { v: 'on', label: t('settings.on') },
                ]}
                onChange={(v) => setRules({ jokerSetLocked: v === 'on' })}
              />
              <label>{t('setup.jokerPenalty')}</label>
              <Seg<number> label={t('setup.jokerPenalty')} value={cfg.rules.jokerPenalty} options={[30, 50].map((v) => ({ v, label: String(v) }))} onChange={(v) => setRules({ jokerPenalty: v })} />
              <label>{t('setup.timeoutPenalty')}</label>
              <Seg<number>
                label={t('setup.timeoutPenalty')}
                value={cfg.rules.timeoutPenaltyDraw}
                options={[
                  { v: 3, label: t('setup.draw3') },
                  { v: 1, label: t('setup.draw1') },
                  { v: 0, label: t('setup.draw0') },
                ]}
                onChange={(v) => setRules({ timeoutPenaltyDraw: v })}
              />
              <label>{t('setup.unmelded')}</label>
              <Seg<number>
                label={t('setup.unmelded')}
                value={cfg.rules.unmeldedPenalty}
                options={[
                  { v: 0, label: t('setup.none') },
                  { v: 100, label: '100' },
                ]}
                onChange={(v) => setRules({ unmeldedPenalty: v })}
              />
            </div>
          )}
        </section>
      </div>
      <footer className="screen-foot">
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={start}>
          {t('setup.start')}
        </button>
      </footer>
    </div>
  );
}
