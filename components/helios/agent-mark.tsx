'use client';

/**
 * Helios's orb: a <canvas> that draws a sphere of cells riding tilted rings.
 * Ported from Teambridge's Ultron AgentMark (src/components/Ultron/AgentMark.tsx);
 * the drawing math is unchanged in ./agent-mark-draw.ts.
 */
import { memo, useEffect, useRef } from 'react';
import {
  clamp,
  cssToRGB,
  DRAW,
  hexRGB,
  INTRO_END,
  INTRO_ORBIT_FROM,
  INTRO_ORBIT_RAMP,
  pal,
} from './agent-mark-draw';
import type { AgentMarkKind, AgentMarkTone, Ctx } from './agent-mark-draw';

interface AgentMarkProps {
  mark?: AgentMarkKind;
  /** Rendered px (square). CSS may scale it down on small screens. */
  size?: number;
  tone?: Exclude<AgentMarkTone, 'auto'>;
  /** Animation speed multiplier (0.05–3). */
  motionSpeed?: number;
  /** Any CSS color, including `var(--token)`, to tint the cells and core. */
  color?: string;
  /** False leaves only the orbiting cells and links, for a backdrop texture. */
  core?: boolean;
  /** Circle only: hairline strokes and fine cells at any size. */
  texture?: boolean;
  /** Play the landing intro once per mount: the core rises in, the cells flicker on, the orbit spins up. */
  intro?: boolean;
  className?: string;
}

const ACCENT = '#96B9FF';

function AgentMark({
  mark = 'circle',
  size = 200,
  tone = 'dark',
  motionSpeed = 1,
  color,
  core = true,
  texture = false,
  intro = false,
  className,
}: AgentMarkProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  // Survives effect re-runs, so the intro plays once per mount.
  const introRef = useRef<{ start: number; T: number; last: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(2, Math.round(size * dpr));
    el.width = W;
    el.height = W;
    const e: Ctx = { ctx, w: W, h: W, dpr, size, state: 'active', coreHalo: true, core, texture, intro: null, alert: 0 };
    const P = pal(tone, hexRGB(ACCENT));
    if (color) {
      const rgb = cssToRGB(ctx, el, color);
      P.dot = rgb;
      P.core = rgb;
    }
    const draw = DRAW[mark] ?? DRAW.circle;
    const paint = (T: number) => {
      ctx.clearRect(0, 0, W, W);
      draw(e, T, P);
    };

    const reduced = (() => {
      try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch {
        return false;
      }
    })();
    const sp = clamp(motionSpeed, 0.05, 3);

    // During the intro, time only advances as fast as the orbit has spun up.
    if (intro && !reduced && !introRef.current) introRef.current = { start: performance.now(), T: 1.15, last: -1 };
    const clock = (now: number): number => {
      const run = introRef.current;
      if (!run) return (now / 1000) * sp;
      const age = (now - run.start) / 1000;
      const dt = run.last < 0 ? 0 : Math.min(0.1, (now - run.last) / 1000);
      run.last = now;
      run.T += dt * sp * clamp((age - INTRO_ORBIT_FROM) / INTRO_ORBIT_RAMP, 0, 1);
      e.intro = age < INTRO_END ? age : null;
      return run.T;
    };

    paint(introRef.current ? clock(performance.now()) : 1.15);
    if (reduced) return;

    let raf = 0;
    let running = false;
    const loop = (now: number) => {
      paint(clock(now));
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) start();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [mark, size, tone, motionSpeed, color, core, texture, intro]);

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={className}
      aria-hidden
    />
  );
}

export default memo(AgentMark);
