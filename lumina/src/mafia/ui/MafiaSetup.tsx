/**
 * 마피아 준비 — 몇 명이서, 내 캐릭터, 내 역할, 말하기(읽어 주기·Claude 대사).
 */
import { useEffect, useState } from 'react';
import { useGame } from '../../store/game';
import { useOnline } from '../../net/online';
import { usePortrait } from '../../characters/portrait3d';
import type { CharacterId } from '../../characters/roster';
import { Icon } from '../../ui/components/Icon';
import { translateList, useLang, useT } from '../../i18n';
import { CAST, MAX_PLAYERS, MIN_PLAYERS, PERSONA, rolesFor, type Role } from '../engine';
import { squeakTalk, unlockAudio } from '../../audio/sfx';
import { useMafia, type VoiceMode } from '../store';
import { GEMINI_KEY_URL } from '../gemini';
import { DAILY_TOKENS } from '../budget';
import { siteUrl } from '../../net/site';
import { canSpeak } from '../voice';

function Avatar({ id }: { id: CharacterId }) {
  const src = usePortrait(id, 'happy', 128);
  return <img src={src} alt="" width={56} height={56} />;
}

const ROLE_ORDER: readonly (Role | 'random')[] = ['random', 'citizen', 'police', 'doctor', 'mafia'];
const VOICES: readonly VoiceMode[] = ['squeak', 'read', 'off'];

/** Gemini 연결: 키 넣기 → 확인 → 켜고 끄기 (키는 이 기기에만) */
function GeminiCard() {
  const t = useT();
  const cfg = useMafia((s) => s.cfg);
  const model = useMafia((s) => s.geminiModel);
  const state = useMafia((s) => s.geminiState);
  const [key, setKey] = useState('');
  const store = useMafia.getState();
  if (model)
    return (
      <div className="mf-gemini">
        <label className="toggle-row">
          <span>
            {t('mafia.gemini')}
            <small className="toggle-sub">{t('mafia.geminiOn', { model })}</small>
          </span>
          <input type="checkbox" className="switch" checked={cfg.gemini} onChange={(e) => store.setCfg({ gemini: e.target.checked })} />
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => store.forgetGemini()}>
          {t('mafia.geminiForget')}
        </button>
      </div>
    );
  return (
    <div className="mf-gemini">
      <p className="mf-sub">{t('mafia.geminiSub')}</p>
      <form
        className="mf-input"
        onSubmit={(e) => {
          e.preventDefault();
          void store.connectGemini(key).then((ok) => ok && setKey(''));
        }}
      >
        <input type="password" value={key} autoComplete="off" spellCheck={false} placeholder={t('mafia.geminiKeyPh')} aria-label={t('mafia.geminiKeyPh')} onChange={(e) => setKey(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!key.trim() || state === 'checking'}>
          {state === 'checking' ? t('mafia.geminiChecking') : t('mafia.geminiConnect')}
        </button>
      </form>
      {state !== 'idle' && state !== 'checking' && <p className="mf-gemini-err">{t(`mafia.geminiErr.${state}`)}</p>}
      <a className="mf-gemini-link" href={GEMINI_KEY_URL} target="_blank" rel="noopener noreferrer">
        {t('mafia.geminiGet')}
      </a>
      <p className="mf-sub">{t('mafia.geminiNote')}</p>
    </div>
  );
}

