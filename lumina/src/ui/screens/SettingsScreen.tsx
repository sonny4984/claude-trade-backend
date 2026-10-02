import { useGame } from '../../store/game';
import { useSettings, THEME_IDS, type ThemeId } from '../../store/settings';
import { useStats } from '../../store/stats';
import { Icon } from '../components/Icon';
import { Tile } from '../components/Tile';
import { TS } from '../../game/fixtures';
import { useT } from '../../i18n';
import { sfx } from '../../audio/sfx';
import { useState } from 'react';

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" className="switch" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={() => sfx('place')}
      />
    </label>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="choice-row">
      <span>{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={o.v === value} onClick={() => onChange(o.v)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const SAMPLE = TS('r7 b8 o9 k10 J');

export function SettingsScreen() {
  const t = useT();
  const s = useSettings();
  const back = useGame((st) => (st.prevScreen === 'game' || st.prevScreen === 'coda' ? st.prevScreen : 'home'));
  const [confirmReset, setConfirmReset] = useState(false);
  const store = useGame.getState();
  return (
    <div className="screen settings">
      <header className="screen-head">
        <button type="button" className="icon-btn" aria-label={t('setup.back')} onClick={() => store.go(back)}>
          <Icon name="back" />
        </button>
        <h1>{t('settings.title')}</h1>
      </header>
      <div className="screen-body">
        <section className="card">
          <h2 className="card-title">{t('settings.theme')}</h2>
          <div className="theme-grid">
            {THEME_IDS.map((id: ThemeId) => (
              <button key={id} type="button" className="theme-card" data-preview={id} aria-pressed={s.theme === id} onClick={() => s.set({ theme: id })}>
                <span className="theme-swatch" data-theme-preview={id}>
                  <span className="swatch-tile">7</span>
                </span>
                <b>{t(`theme.${id}`)}</b>
                <small>{t(`theme.${id}Sub`)}</small>
              </button>
            ))}
          </div>
          <div className="sample-row" style={{ ['--tw' as string]: '34px' }}>
            {SAMPLE.map((id) => (
              <Tile key={id} id={id} where="deco" />
            ))}
          </div>
        </section>
        <section className="card">
          <h2 className="card-title">{t('settings.appearance')}</h2>
          <Choice label={t('settings.tileSize')} value={s.tileSize} options={[{ v: 'S', label: t('settings.small') }, { v: 'M', label: t('settings.medium') }, { v: 'L', label: t('settings.large') }]} onChange={(v) => s.set({ tileSize: v })} />
          <Choice label={t('settings.motion')} value={s.motion} options={[{ v: 'system', label: t('settings.motionSystem') }, { v: 'full', label: t('settings.motionFull') }, { v: 'reduced', label: t('settings.motionReduced') }]} onChange={(v) => s.set({ motion: v })} />
          <Toggle label="3D" value={s.show3d} onChange={(v) => s.set({ show3d: v })} />
          <Choice label={t('settings.language')} value={s.lang} options={[{ v: 'ko', label: '한국어' }, { v: 'en', label: 'English' }]} onChange={(v) => s.set({ lang: v })} />
        </section>
        <section className="card">
          <h2 className="card-title">{t('settings.audio')}</h2>
          <Slider label={t('settings.master')} value={s.master} onChange={(v) => s.set({ master: v })} />
          <Slider label={t('settings.volTiles')} value={s.volTiles} onChange={(v) => s.set({ volTiles: v })} />
          <Slider label={t('settings.volCues')} value={s.volCues} onChange={(v) => s.set({ volCues: v })} />
          <Slider label={t('settings.volFanfare')} value={s.volFanfare} onChange={(v) => s.set({ volFanfare: v })} />
          <Toggle label={t('settings.haptics')} value={s.haptics} onChange={(v) => s.set({ haptics: v })} />
        </section>
        <section className="card">
          <h2 className="card-title">{t('settings.gameplay')}</h2>
          <Choice label={t('settings.aiSpeed')} value={s.aiSpeed} options={[{ v: 'fast', label: t('settings.fast') }, { v: 'normal', label: t('settings.normal') }, { v: 'slow', label: t('settings.slow') }]} onChange={(v) => s.set({ aiSpeed: v })} />
          <Choice label={t('settings.assist')} value={s.assist} options={(['self', 'some', 'lots'] as const).map((v) => ({ v, label: t(`settings.assistOpt.${v}`) }))} onChange={(v) => s.set({ assist: v })} />
          <p className="note">{t(`settings.assistSub.${s.assist}`)}</p>
          <p className="note">{t(`settings.assistCodaSub.${s.assist}`)}</p>
          <Choice label={t('settings.hints')} value={s.hints} options={[{ v: 'limited', label: t('settings.hintsLimited') }, { v: 'unlimited', label: t('settings.hintsUnlimited') }, { v: 'off', label: t('settings.hintsOff') }]} onChange={(v) => s.set({ hints: v })} />
          <Choice label={t('settings.autoSort')} value={s.autoSort} options={[{ v: 'color', label: t('action.sortColor') }, { v: 'number', label: t('action.sortNumber') }, { v: 'off', label: t('settings.off') }]} onChange={(v) => s.set({ autoSort: v })} />
          <Toggle label={t('settings.confirmDraw')} value={s.confirmDraw} onChange={(v) => s.set({ confirmDraw: v })} />
        </section>
        <section className="card">
          <h2 className="card-title">{t('settings.accessibility')}</h2>
          <Toggle label={t('settings.colorMarks')} value={s.colorMarks} onChange={(v) => s.set({ colorMarks: v })} />
          <Toggle label={t('settings.highContrast')} value={s.highContrast} onChange={(v) => s.set({ highContrast: v })} />
          <Toggle label={t('settings.cvd')} value={s.cvd} onChange={(v) => s.set({ cvd: v })} />
        </section>
        <section className="card">
          <p className="note">{t('settings.about')}</p>
          {!confirmReset ? (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(true)}>
              {t('settings.reset')}
            </button>
          ) : (
            <div className="sheet-row">
              <span className="note">{t('settings.resetConfirm')}</span>
              <button type="button" className="btn btn-danger" onClick={() => { useStats.getState().clear(); setConfirmReset(false); }}>
                {t('action.confirm')}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
