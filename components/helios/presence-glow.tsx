'use client';

/**
 * A soft pool of colored light that drifts toward whoever is in front of the
 * phone, after the desktop Helios mouse glow (Teambridge's HeliosGlow). With
 * the camera on, it follows movement the front camera sees; otherwise it
 * follows a finger or the mouse. Frames are read at 32×24 on the device and
 * never stored or sent. One rAF loop writes styles directly, so nothing
 * re-renders per frame.
 */
import { memo, useEffect, useRef } from 'react';

const SIZE_OF_SHORT_SIDE = 1.25;
const PULL = 0.05;
const MAX_OPACITY = 0.34;
const OPACITY_EASE = 0.05;
const POINTER_HOLD_MS = 350;
// Someone standing in front of the phone moves a little all the time; hold the glow between
// those small movements so it doesn't flicker.
const CAMERA_HOLD_MS = 1500;
const SAMPLE_W = 32;
const SAMPLE_H = 24;
const SAMPLE_MS = 80;
// Brightness change (0–255) that counts as movement, above the camera's own noise.
const MOVE_THRESHOLD = 28;
const MIN_MOVING_PIXELS = 4;
// Share of the frame moving that reads as someone right up close.
const FULL_PRESENCE = 0.14;
const HUE_SPEED = 9;
// Mint → sky → cornflower → periwinkle → orchid → pink → peach; the hue ping-pongs along it.
const AURORA_HUES = [168, 197, 224, 250, 285, 330, 390];

interface Target {
  /** 0–1 across and down the screen. */
  x: number;
  y: number;
  /** 0–1: how strongly to glow. */
  strength: number;
  at: number;
  hold: number;
}

const paletteHue = (s: number): number => {
  const n = AURORA_HUES.length - 1;
  const tri = Math.abs((((s % 2) + 2) % 2) - 1) * n;
  const i = Math.min(n - 1, Math.floor(tri));
  return (AURORA_HUES[i] + (AURORA_HUES[i + 1] - AURORA_HUES[i]) * (tri - i)) % 360;
};

const wanderHue = (t: number, p: number) =>
  paletteHue((t * HUE_SPEED + 80 * Math.sin(t * 0.23 + p) + 50 * Math.sin(t * 0.071 + p * 1.7)) / 360);

// Eight radii each on their own sinusoid, so the pool is never a plain circle.
const blobRadius = (t: number): string => {
  const v = (speed: number, off: number) => `${(50 + 16 * Math.sin(t * speed + off)).toFixed(1)}%`;
  return `${v(0.9, 0)} ${v(1.3, 2.1)} ${v(1.1, 4.2)} ${v(0.8, 1.3)} / ${v(1.2, 3.1)} ${v(0.7, 0.6)} ${v(1.4, 5.0)} ${v(1.0, 2.4)}`;
};

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

interface PresenceGlowProps {
  camera: boolean;
  /** The camera couldn't start (denied, missing, or not allowed on this page). */
  onCameraError: () => void;
}

function PresenceGlow({ camera, onCameraError }: PresenceGlowProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<Target | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const blob = blobRef.current;
    if (!layer || !blob || prefersReducedMotion()) return;

    const phases = Array.from({ length: 4 }, () => Math.random() * Math.PI * 2);
    const onPointer = (event: PointerEvent) => {
      const rect = layer.getBoundingClientRect();
      targetRef.current = {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
        strength: 1,
        at: performance.now(),
        hold: POINTER_HOLD_MS,
      };
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });

    let x: number | null = null;
    let y = 0;
    let opacity = 0;
    let frame = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const target = targetRef.current;
      if (!target) return;
      const t = now / 1000;
      const w = layer.clientWidth;
      const h = layer.clientHeight;
      const size = Math.min(w, h) * SIZE_OF_SHORT_SIDE;
      if (x === null) {
        x = target.x * w;
        y = target.y * h;
      }
      x += (target.x * w - x) * PULL;
      y += (target.y * h - y) * PULL;
      const live = now - target.at < target.hold;
      opacity += ((live ? MAX_OPACITY * target.strength : 0) - opacity) * OPACITY_EASE;

      blob.style.width = `${size.toFixed(0)}px`;
      blob.style.height = `${size.toFixed(0)}px`;
      blob.style.transform = `translate(${(x - size / 2).toFixed(1)}px, ${(y - size / 2).toFixed(1)}px)`;
      blob.style.opacity = opacity.toFixed(3);
      blob.style.borderRadius = blobRadius(t);
      blob.style.setProperty('--glow-ha', wanderHue(t, phases[0]).toFixed(1));
      blob.style.setProperty('--glow-hb', wanderHue(t, phases[1]).toFixed(1));
      blob.style.setProperty('--glow-hc', ((318 + 42 * (0.5 + 0.5 * Math.sin(t * 0.17 + phases[2]))) % 360).toFixed(1));
      blob.style.setProperty('--glow-cx', `${(35 + 14 * Math.sin(t * 0.4 + phases[2])).toFixed(1)}%`);
      blob.style.setProperty('--glow-cy', `${(35 + 14 * Math.cos(t * 0.31 + phases[3])).toFixed(1)}%`);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  useEffect(() => {
    if (!camera || prefersReducedMotion()) return;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let previous: Uint8Array | null = null;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;

    const sample = () => {
      if (!ctx || video.readyState < 2) return;
      ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
      const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
      const luma = new Uint8Array(SAMPLE_W * SAMPLE_H);
      let moving = 0;
      let sumX = 0;
      let sumY = 0;
      for (let i = 0; i < luma.length; i++) {
        const l = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8;
        luma[i] = l;
        if (previous && Math.abs(l - previous[i]) > MOVE_THRESHOLD) {
          moving++;
          sumX += i % SAMPLE_W;
          sumY += Math.floor(i / SAMPLE_W);
        }
      }
      previous = luma;
      if (moving < MIN_MOVING_PIXELS) return;
      targetRef.current = {
        // The front camera sees the room mirrored: someone to the phone's right shows up on the left.
        x: 1 - (sumX / moving + 0.5) / SAMPLE_W,
        y: (sumY / moving + 0.5) / SAMPLE_H,
        strength: Math.min(1, moving / (SAMPLE_W * SAMPLE_H) / FULL_PRESENCE),
        at: performance.now(),
        hold: CAMERA_HOLD_MS,
      };
    };

    const start = async () => {
      if (stream || stopped) return;
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available on this page');
        const next = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
          audio: false,
        });
        if (stopped) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = next;
        video.srcObject = next;
        await video.play();
        previous = null;
        timer = window.setInterval(sample, SAMPLE_MS);
      } catch (e) {
        console.error('[PresenceGlow] camera', e);
        if (!stopped) onCameraError();
      }
    };
    const pause = () => {
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
    };
    // Release the camera while the page is in the background.
    const onVisibility = () => (document.hidden ? pause() : void start());
    document.addEventListener('visibilitychange', onVisibility);
    void start();
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      pause();
    };
  }, [camera, onCameraError]);

  return (
    <div ref={layerRef} className="helios-glow" aria-hidden>
      <div ref={blobRef} className="helios-glow__blob" style={{ opacity: 0 }} />
    </div>
  );
}

export default memo(PresenceGlow);
