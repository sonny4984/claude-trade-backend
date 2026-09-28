/**
 * 불과 얼음 준비 — 누구와(혼자 번갈아 / 한 기기 둘이 / 온라인), 누가 불·얼음인지, 몇 단계를 할지.
 */
import { useMemo, useState } from 'react';
import { useGame } from '../../store/game';
import { CHARACTER_ORDER, type CharacterId } from '../../characters/roster';
import { usePortrait } from '../../characters/portrait3d';
import { Icon } from '../../ui/components/Icon';
import { translateList, useLang, useT } from '../../i18n';
import { useOnline } from '../../net/online';
import { firstOpenLevel, levelDef, levelNo, levelsFor, loadFireIceSetup, unlocked, useFireIce, type FireIceConfig } from '../store';

function Avatar({ id }: { id: CharacterId }) {
  const src = usePortrait(id, 'happy', 128);
  return <img src={src} alt="" width={56} height={56} />;
}

function defaults(ko: boolean): FireIceConfig {
  return { mode: 'solo', names: [ko ? '불' : 'Fire', ko ? '얼음' : 'Ice'], characters: ['hwigi', 'ginini'] };
}

export function FireIceSetup() {
  const t = useT();
  const lang = useLang();
  const go = useGame.getState().go;
  const progress = useFireIce((s) => s.progress);
  const [cfg, setCfg] = useState<FireIceConfig>(() => loadFireIceSetup() ?? defaults(lang === 'ko'));
  const three = cfg.characters.length >= 3;
  const players = three ? 3 : 2;
  const els = (['fire', 'ice', 'leaf'] as const).slice(0, players);
  const list = levelsFor(players);
  const [level, setLevel] = useState(() => firstOpenLevel(useFireIce.getState().progress, loadFireIceSetup()?.characters.length ?? 2));
  const totalStars = useMemo(() => list.reduce((a, i) => a + (progress[levelDef(i).id]?.stars ?? 0), 0), [progress, list]);

  // 셋이서: 혼자 불·얼음·말차를 번갈아 (한 기기 둘이는 둘만)
  const setThree = (on: boolean): void => {
    setCfg((c) => {
      const used = new Set(c.characters.slice(0, 2));
      const third = CHARACTER_ORDER.find((x) => !used.has(x)) ?? 'pponi';
      return on ? { mode: 'solo', names: [c.names[0] ?? '', c.names[1] ?? '', t('fireice.leaf')], characters: [c.characters[0] ?? 'hwigi', c.characters[1] ?? 'ginini', third] } : { ...c, names: c.names.slice(0, 2), characters: c.characters.slice(0, 2) };
    });
    setLevel(firstOpenLevel(progress, on ? 3 : 2));
  };
  const cycle = (i: number): void => {
    const cur = cfg.characters[i] as CharacterId;
    const others = cfg.characters.filter((_, j) => j !== i);
    let k = CHARACTER_ORDER.indexOf(cur);
    let next = cur;
    for (let n = 0; n < CHARACTER_ORDER.length; n++) {
      k = (k + 1) % CHARACTER_ORDER.length;
      next = CHARACTER_ORDER[k] as CharacterId;
      if (!others.includes(next)) break;
    }
    setCfg((c) => ({ ...c, characters: c.characters.map((x, j) => (j === i ? next : x)) }));
  };
  const setName = (i: number, v: string): void => setCfg((c) => ({ ...c, names: c.names.map((x, j) => (j === i ? v : x)) }));
  const start = (): void => {
    const names = cfg.names.map((n, i) => n.trim() || t(`fireice.${els[i] ?? 'fire'}`));
    useFireIce.getState().start({ ...cfg, names }, level);
  };
  const toOnline = (): void => {
    useOnline.getState().setGame('fireice');
    go('online');
  };

  return (
    <div className="screen setup fireice-setup">
      <header className="screen-head">
        <button type="button" className="icon-btn" aria-label={t('setup.back')} onClick={() => go('home')}>
          <Icon name="back" />
        </button>
        <h1>{t('fireice.title')}</h1>
      </header>
      <div className="screen-body">
        <div className="seg" role="radiogroup" aria-label={t('fireice.title')}>
          <button type="button" role="radio" aria-checked={cfg.mode === 'solo' && !three} onClick={() => (three ? setThree(false) : setCfg((c) => ({ ...c, mode: 'solo' })))}>
            {t('fireice.solo')}
          </button>
          <button type="button" role="radio" aria-checked={three} onClick={() => setThree(true)}>
            {t('fireice.trio')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={cfg.mode === 'local'}
            onClick={() => {
              if (three) setThree(false);
              setCfg((c) => ({ ...c, mode: 'local' }));
            }}
          >
            {t('fireice.local')}
          </button>
          <button type="button" role="radio" aria-checked={false} onClick={toOnline}>
            {t('fireice.online')}
          </button>
        </div>
        <p className="fi-mode-sub">{t(three ? 'fireice.trioSub' : cfg.mode === 'solo' ? 'fireice.soloSub' : 'fireice.localSub')}</p>
        <section className="card">
          <h2 className="card-title">{t('fireice.who')}</h2>
          <ol className="seat-list">
            {els.map((el, i) => {
              return (
                <li key={i} className="seat-row fi-seat" data-el={el}>
                  <button type="button" className="seat-avatar" onClick={() => cycle(i)} aria-label={`${t('character.pick')}: ${t(`character.${cfg.characters[i]}`)}`}>
                    <Avatar id={cfg.characters[i]} />
                    <span className="seat-avatar-name">{t(`character.${cfg.characters[i]}`)}</span>
                  </button>
                  <div className="seat-fields">
                    <span className="fi-el-tag" data-el={el}>
                      {t(`fireice.${el}`)}
                    </span>
                    {cfg.mode === 'local' ? (
                      <input className="text-input" value={cfg.names[i]} maxLength={12} placeholder={t('setup.namePh')} aria-label={t('setup.namePh')} onChange={(e) => setName(i, e.target.value)} />
                    ) : (
                      <small className="fi-el-sub">{t(`fireice.${el}Sub`)}</small>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="card">
          <h2 className="card-title">
            {t('fireice.pickLevel')}
            <small className="fi-total-stars">
              <Icon name="star" size={14} /> {totalStars}/{list.length * 3}
            </small>
          </h2>
          <div className="fi-levels" role="radiogroup" aria-label={t('fireice.pickLevel')}>
            {list.map((i) => {
              const def = levelDef(i);
              const best = progress[def.id];
              const open = unlocked(progress, i);
              return (
                <button key={def.id} type="button" role="radio" aria-checked={level === i} className="fi-level" disabled={!open} title={open ? undefined : t('fireice.locked')} onClick={() => setLevel(i)}>
                  <span className="fi-level-n">{levelNo(i)}</span>
                  <span className="fi-level-name">{t(`fireice.levels.${def.id}`)}</span>
                  <span className="fi-level-stars" aria-label={t('fireice.stars', { n: best?.stars ?? 0 })}>
                    {open ? [0, 1, 2].map((k) => <i key={k} data-on={(best?.stars ?? 0) > k || undefined} />) : <Icon name="lock" size={16} />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <section className="card">
          <h2 className="card-title">{t('fireice.howTitle')}</h2>
          <ol className="coda-how">
            {translateList(lang, 'fireice.how').map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </section>
      </div>
      <footer className="screen-foot">
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={start}>
          {t('fireice.start', { n: level + 1 })}
        </button>
      </footer>
    </div>
  );
}