export function MafiaSetup() {
  const t = useT();
  const lang = useLang();
  const cfg = useMafia((s) => s.cfg);
  const claudeOk = useMafia((s) => s.claudeOk);
  const geminiModel = useMafia((s) => s.geminiModel);
  const used = useMafia((s) => s.claudeUsed);
  const locked = used >= DAILY_TOKENS;
  const site = siteUrl();
  const tokens = (n: number): string => (Math.round(n / 100) * 100).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US');
  const { setCfg, start, probe } = useMafia.getState();
  useEffect(() => probe(), [probe]);
  const counts = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);
  const roles = rolesFor(cfg.count);
  const lineup = (['mafia', 'police', 'doctor', 'citizen'] as const)
    .map((r) => [r, roles.filter((x) => x === r).length] as const)
    .filter(([, n]) => n > 0)
    .map(([r, n]) => `${t(`mafia.roles.${r}`)} ${n}`)
    .join(' · ');
  const role = cfg.role === 'random' || roles.includes(cfg.role) ? cfg.role : 'random';
  const cycle = (): void => setCfg({ me: CAST[(CAST.indexOf(cfg.me) + 1) % CAST.length] as CharacterId });

  return (
    <div className="screen setup mafia-setup">
      <header className="screen-head">
        <button type="button" className="icon-btn" aria-label={t('setup.back')} onClick={() => useGame.getState().go('home')}>
          <Icon name="back" />
        </button>
        <h1>{t('mafia.title')}</h1>
      </header>
      <div className="screen-body">
        <p className="fi-mode-sub">{t('mafia.intro')}</p>
        <section className="card">
          <h2 className="card-title">{t('mafia.count')}</h2>
          <div className="seg" role="radiogroup" aria-label={t('mafia.count')}>
            {counts.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={cfg.count === n} onClick={() => setCfg({ count: n })}>
                {t('mafia.countN', { n })}
              </button>
            ))}
          </div>
          <p className="mf-sub">{lineup}</p>
        </section>
        <section className="card">
          <h2 className="card-title">{t('mafia.me')}</h2>
          <div className="seat-row">
            <button type="button" className="seat-avatar" onClick={cycle} aria-label={`${t('character.pick')}: ${t(`character.${cfg.me}`)}`}>
              <Avatar id={cfg.me} />
              <span className="seat-avatar-name">{t(`character.${cfg.me}`)}</span>
            </button>
            <div className="seat-fields">
              <small className="fi-el-sub">{t(`character.${cfg.me}Sub`)}</small>
              <small className="fi-el-sub">{t('mafia.meSub')}</small>
            </div>
          </div>
        </section>
        <section className="card">
          <h2 className="card-title">{t('mafia.myRole')}</h2>
          <div className="seg mf-roles" role="radiogroup" aria-label={t('mafia.myRole')}>
            {ROLE_ORDER.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={role === r} disabled={r !== 'random' && !roles.includes(r)} onClick={() => setCfg({ role: r })}>
                {r === 'random' ? t('mafia.random') : t(`mafia.roles.${r}`)}
              </button>
            ))}
          </div>
          <p className="mf-sub">{role === 'random' ? t('mafia.randomSub') : t(`mafia.roleSub.${role}`)}</p>
        </section>
        <section className="card">
          <h2 className="card-title">{t('mafia.talk')}</h2>
          <div className="seg" role="radiogroup" aria-label={t('mafia.voiceMode')}>
            {VOICES.filter((m) => m !== 'read' || canSpeak()).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={cfg.voice === m} onClick={() => setCfg({ voice: m })}>
                {t(`mafia.voiceModes.${m}`)}
              </button>
            ))}
          </div>
          <p className="mf-sub">{t(`mafia.voiceModeSub.${cfg.voice}`)}</p>
          {cfg.voice !== 'off' && <p className="mf-sub">{t('mafia.voiceHint')}</p>}
          {cfg.voice === 'squeak' && (
            <div className="mf-voice-tune">
              <label className="mf-slider">
                <span>{t('mafia.pitch')}</span>
                <input type="range" min={0.9} max={1.8} step={0.05} value={cfg.squeakPitch} aria-label={t('mafia.pitch')} onChange={(e) => setCfg({ squeakPitch: Number(e.target.value) })} />
              </label>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  unlockAudio();
                  squeakTalk(t('mafia.previewLine'), PERSONA[cfg.me].squeak * cfg.squeakPitch, 'excited');
                }}
              >
                {t('mafia.preview')}
              </button>
            </div>
          )}
        </section>
        <section className="card" id="mf-ai-talk">
          <h2 className="card-title">{t(claudeOk ? 'mafia.claude' : 'mafia.gemini')}</h2>
          {claudeOk ? (
            <>
              <label className="toggle-row">
                <span>
                  {t('mafia.claude')}
                  <small className="toggle-sub">{t('mafia.claudeSub')}</small>
                </span>
                <input type="checkbox" className="switch" checked={cfg.claude && !locked} disabled={locked} onChange={(e) => setCfg({ claude: e.target.checked })} />
              </label>
              <p className="mf-sub mf-usage" data-locked={locked || undefined}>
                {locked ? t('mafia.claudeLocked', { max: tokens(DAILY_TOKENS) }) : t('mafia.claudeToday', { used: tokens(used), max: tokens(DAILY_TOKENS) })}
              </p>
              {locked && site && (
                <a className="mf-gemini-link" href={site} target="_blank" rel="noopener noreferrer">
                  {t('mafia.claudeToSite')}
                </a>
              )}
              <p className="mf-sub">{t('mafia.geminiElsewhere')}</p>
            </>
          ) : (
            <GeminiCard />
          )}
          {(claudeOk || geminiModel) && (
            <label className="toggle-row">
              <span>
                {t('mafia.saver')}
                <small className="toggle-sub">{t('mafia.saverSub')}</small>
              </span>
              <input type="checkbox" className="switch" checked={cfg.saver} onChange={(e) => setCfg({ saver: e.target.checked })} />
            </label>
          )}
        </section>
        <section className="card">
          <h2 className="card-title">{t('mafia.howTitle')}</h2>
          <ol className="coda-how">
            {translateList(lang, 'mafia.how').map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </section>
      </div>
      <footer className="screen-foot">
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => start()}>
          {t('mafia.start')}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => {
            useOnline.getState().setGame('mafia');
            useGame.getState().go('online');
          }}
        >
          {t('mafia.online')}
        </button>
      </footer>
    </div>
  );
}
