/**
 * 바다거북 스프 준비 — 진행자(AI / 사람), 함께 할 사람들, 문제 고르기(순한맛·매운맛, 난이도).
 */
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../../store/game';
import { ALL_CHARACTERS, type CharacterId } from '../../characters/roster';
import { usePortrait } from '../../characters/portrait3d';
import { Icon } from '../../ui/components/Icon';
import { translateList, useLang, useT } from '../../i18n';
import { useOnline } from '../../net/online';
import { useAi } from '../../ai/store';
import { claudeUsed, dailyMax } from '../../ai/budget';
import { candidates, type SoupFilter } from '../engine';
import { loadDone, loadSoupSetup, puzzleCount, resetDone, savedSoup, useSoup, type SoupSetupConfig } from '../store';

function defaults(ko: boolean): SoupSetupConfig {
  return {
    host: 'ai',
    hostSeat: 0,
    players: [
      { name: ko ? '나' : 'Me', character: 'moka' },
      { name: ko ? '여자친구' : 'Player 2', character: 'ginini' },
      { name: ko ? '동생' : 'Player 3', character: 'pponi' },
    ],
    filter: { spice: 'mild', level: 0 },
  };
}

function Avatar({ id }: { id: CharacterId }) {
  const src = usePortrait(id, 'idle', 128);
  return <img src={src} alt="" width={44} height={44} />;
}

const LEVELS: SoupFilter['level'][] = [0, 1, 2, 3];

