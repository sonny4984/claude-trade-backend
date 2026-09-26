/**
 * 3D 캐릭터 무대 (React 쪽) — 게임 종류와 무관하다.
 * three.js 장면은 StageScene이 맡고, 여기서는 받은 상태(이름판·차례·반응)를 장면에 전하고
 * 이름판·말풍선·타일 출발점(data-seat-origin) 같은 DOM 조각을 앵커 위치에 붙인다.
 * LUMINA(ui/game/Stage.tsx)와 다빈치 코드(coda/ui/CodaStage.tsx)가 각자 어댑터로 연결한다.
 */
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CharacterId } from '../characters/roster';
import type { ReactionKind } from '../store/game';
import { useSettings, prefersReducedMotion } from '../store/settings';
import { translateList, useLang } from '../i18n';
import { StageScene, type Anchor, type CastMember } from './scene';

export interface StagePlate {
  readonly seat: number;
  readonly character: CharacterId;
  readonly name: string;
  /** 이름판 오른쪽 숫자 (LUMINA: 남은 타일, 다빈치 코드: 숨은 타일) */
  readonly count: number;
  /** 이름판 왼쪽 점 (LUMINA: 등록함) */
  readonly dot?: boolean;
  /** 탈락해서 흐리게 */
  readonly out?: boolean;
  readonly aria: string;
}

export interface StageReaction {
  readonly id: number;
  readonly seat: number;
  readonly kind: ReactionKind;
  /** 말풍선에 띄울 말 (없으면 반응에 맞는 말을 가끔 고른다) */
  readonly say?: string;
  readonly sayMs?: number;
}

export interface StageViewProps {
  /** 무대에 앉을 사람들 (왼쪽부터) */
  readonly plates: readonly StagePlate[];
  readonly current: number | null;
  readonly thinking: number | null;
  readonly moving: number | null;
  /** 새 판이 시작되면 바뀌는 값 — 승패 표정을 푼다 */
  readonly roundKey: string;
  readonly subscribe: (fn: (r: StageReaction) => void) => () => void;
  readonly onFail: () => void;
}

/** 캐릭터가 저절로 한마디 하는 반응과 그 확률 */
const SAY: Partial<Record<ReactionKind, number>> = { combo: 1, meld: 1, win: 1, lose: 1, surprise: 0.35, draw: 0.2 };

export default function Stage3D({ plates, current, thinking, moving, roundKey, subscribe, onFail }: StageViewProps) {
  const lang = useLang();
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
  const subRef = useRef(subscribe);
  subRef.current = subscribe;
  const [lines, setLines] = useState<Readonly<Record<number, string>>>({});

  const castKey = plates.map((p) => `${p.seat}:${p.character}`).join('|');
  const cast = useMemo<CastMember[]>(
    () =>
      castKey
        ? castKey.split('|').map((part) => {
            const [seat, character] = part.split(':');
            return { seat: Number(seat), character: character as CharacterId };
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
  useEffect(() => {
    sceneRef.current?.setCurrent(current);
  }, [current, castKey]);
  useEffect(() => {
    sceneRef.current?.setThinking(thinking);
    sceneRef.current?.setMoving(moving);
  }, [thinking, moving, castKey]);

  // 새 판이 시작되면 승패 표정 풀기
  useEffect(() => {
    sceneRef.current?.clearOver();
  }, [roundKey]);

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
    const timers = new Map<number, number>();
    const say = (seat: number, text: string, ms: number): void => {
      setLines((l) => ({ ...l, [seat]: text }));
      window.clearTimeout(timers.get(seat));
      timers.set(
        seat,
        window.setTimeout(
          () =>
            setLines((l) => {
              const next = { ...l };
              delete next[seat];
              return next;
            }),
          ms,
        ),
      );
    };
    const unsub = subRef.current((r) => {
      sceneRef.current?.react(r.seat, r.kind);
      if (r.say) {
        say(r.seat, r.say, r.sayMs ?? 1500);
        return;
      }
      const chance = SAY[r.kind];
      if (chance && Math.random() < chance) {
        const list = translateList(langRef.current, `stage.${r.kind}`);
        const text = list[Math.floor(Math.random() * list.length)];
        if (text) say(r.seat, text, r.kind === 'win' || r.kind === 'lose' ? 2600 : 1500);
      }
    });
    return () => {
      unsub();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return (
    <div className="stage stage-3d" ref={stageRef}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="stage-labels">
        {plates.map((p) => {
          const line = lines[p.seat];
          const isThinking = thinking === p.seat;
          return (
            <Fragment key={p.seat}>
              <div className="stage-tag" ref={ref(`tag:${p.seat}`)} data-current={current === p.seat || undefined} data-out={p.out || undefined} aria-label={p.aria}>
                {p.dot && <i className="meld-dot" aria-hidden="true" />}
                <span className="tag-name">{p.name}</span>
                <span className="tag-count" aria-hidden="true">
                  {p.count}
                </span>
              </div>
              <div className="bubble" ref={ref(`bubble:${p.seat}`)} hidden={!line && !isThinking} aria-hidden="true">
                {line ?? (
                  <span className="dots">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </div>
              <div className="seat-origin" ref={ref(`origin:${p.seat}`)} data-seat-origin={p.seat} />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
