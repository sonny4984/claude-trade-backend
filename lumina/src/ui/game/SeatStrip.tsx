import { useGame, mySeatOf, currentSeatIsHuman, type Session } from '../../store/game';
import type { Expression } from '../../characters/draw2d';
import { CHARACTERS, type CharacterId } from '../../characters/roster';
import { usePortrait } from '../../characters/portrait3d';
import { useT } from '../../i18n';
import { TimerRing } from './Hud';

function SeatPortrait({ id, ex }: { id: CharacterId; ex: Expression }) {
  const src = usePortrait(id, ex, 128);
  return <img className="portrait" src={src} width={48} height={48} alt="" />;
}

/** 2D 자리 표시 — WebGL을 쓸 수 없거나 3D를 끈 경우 */
export function SeatStrip({ session }: { session: Session }) {
  const t = useT();
  const ai = useGame((s) => s.ai);
  const reactions = useGame((s) => s.reactions);
  const g = session.match.game;
  const n = g.players.length;
  const me = session.mode === 'local' ? g.current : mySeatOf(session);
  const order = Array.from({ length: n - 1 }, (_, k) => (me + 1 + k) % n);
  const exprOf = (seat: number): Expression => {
    const last = [...reactions].reverse().find((r) => r.seat === seat);
    if (ai?.seat === seat) return 'think';
    if (!last) return 'idle';
    return last.kind === 'win' ? 'win' : last.kind === 'lose' ? 'lose' : last.kind === 'combo' || last.kind === 'meld' ? 'happy' : last.kind === 'surprise' ? 'surprised' : 'idle';
  };
  return (
    <div className="seat-strip">
      {order.map((i) => {
        const p = g.players[i];
        const meta = session.seatsMeta[i];
        if (!p || !meta) return null;
        const current = g.current === i && g.phase === 'playing';
        return (
          <div key={i} className="seat" data-current={current || undefined} data-seat-origin={i}>
            <SeatPortrait id={meta.character} ex={exprOf(i)} />
            <div className="seat-info">
              <b className="seat-name">
                <i className="seat-dot" style={{ background: CHARACTERS[meta.character].accent }} aria-hidden="true" />
                {session.match.seats[i]?.name}
              </b>
              <span className="seat-meta">
                {t('hud.tiles', { n: p.rack.length })}
                {p.melded ? ` · ${t('hud.melded')}` : ''}
              </span>
            </div>
            {current && (ai?.seat === i || (session.online && !currentSeatIsHuman(session))) && <span className="thinking" aria-label={t('ai.thinking')}><i /><i /><i /></span>}
            {current && session.match.seats[i]?.seat === 'human' && <TimerRing size={24} />}
          </div>
        );
      })}
    </div>
  );
}
