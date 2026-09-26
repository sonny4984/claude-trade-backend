import { useMemo } from 'react';
import { useGame } from '../../store/game';
import { useStats, summarize } from '../../store/stats';
import { Icon } from '../components/Icon';
import { useT } from '../../i18n';
import { summarizeCoda, useCodaStats } from '../../coda/stats';

function dur(ms: number, t: ReturnType<typeof useT>): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}${t('misc.min')} ${s % 60}${t('misc.sec')}` : `${s}${t('misc.sec')}`;
}

export function StatsScreen() {
  const t = useT();
  const records = useStats((s) => s.records);
  const sum = useMemo(() => summarize(records), [records]);
  const store = useGame.getState();
  const recent = records.slice(-12).reverse();
  const codaRecords = useCodaStats((s) => s.records);
  const coda = useMemo(() => summarizeCoda(codaRecords), [codaRecords]);
  return (
    <div className="screen stats">
      <header className="screen-head">
        <button type="button" className="icon-btn" aria-label={t('setup.back')} onClick={() => store.go('home')}>
          <Icon name="back" />
        </button>
        <h1>{t('stats.title')}</h1>
      </header>
      <div className="screen-body">
        {!records.length && !codaRecords.length && <p className="note center">{t('stats.empty')}</p>}
        {records.length > 0 && (
          <>
            <section className="stat-grid">
              <div className="stat">
                <span>{t('stats.played')}</span>
                <b>{sum.played}</b>
              </div>
              <div className="stat">
                <span>{t('stats.winRate')}</span>
                <b>{Math.round(sum.winRate * 100)}%</b>
              </div>
              <div className="stat">
                <span>{t('stats.wins')}</span>
                <b>{sum.wins}</b>
              </div>
              <div className="stat">
                <span>{t('stats.avgDuration')}</span>
                <b>{dur(sum.avgDurationMs, t)}</b>
              </div>
              <div className="stat">
                <span>{t('stats.fastestWin')}</span>
                <b>{sum.fastestWinMs ? dur(sum.fastestWinMs, t) : t('stats.none')}</b>
              </div>
              <div className="stat">
                <span>{t('stats.largestMove')}</span>
                <b>{sum.largestMove}</b>
              </div>
              <div className="stat">
                <span>{t('stats.highestScore')}</span>
                <b>{sum.highestScore}</b>
              </div>
              <div className="stat">
                <span>{t('stats.longestRun')}</span>
                <b>{sum.longestRun}</b>
              </div>
              <div className="stat">
                <span>{t('stats.jokers')}</span>
                <b>{sum.jokers}</b>
              </div>
              <div className="stat">
                <span>{t('stats.favoriteTheme')}</span>
                <b className="small">{sum.favoriteTheme ? t(`theme.${sum.favoriteTheme}`) : t('stats.none')}</b>
              </div>
            </section>
            {sum.people.length > 0 && (
              <section className="card">
                <h2 className="card-title">{t('stats.people')}</h2>
                <ol className="people">
                  {sum.people.map((p) => (
                    <li key={p.name}>
                      <b>{p.name}</b>
                      <span>
                        {p.wins} / {p.games}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <section className="card">
              <h2 className="card-title">{t('stats.recent')}</h2>
              <ol className="recent">
                {recent.map((r) => (
                  <li key={r.at} data-won={r.winners.includes(r.me) || undefined}>
                    <span className="recent-date">{new Date(r.at).toLocaleDateString()}</span>
                    <span className="recent-names">{r.names.join(' · ')}</span>
                    <b className="recent-score">
                      {(r.deltas[r.me] ?? 0) > 0 ? '+' : ''}
                      {r.deltas[r.me] ?? 0}
                    </b>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
        {codaRecords.length > 0 && (
          <section className="card">
            <h2 className="card-title">{t('coda.statsTitle')}</h2>
            <div className="stat-grid">
              <div className="stat">
                <span>{t('stats.played')}</span>
                <b>{coda.played}</b>
              </div>
              <div className="stat">
                <span>{t('stats.winRate')}</span>
                <b>{Math.round(coda.winRate * 100)}%</b>
              </div>
              <div className="stat">
                <span>{t('coda.accuracy')}</span>
                <b>{Math.round(coda.accuracy * 100)}%</b>
              </div>
              <div className="stat">
                <span>{t('coda.bestStreak')}</span>
                <b>{coda.bestStreak}</b>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
