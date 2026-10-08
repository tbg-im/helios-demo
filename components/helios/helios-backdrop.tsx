'use client';

/**
 * The page's ambient layer, ported from Teambridge's HeliosBackdrop: an aurora
 * wash (globals.css → .helios-backdrop) under slowly drifting particles kept
 * to the side bands, so none drift under the orb and copy. Decorative.
 */
import { memo, useEffect, useRef } from 'react';

const COUNT = 72;
const CENTER_GUTTER = 0.58;

// Deterministic, so every mount lays the field out the same way.
const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const tokenRgb = (ctx: CanvasRenderingContext2D, el: HTMLElement, token: string, fallback: string): string => {
  const value = getComputedStyle(el).getPropertyValue(token).trim();
  if (!value) return fallback;
  ctx.fillStyle = '#000';
  ctx.fillStyle = value;
  const resolved = ctx.fillStyle as string;
  if (!resolved.startsWith('#')) return fallback;
  const n = parseInt(resolved.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

function HeliosBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = canvasRef.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let width = 0;
    let height = 0;
    const resize = () => {
      width = el.clientWidth;
      height = el.clientHeight;
      el.width = Math.max(2, Math.round(width * dpr));
      el.height = Math.max(2, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const reduced = prefersReducedMotion();
    const dot = tokenRgb(ctx, el, '--color-content-tertiary', '148,163,184');

    // A third of the field clusters toward the top-right, where the slate wash sits.
    const parts = Array.from({ length: COUNT }, (_, k) => {
      const corner = k % 3 === 0;
      return {
        bx: corner ? 1 - 0.5 * Math.pow(hash(k * 3.1), 1.6) : hash(k * 3.1),
        by: corner ? 0.5 * Math.pow(hash(k * 5.7), 1.6) : hash(k * 5.7),
        vx: (hash(k * 7.3) - 0.5) * 0.008,
        vy: (hash(k * 9.9) - 0.5) * 0.008,
        wA: 6 + hash(k * 4.7) * 10,
        wS: 0.25 + hash(k * 6.1) * 0.5,
        wP: hash(k * 8.2) * 6.2832,
        r: 0.8 + hash(k * 2.3) * 1.6,
        twS: 0.8 + hash(k) * 1.4,
        twP: hash(k * 11.4) * 6.2832,
      };
    });

    const paint = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const p of parts) {
        const nx = (((p.bx + p.vx * t) % 1) + 1) % 1;
        const ny = (((p.by + p.vy * t) % 1) + 1) % 1;
        // Squeeze x into the outer bands, keeping the middle of the width clear.
        const ox = nx - 0.5;
        const ax = Math.abs(ox) * 2;
        const k = ax < 1e-4 ? 1 : (CENTER_GUTTER + (1 - CENTER_GUTTER) * ax) / ax;
        const x = (0.5 + ox * k) * width + Math.cos(t * p.wS + p.wP) * p.wA;
        const y = ny * height + Math.sin(t * p.wS * 0.8 + p.wP) * p.wA;
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * p.twS + p.twP));
        ctx.fillStyle = `rgba(${dot},${twinkle * 0.42})`;
        ctx.beginPath();
        ctx.arc(x, y, p.r * (0.7 + 0.3 * twinkle), 0, 6.2832);
        ctx.fill();
      }
    };

    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) paint(1.15);
    });
    observer.observe(el);
    paint(1.15);
    if (reduced) return () => observer.disconnect();

    let frame = 0;
    const start = performance.now();
    const loop = (now: number) => {
      paint(1.15 + (now - start) / 1000);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="helios-backdrop" aria-hidden>
      <canvas ref={canvasRef} />
    </div>
  );
}

export default memo(HeliosBackdrop);
