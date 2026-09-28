/**
 * 불과 얼음 게임 화면 — 상단 바, 캔버스 무대, 상태 줄, 터치 조작, 넘어짐·통과·메뉴.
 * 물리는 저장소의 frame()이 돌리고, 여기서는 매 프레임 그 세계를 캔버스에 그린다.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useGame } from '../../store/game';
import { useT, useLang } from '../../i18n';
import { Icon } from '../../ui/components/Icon';
import { Sheet } from '../../ui/game/Overlays';
import { OnlineChip, OnlineNotice } from '../../ui/online/OnlineNotice';
import type { Element } from '../level';
import { burst, buildSprites, buildStatic, drawFrame, stepParticles, type Particle, type Sprites } from '../render';
import { levelCount, levelDef, myElement, pad, runtime, unlocked, useFireIce, type FireIceSession } from '../store';
import { FullscreenButton } from '../../ui/fullscreen';

const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS']);

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 캔버스 무대: 크기 맞추기 + 매 프레임 그리기 */
function Stage({ session }: { session: FireIceSession }) {
  const t = useT();
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [tile, setTile] = useState(0);
  const layers = useRef<{ key: string; staticLayer: HTMLCanvasElement | null; sprites: Sprites | null }>({ key: '', staticLayer: null, sprites: null });
  const particles = useRef<Particle[]>([]);
  const jellyHit = useRef(new Map<number, number>());
  const control = useFireIce((s) => s.control);
  const infoRef = useRef({ session, control, t });
  infoRef.current = { session, control, t };

  // 칸 크기: 가로 16칸 · 세로 20칸이 다 들어가게 (정수 픽셀이라 블록 사이 틈이 안 생김)
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = (): void => {
      const r = el.getBoundingClientRect();
      setTile(Math.max(8, Math.floor(Math.min(r.width / 16, r.height / 20))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 그리기 고리
  useEffect(() => {
    if (!tile) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      useFireIce.getState().frame(dt);
      const w = runtime.world;
      const c = canvas.current;
      const ctx = c?.getContext('2d');
      if (!w || !c || !ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const { session: s, control: ctl, t: tr } = infoRef.current;
      const key = `${s.id}|${s.level}|${tile}|${dpr}|${s.characters.join(',')}`;
      if (layers.current.key !== key) {
        c.width = Math.round(16 * tile * dpr);
        c.height = Math.round(20 * tile * dpr);
        layers.current = { key, staticLayer: buildStatic(w.level, tile, dpr), sprites: buildSprites({ fire: s.characters[0], ice: s.characters[1] }, tile, dpr) };
      }
      const { staticLayer, sprites } = layers.current;
      if (!staticLayer || !sprites) return;
      // 효과 대기열 → 반짝이
      for (const f of runtime.fx.splice(0)) {
        if (f.type === 'gem') burst(particles.current, f.x, f.y, f.el === 'fire' ? '#FF4D6D' : '#3D8BFF', 10, 2.6, 0.06);
        else if (f.type === 'jump' || f.type === 'land') burst(particles.current, f.x, f.y, 'rgba(160,110,60,0.55)', f.type === 'jump' ? 4 : 3, 1.2, 0.05);
        else if (f.type === 'dead') burst(particles.current, f.x, f.y - 0.4, f.el === 'fire' ? '#FFB199' : '#BDE8FF', 16, 3, 0.08);
        else if (f.type === 'bounce') {
          jellyHit.current.set(f.y * 16 + f.x, now);
          burst(particles.current, f.x + 0.5, f.y, 'rgba(255,140,190,0.8)', 6, 2, 0.06);
        } else burst(particles.current, f.x, f.y, f.type === 'key' ? '#FFC93C' : f.type === 'warp' ? '#B884FF' : '#C98B4F', 12, 2.4, 0.07);
      }
      stepParticles(particles.current, dt);
      const mine = myElement(s);
      const marker: Element | null = s.mode === 'solo' ? ctl : mine;
      const markerText = s.mode === 'online' ? tr('fireice.me') : '';
      drawFrame(ctx, w, { tile, dpr, now, staticLayer, sprites, particles: particles.current, marker, markerText, jellyHit: jellyHit.current, alpha: runtime.alpha, hint: useFireIce.getState().hint });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tile]);

  const def = levelDef(session.level);
  return (
    <div className="fi-stage" ref={wrap}>
      <canvas ref={canvas} className="fi-canvas" style={{ width: tile * 16, height: tile * 20 }} role="img" aria-label={t('fireice.stageLabel', { n: session.level + 1, name: t(`fireice.levels.${def.id}`) })} />
    </div>
  );
}

function PadButton({ el, k, label, icon, big }: { el: Element; k: 'left' | 'right' | 'jump'; label: string; icon: string; big?: boolean }) {
  const set = (on: boolean) => (e: ReactPointerEvent<HTMLButtonElement>): void => {
    if (on) {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* 이미 놓음 */
      }
    }
    pad.touch[el][k] = on;
  };
  return (
    <button
      type="button"
      className="fi-pad-btn"
      data-k={k}
      data-big={big || undefined}
      data-el={el}
      aria-label={label}
      onPointerDown={set(true)}
      onPointerUp={set(false)}
      onPointerCancel={set(false)}
      onLostPointerCapture={set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Icon name={icon} size={big ? 30 : 26} />
    </button>
  );
}

function Controls({ session }: { session: FireIceSession }) {
  const t = useT();
  const control = useFireIce((s) => s.control);
  useEffect(
    () => () => {
      // 화면을 떠나면 눌린 채로 남지 않게
      for (const el of ['fire', 'ice'] as const) pad.touch[el] = { left: false, right: false, jump: false };
    },
    [],
  );
  if (session.mode === 'local') {
    return (
      <nav className="fi-pad fi-pad-two" aria-label={t('fireice.controls')}>
        {(['fire', 'ice'] as const).map((el) => (
          <div key={el} className="fi-pad-group" data-el={el}>
            <span className="fi-pad-tag">{t(`fireice.${el}`)}</span>
            <PadButton el={el} k="left" label={t('fireice.left')} icon="left" />
            <PadButton el={el} k="right" label={t('fireice.right')} icon="right" />
            <PadButton el={el} k="jump" label={t('fireice.jump')} icon="up" big />
          </div>
        ))}
      </nav>
    );
  }
  return (
    <nav className="fi-pad" aria-label={t('fireice.controls')}>
      <div className="fi-pad-group">
        <PadButton el="fire" k="left" label={t('fireice.left')} icon="left" />
        <PadButton el="fire" k="right" label={t('fireice.right')} icon="right" />
      </div>
      {session.mode === 'solo' && (
        <button type="button" className="fi-swap" data-el={control} onClick={() => useFireIce.getState().swap()} aria-label={t('fireice.swap')}>
          <Icon name="swap" size={22} />
          <span>{t(`fireice.${control === 'fire' ? 'ice' : 'fire'}`)}</span>
        </button>
      )}
      <div className="fi-pad-group">
        <PadButton el="fire" k="jump" label={t('fireice.jump')} icon="up" big />
      </div>
    </nav>
  );
}

function Status({ session }: { session: FireIceSession }) {
  const t = useT();
  const control = useFireIce((s) => s.control);
  const atDoor = useFireIce((s) => s.atDoor);
  const waiting = useFireIce((s) => s.waiting);
  const time = useFireIce((s) => s.time);
  const [fine] = useState(() => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches);
  const [friend, setFriend] = useState(true);
  useEffect(() => {
    if (!session.online) return;
    const id = window.setInterval(() => setFriend(!!runtime.puppet), 700);
    return () => window.clearInterval(id);
  }, [session.online]);
  let text: string;
  const hint = useFireIce((s) => s.hint);
  const tipKey = `fireice.tips.${levelDef(session.level).id}`;
  const tip = t(tipKey);
  if (hint) text = t(`fireice.hint.${hint.kind}`, { el: t(`fireice.${hint.el}`), dir: t(hint.on ? 'fireice.hint.right' : 'fireice.hint.left') });
  else if (waiting) text = t('online.sending');
  else if (time < 6 && tip !== tipKey && session.status === 'playing') text = tip;
  else if (session.online && !friend) text = t('fireice.waitFriend');
  else if (atDoor.fire !== atDoor.ice) text = t('fireice.waitDoor', { el: t(`fireice.${atDoor.fire ? 'fire' : 'ice'}`) });
  else if (session.mode === 'solo') text = t(fine ? 'fireice.keysSolo' : 'fireice.nowSolo', { el: t(`fireice.${control}`) });
  else if (session.mode === 'local') text = t(fine ? 'fireice.keysLocal' : 'fireice.touchLocal');
  else text = t('fireice.youAre', { el: t(`fireice.${myElement(session) ?? 'fire'}`) });
  return (
    <p className="status fi-status" aria-live="polite">
      <span className="status-text">{text}</span>
    </p>
  );
}

/** 풀이기가 보기에 막혔을 때: 다시 하기 / 계속 */
function Stuck({ session }: { session: FireIceSession }) {
  const t = useT();
  const stuck = useFireIce((s) => s.stuck);
  const oops = useFireIce((s) => s.oops);
  if (!stuck || oops || session.status !== 'playing') return null;
  const st = useFireIce.getState();
  return (
    <div className="fi-stuck" role="alert">
      <b>{t('fireice.stuckTitle')}</b>
      <span>{t('fireice.stuckText')}</span>
      <div className="fi-stuck-btns">
        <button type="button" className="btn btn-primary" onClick={() => st.restart()}>
          {t('fireice.stuckRetry')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => st.dismissStuck()}>
          {t('fireice.stuckKeep')}
        </button>
      </div>
    </div>
  );
}

function Oops({ session }: { session: FireIceSession }) {
  const t = useT();
  const oops = useFireIce((s) => s.oops);
  if (!oops || session.status !== 'playing') return null;
  return (
    <div className="fi-oops" role="alert" data-el={oops.el}>
      <b>{t('fireice.oopsTitle')}</b>
      <span>{t(`fireice.oops.${oops.cause}`, { el: t(`fireice.${oops.el}`) })}</span>
    </div>
  );
}

function LevelGrid({ session, onPick }: { session: FireIceSession; onPick: (i: number) => void }) {
  const t = useT();
  const progress = useFireIce((s) => s.progress);
  return (
    <div className="fi-levels">
      {Array.from({ length: levelCount }, (_, i) => {
        const def = levelDef(i);
        const best = progress[def.id];
        const open = session.mode === 'online' || unlocked(progress, i);
        return (
          <button key={def.id} type="button" className="fi-level" disabled={!open} data-current={i === session.level || undefined} onClick={() => onPick(i)}>
            <span className="fi-level-n">{i + 1}</span>
            <span className="fi-level-name">{t(`fireice.levels.${def.id}`)}</span>
            <span className="fi-level-stars" aria-label={t('fireice.stars', { n: best?.stars ?? 0 })}>
              {open ? [0, 1, 2].map((k) => <i key={k} data-on={(best?.stars ?? 0) > k || undefined} />) : <Icon name="lock" size={16} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Menu({ session }: { session: FireIceSession }) {
  const t = useT();
  const overlay = useFireIce((s) => s.overlay);
  const [view, setView] = useState<null | 'levels' | 'quit'>(null);
  if (overlay !== 'menu') return null;
  const store = useFireIce.getState();
  const go = useGame.getState().go;
  const close = (): void => {
    setView(null);
    store.closeOverlay();
  };
  return (
    <Sheet label={t('menu.title')} onClose={close}>
      <h2 className="sheet-title">{view === 'levels' ? t('fireice.pickLevel') : t('menu.title')}</h2>
      {view === null && (
        <div className="sheet-list">
          <button type="button" className="btn btn-primary" autoFocus onClick={close}>
            {t('menu.resume')}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setView(null);
              store.restart();
            }}
          >
            {t('fireice.restart')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setView('levels')}>
            {t('fireice.pickLevel')}
          </button>
          <FullscreenButton />
          <button type="button" className="btn btn-secondary" onClick={() => go('settings')}>
            {t('menu.settings')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => (session.online ? setView('quit') : store.quit())}>
            {t('menu.quit')}
          </button>
        </div>
      )}
      {view === 'levels' && (
        <>
          <LevelGrid
            session={session}
            onPick={(i) => {
              setView(null);
              store.playLevel(i);
            }}
          />
          <div className="sheet-list">
            <button type="button" className="btn btn-ghost" onClick={() => setView(null)}>
              {t('action.cancel')}
            </button>
          </div>
        </>
      )}
      {view === 'quit' && (
        <div className="sheet-list">
          <p className="sheet-text">{t('online.confirmLeave')}</p>
          <button type="button" className="btn btn-danger" onClick={() => store.quit()}>
            {t('action.quit')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setView(null)}>
            {t('action.cancel')}
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Clear({ session }: { session: FireIceSession }) {
  const t = useT();
  const overlay = useFireIce((s) => s.overlay);
  const [pick, setPick] = useState(false);
  if (overlay !== 'clear' || session.status !== 'cleared') return null;
  const r = session.result;
  const store = useFireIce.getState();
  const def = levelDef(session.level);
  const last = session.level + 1 >= levelCount;
  const stars = r?.stars ?? 1;
  return (
    <div className="result-wrap" role="dialog" aria-modal="true" aria-label={t('fireice.clear')}>
      <div className="result fi-result">
        <p className="result-kicker">{t('fireice.levelTitle', { n: session.level + 1, name: t(`fireice.levels.${def.id}`) })}</p>
        <h2 className="result-title">{last ? t('fireice.clearAll') : t('fireice.clear')}</h2>
        <div className="fi-stars" aria-label={t('fireice.stars', { n: stars })}>
          {[0, 1, 2].map((k) => (
            <span key={k} className="fi-star" data-on={stars > k || undefined} style={{ animationDelay: `${200 + k * 180}ms` }}>
              <Icon name="star" size={40} />
            </span>
          ))}
        </div>
        {r && (
          <ul className="fi-result-list">
            <li data-ok={r.gems >= r.total || undefined}>
              <span>{t('fireice.starGems')}</span>
              <b>
                {r.gems}/{r.total}
              </b>
            </li>
            <li data-ok={r.time <= def.par || undefined}>
              <span>{t('fireice.starTime', { s: def.par })}</span>
              <b>{fmtTime(r.time)}</b>
            </li>
          </ul>
        )}
        {r?.best && <p className="fi-best">{t('fireice.best')}</p>}
        {pick ? (
          <LevelGrid
            session={session}
            onPick={(i) => {
              setPick(false);
              store.playLevel(i);
            }}
          />
        ) : (
          <div className="result-actions">
            {!last && (
              <button type="button" className="btn btn-primary btn-lg btn-block" autoFocus onClick={() => store.next()}>
                {t('fireice.next')}
              </button>
            )}
            <button type="button" className={`btn ${last ? 'btn-primary btn-lg' : 'btn-secondary'} btn-block`} onClick={() => store.restart()}>
              {t('fireice.restart')}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setPick(true)}>
              {t('fireice.pickLevel')}
            </button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => store.quit()}>
              {session.online ? t('online.leave') : t('fireice.toSetup')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function FireIceScreen() {
  const t = useT();
  const lang = useLang();
  const session = useFireIce((s) => s.session);
  const gems = useFireIce((s) => s.gems);
  const time = useFireIce((s) => s.time);

  // 키보드: 방향키·WASD·스페이스, ↓/S 바꾸기(혼자), Esc 메뉴, R 다시
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const st = useFireIce.getState();
      if (GAME_KEYS.has(e.code) && st.overlay === null) e.preventDefault();
      pad.keys.add(e.code);
      if (e.repeat) return;
      if ((e.code === 'ArrowDown' || e.code === 'KeyS') && st.session?.mode === 'solo' && st.overlay === null) st.swap();
      else if (e.code === 'Escape') {
        if (st.overlay === 'menu') st.closeOverlay();
        else if (st.overlay === null) st.openMenu();
      } else if (e.code === 'KeyR' && st.overlay === null && !st.oops) st.restart();
      else if (e.code === 'KeyH' && st.overlay === null) st.askHint();
    };
    const up = (e: KeyboardEvent): void => {
      pad.keys.delete(e.code);
    };
    const clear = (): void => pad.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      pad.keys.clear();
    };
  }, []);

  if (!session) return null;
  const def = levelDef(session.level);
  const total = runtime.world?.gems.length ?? 0;
  return (
    <div className="game fireice" data-mode={session.mode} lang={lang}>
      <header className="hud">
        <button type="button" className="icon-btn" aria-label={t('hud.menu')} onClick={() => useFireIce.getState().openMenu()}>
          <Icon name="menu" />
        </button>
        <div className="hud-turn">
          <span className="fi-level-badge">{session.level + 1}</span>
          <span className="hud-turn-text">{t(`fireice.levels.${def.id}`)}</span>
        </div>
        <div className="hud-right">
          <OnlineChip />
          <button type="button" className="icon-btn fi-hint-btn" aria-label={t('fireice.hintBtn')} title="H" aria-keyshortcuts="H" onClick={() => useFireIce.getState().askHint()}>
            <Icon name="hint" />
          </button>
          <span className="hud-chip fi-gem-chip" aria-label={t('fireice.gems', { n: gems, total })}>
            <i className="fi-candy" data-el="fire" aria-hidden="true" />
            {gems}/{total}
          </span>
          <span className="hud-chip fi-time" data-over={time > def.par || undefined}>
            {fmtTime(time)}
          </span>
        </div>
      </header>
      <Stage session={session} />
      <Status session={session} />
      <Controls session={session} />
      <Oops session={session} />
      <Stuck session={session} />
      <OnlineNotice />
      <Menu session={session} />
      <Clear session={session} />
    </div>
  );
}
