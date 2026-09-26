/**
 * 3D 캐릭터 무대 (React 쪽).
 * three.js 장면은 StageScene이 맡고, 여기서는 게임 상태를 장면에 전하고
 * 이름표·말풍선·타일 출발점(data-seat-origin) 같은 DOM 조각을 앵커 위치에 붙인다.
 */
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGame, type Reaction } from '../store/game';
import { useSettings, prefersReducedMotion } from '../store/settings';
import { translateList, useLang, useT } from '../i18n';
import { StageScene, type Anchor, type CastMember } from './scene';

/** 캐릭터가 한마디 하는 반응과 그 확률 */
const SAY: Partial<Record<Reaction['kind'], number>> = { combo: 1, meld: 1, win: 1, lose: 1, surprise: 0.35, draw: 0.2 };

export default function Stage3D({ onFail }: { onFail: () => void }) {
  const t = useT();
  const lang = useLang();
  const session = useGame((s) => s.session);
  const ai = useGame((s) => s.ai);
  const theme = useSettings((s) => s.theme);
  const contrast = useSettings((s) => s.highContrast);
  const motion = useSettings((s) => s.motion);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<StageScene | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const anchors = useRef<ReadonlyMap<number, Anchor>>(new Map());
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const langRef = useRef(lang);
  langRef.current = lang;
  const [lines, setLines] = useState<Readonly<Record<number, string>>>({});

  const g = session?.match.game;
  const n = g?.players.length ?? 0;
  const me = !session || !g ? 0 : session.mode === 'local' ? g.current : Math.max(0, session.match.seats.findIndex((p) => p.seat === 'human'));
  const castKey = session ? Array.from({ length: Math.max(0, n - 1) }, (_, k) => (me + 1 + k) % n).map((i) => `${i}:${session.seatsMeta[i]?.character ?? 'hwigi'}`).join('|') : '';
  const cast = useMemo<CastMember[]>(
    () =>
      castKey
        ? castKey.split('|').map((part) => {
            const [seat, character] = part.split(':');
            return { seat: Number(seat), character: character as CastMember['character'] };
          })
        : [],
    [castKey],
  );

  /** 앵커 위치로 DOM 조각 옮기기 (리렌더 없이) */
  const place = (): void => {
    const put = (key: string, x: number, y: number): void => {
      const el = els.current.get(key);
      if (!el) return;
      el.style.left = `${x.toFixed(1)}px`;
      el.style.top = `${y.toFixed(1)}px`;
    };
    anchors.current.forEach((a, seat) => {
      put(`tag:${seat}`, a.tagX, a.tagY);
      put(`bubble:${seat}`, a.bubbleX, a.bubbleY);
      const b = els.current.get(`bubble:${seat}`);
      if (b) b.dataset.flip = a.bubbleFlip ? '1' : '0';
      put(`origin:${seat}`, a.originX, a.originY);
    });
  };
  const ref = (key: string) => (el: HTMLElement | null) => {
    if (el) els.current.set(key, el);
    else els.current.delete(key);
  };

  // 장면 만들기 / 버리기
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    let scene: StageScene;
    try {
      scene = new StageScene(canvas, () => failRef.current());
    } catch {
      failRef.current();
      return;
    }
    sceneRef.current = scene;
    scene.reduced = prefersReducedMotion();
    scene.onAnchors = (a) => {
      anchors.current = a;
      place();
    };
    const measure = (): void => {
      const r = stage.getBoundingClientRect();
      let rail = r.height - 20;
      const felt = stage.parentElement?.querySelector('.felt');
      if (felt) {
        // 펠트 바깥 레일 두께 12px (table.css의 box-shadow)
        const top = felt.getBoundingClientRect().top - 12 - r.top;
        if (top > r.height * 0.45) rail = Math.min(r.height - 2, top);
      }
      scene.resize(r.width, r.height, rail);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    // 레슨 배너처럼 사이에 끼는 요소 때문에 레일 위치가 바뀔 수 있다
    const iv = window.setInterval(measure, 700);
    const vis = (): void => (document.hidden ? scene.stop() : scene.start());
    document.addEventListener('visibilitychange', vis);
    scene.start();
    return () => {
      document.removeEventListener('visibilitychange', vis);
      window.clearInterval(iv);
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // 배역
  useEffect(() => {
    sceneRef.current?.setCast(cast);
  }, [cast]);
  useLayoutEffect(place);

  // 차례·생각 중·움직이는 중
  const current = g && g.phase === 'playing' ? g.current : null;
  useEffect(() => {
    sceneRef.current?.setCurrent(current);
  }, [current, castKey]);
  const thinkingSeat = ai && ai.phase === 'thinking' ? ai.seat : null;
  const movingSeat = ai && ai.phase === 'moving' ? ai.seat : null;
  useEffect(() => {
    sceneRef.current?.setThinking(thinkingSeat);
    sceneRef.current?.setMoving(movingSeat);
  }, [thinkingSeat, movingSeat, castKey]);

  // 새 판이 시작되면 승패 표정 풀기
  const phase = g?.phase;
  useEffect(() => {
    if (phase === 'playing') sceneRef.current?.clearOver();
  }, [phase, session?.match.gameNo]);

  // 테마 강조색 (App이 <html> 속성을 바꾼 다음에 읽는다)
  useEffect(() => {
    const id = window.setTimeout(() => {
      const c = getComputedStyle(document.documentElement).getPropertyValue('--accent-2');
      sceneRef.current?.setAccent(c);
    }, 0);
    return () => window.clearTimeout(id);
  }, [theme, contrast]);
  useEffect(() => {
    if (sceneRef.current) sceneRef.current.reduced = prefersReducedMotion();
  }, [motion]);

  // 반응 구독
  useEffect(() => {
    let last = useGame.getState().reactions.at(-1)?.id ?? 0;
    const timers = new Map<number, number>();
    const unsub = useGame.subscribe((st, prev) => {
      if (st.reactions === prev.reactions) return;
      for (const r of st.reactions) {
        if (r.id <= last) continue;
        last = r.id;
        sceneRef.current?.react(r.seat, r.kind);
        const chance = SAY[r.kind];
        if (chance && Math.random() < chance) {
          const list = translateList(langRef.current, `stage.${r.kind}`);
          const text = list[Math.floor(Math.random() * list.length)];
          if (text) {
            setLines((l) => ({ ...l, [r.seat]: text }));
            window.clearTimeout(timers.get(r.seat));
            timers.set(
              r.seat,
              window.setTimeout(() => setLines((l) => {
                const next = { ...l };
                delete next[r.seat];
                return next;
              }), r.kind === 'win' || r.kind === 'lose' ? 2600 : 1500),
            );
          }
        }
      }
    });
    return () => {
      unsub();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  if (!session || !g) return null;
  return (
    <div className="stage stage-3d" ref={stageRef}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="stage-labels">
        {cast.map(({ seat }) => {
          const p = g.players[seat];
          const info = session.match.seats[seat];
          if (!p || !info) return null;
          const isCurrent = current === seat;
          const thinking = thinkingSeat === seat;
          const line = lines[seat];
          return (
            <Fragment key={seat}>
              <div
                className="stage-tag"
                ref={ref(`tag:${seat}`)}
                data-current={isCurrent || undefined}
                aria-label={`${info.name}, ${t('hud.tiles', { n: p.rack.length })}${p.melded ? `, ${t('hud.melded')}` : ''}`}
              >
                {p.melded && <i className="meld-dot" aria-hidden="true" />}
                <span className="tag-name">{info.name}</span>
                <span className="tag-count" aria-hidden="true">
                  {p.rack.length}
                </span>
              </div>
              <div className="bubble" ref={ref(`bubble:${seat}`)} hidden={!thinking && !line} aria-hidden="true">
                {thinking ? (
                  <span className="dots">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  line
                )}
              </div>
              <div className="seat-origin" ref={ref(`origin:${seat}`)} data-seat-origin={seat} />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
