/**
 * 마피아 준비 — 몇 명이서, 내 캐릭터, 내 역할, 말하기(읽어 주기·Claude 대사).
 */
import { useEffect } from 'react';
import { useGame } from '../../store/game';
import { useOnline } from '../../net/online';
import { usePortrait } from '../../characters/portrait3d';
import type { CharacterId } from '../../characters/roster';
import { Icon } from '../../ui/components/Icon';
import { translateList, useLang, useT } from '../../i18n';
import { CAST, MAX_PLAYERS, MIN_PLAYERS, rolesFor, type Role } from '../engine';
import { useMafia } from '../store';
import { canSpeak } from '../voice';

function Avatar({ id }: { id: CharacterId }) {
  const src = usePortrait(id, 'happy', 128);
  return <img src={src} alt="" width={56} height={56} />;
}

const ROLE_ORDER: readonly (Role | 'random')[] = ['random', 'citizen', 'police', 'doctor', 'mafia'];

export function MafiaSetup() {
  const t = useT();
  const lang = useLang();
  const cfg = useMafia((s) => s.cfg);
  const claudeOk = useMafia((s) => s.claudeOk);
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
          {canSpeak() && (
            <label className="toggle-row">
              <span>
                {t('mafia.voice')}
                <small className="toggle-sub">{t('mafia.voiceSub')}</small>
              </span>
              <input type="checkbox" className="switch" checked={cfg.voice} onChange={(e) => setCfg({ voice: e.target.checked })} />
            </label>
          )}
          {claudeOk ? (
            <label className="toggle-row">
              <span>
                {t('mafia.claude')}
                <small className="toggle-sub">{t('mafia.claudeSub')}</small>
              </span>
              <input type="checkbox" className="switch" checked={cfg.claude} onChange={(e) => setCfg({ claude: e.target.checked })} />
            </label>
          ) : (
            <p className="mf-sub">{t('mafia.claudeNa')}</p>
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