export function SoupSetup() {
  const t = useT();
  const lang = useLang();
  const go = useGame.getState().go;
  const saved = useMemo(() => savedSoup(), []);
  const [cfg, setCfg] = useState<SoupSetupConfig>(() => loadSoupSetup() ?? defaults(lang === 'ko'));
  const claudeOk = useAi((s) => s.claudeOk);
  // 스프 전용 하루 한도 (화면을 열 때 한 번 읽음)
  const [used] = useState(() => claudeUsed('soup'));
  const max = dailyMax('soup');
  useEffect(() => useAi.getState().probe(), []);
  const locked = used >= max;
  const aiOk = claudeOk && !locked;
  const n = cfg.players.length;
  const count = puzzleCount(cfg.filter);
  const human = cfg.host === 'human';
  const canStart = count > 0 && (human ? n >= 2 : aiOk);
  const [done, setDone] = useState(() => loadDone());
  const [showList, setShowList] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const list = useMemo(() => [...candidates(cfg.filter)].sort((a, b) => a.level - b.level), [cfg.filter]);
  const doneHere = list.filter((p) => done[p.id]).length;
  const pickedPuzzle = list.find((p) => p.id === picked) ?? null;

  const patch = (i: number, p: Partial<SoupSetupConfig['players'][number]>): void => setCfg((c) => ({ ...c, players: c.players.map((x, k) => (k === i ? { ...x, ...p } : x)) }));
  const cycle = (i: number): void => {
    const used = new Set(cfg.players.filter((_, k) => k !== i).map((x) => x.character));
    const cur = cfg.players[i]?.character ?? 'hwigi';
    let k = ALL_CHARACTERS.indexOf(cur);
    for (let step = 0; step < ALL_CHARACTERS.length; step++) {
      k = (k + 1) % ALL_CHARACTERS.length;
      const next = ALL_CHARACTERS[k] as CharacterId;
      if (!used.has(next)) {
        patch(i, { character: next });
        return;
      }
    }
  };
  const add = (): void => {
    if (n >= 8) return;
    const usedChars = new Set(cfg.players.map((x) => x.character));
    const character = ALL_CHARACTERS.find((c) => !usedChars.has(c)) ?? 'hwigi';
    setCfg((c) => ({ ...c, players: [...c.players, { name: `${t('soup.player')} ${n + 1}`, character }] }));
  };
  const remove = (i: number): void => {
    if (n <= 1) return;
    setCfg((c) => ({ ...c, players: c.players.filter((_, k) => k !== i), hostSeat: c.hostSeat === i ? 0 : c.hostSeat > i ? c.hostSeat - 1 : c.hostSeat }));
  };

  return (
    <div className="screen setup soup-setup">
      <header className="screen-head">
        <button type="button" className="icon-btn" aria-label={t('setup.back')} onClick={() => go('home')}>
          <Icon name="back" />
        </button>
        <h1>{t('soup.title')}</h1>
      </header>
      <div className="screen-body">
        <p className="fi-mode-sub">{t('soup.intro')}</p>
        {saved && (
          <button type="button" className="plate-btn plate-primary" onClick={() => useSoup.getState().resume()}>
            <span className="plate-label">{t('soup.resume')}</span>
            <span className="plate-sub">{t('soup.resumeInfo', { round: saved.round, n: saved.players })}</span>
          </button>
        )}
        <section className="card">
          <h2 className="card-title">{t('soup.hostTitle')}</h2>
          <div className="seg" role="radiogroup" aria-label={t('soup.hostTitle')}>
            <button type="button" role="radio" aria-checked={!human} onClick={() => setCfg((c) => ({ ...c, host: 'ai' }))}>
              {t('soup.hostAi')}
            </button>
            <button type="button" role="radio" aria-checked={human} disabled={n < 2} onClick={() => setCfg((c) => ({ ...c, host: 'human' }))}>
              {t('soup.hostHuman')}
            </button>
          </div>
          <p className="ai-sub">{t(human ? 'soup.hostHumanSub' : 'soup.hostAiSub')}</p>
          {!human && claudeOk && (
            <p className="ai-sub ai-usage" data-locked={locked || undefined}>
              {locked ? t('soup.claudeLocked') : t('soup.claudeReady', { used: Math.round((used / max) * 100), left: Math.max(0, Math.floor((max - used) / 900)) })}
            </p>
          )}
          {!human && !aiOk && <p className="ai-sub soup-warn">{t('soup.noAi')}</p>}
        </section>
        <section className="card">
          <h2 className="card-title">{t('soup.players')}</h2>
          <ol className="soup-players">
            {cfg.players.map((p, i) => (
              <li key={i} className="soup-player">
                <button type="button" className="seat-avatar" onClick={() => cycle(i)} aria-label={`${t('character.pick')}: ${t(`character.${p.character}`)}`}>
                  <Avatar id={p.character} />
                </button>
                <input className="text-input" value={p.name} maxLength={12} aria-label={t('soup.playerName', { n: i + 1 })} onChange={(e) => patch(i, { name: e.target.value })} />
                {human && (
                  <button type="button" className="soup-host-pick" aria-pressed={cfg.hostSeat === i} onClick={() => setCfg((c) => ({ ...c, hostSeat: i }))}>
                    {t('soup.hostBadge')}
                  </button>
                )}
                {n > 1 && (
                  <button type="button" className="icon-btn small" aria-label={t('soup.remove')} onClick={() => remove(i)}>
                    <Icon name="close" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ol>
          {n < 8 && (
            <button type="button" className="btn btn-ghost add-seat" onClick={add}>
              <Icon name="plus" size={18} /> {t('setup.addSeat')}
            </button>
          )}
          <p className="ai-sub">{t(human ? 'soup.playersHumanSub' : n === 1 ? 'soup.playersSoloSub' : 'soup.playersSub')}</p>
        </section>
        <section className="card">
          <h2 className="card-title">{t('soup.puzzles')}</h2>
          <label className="toggle-row">
            <span>
              {t('soup.spicy')}
              <small className="toggle-sub">{t('soup.spicySub')}</small>
            </span>
            <input type="checkbox" className="switch" checked={cfg.filter.spice === 'all'} onChange={(e) => setCfg((c) => ({ ...c, filter: { ...c.filter, spice: e.target.checked ? 'all' : 'mild' } }))} />
          </label>
          <div className="seg" role="radiogroup" aria-label={t('soup.level')}>
            {LEVELS.map((l) => (
              <button key={l} type="button" role="radio" aria-checked={cfg.filter.level === l} onClick={() => setCfg((c) => ({ ...c, filter: { ...c.filter, level: l } }))}>
                {t(`soup.levels.${l}`)}
              </button>
            ))}
          </div>
          <p className="ai-sub">{t('soup.count', { n: count })}</p>
          <p className="ai-sub soup-done">{t('soup.doneCount', { n: doneHere, total: list.length })}</p>
          <p className="ai-sub soup-picked">{pickedPuzzle ? t('soup.pickedInfo', { title: pickedPuzzle.title }) : t('soup.random')}</p>
          <div className="soup-list-tools">
            <button type="button" className="btn btn-ghost btn-sm soup-list-toggle" aria-expanded={showList} onClick={() => setShowList((v) => !v)}>
              {t(showList ? 'soup.listHide' : 'soup.listShow')}
            </button>
            {doneHere > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  resetDone();
                  setDone({});
                }}
              >
                {t('soup.resetDone')}
              </button>
            )}
          </div>
          {showList && (
            <ul className="soup-list">
              {list.map((p) => (
                <li key={p.id}>
                  <button type="button" className="soup-list-item" aria-pressed={picked === p.id} onClick={() => setPicked((x) => (x === p.id ? null : p.id))}>
                    <span className="soup-list-title">{p.title}</span>
                    <span className="soup-badge" data-level={p.level}>
                      {t(`soup.levels.${p.level}`)}
                    </span>
                    {p.spice === 'dark' && (
                      <span className="soup-badge" data-spice="dark">
                        {t('soup.dark')}
                      </span>
                    )}
                    {done[p.id] && <span className="soup-mark" data-mark={done[p.id]}>{t(done[p.id] === 'solved' ? 'soup.markSolved' : 'soup.markRevealed')}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="card-title">{t('soup.howTitle')}</h2>
          <ol className="coda-how">
            {translateList(lang, 'soup.how').map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </section>
      </div>
      <footer className="screen-foot">
        <button type="button" className="btn btn-primary btn-lg btn-block soup-start" disabled={!canStart} onClick={() => useSoup.getState().start(cfg, pickedPuzzle?.id)}>
          {t('soup.start')}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => {
            useOnline.getState().setGame('soup');
            go('online');
          }}
        >
          {t('soup.online')}
        </button>
      </footer>
    </div>
  );
}
