import { useEffect, useRef } from 'react';

// Lightweight canvas confetti for the 100% moment. No dependencies,
// fixed overlay, cleans itself up. Honors reduced-motion.
export default function Confetti({ pieces = 130, durationMs = 2800 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = (canvas.width = Math.floor(window.innerWidth * dpr));
    const H = (canvas.height = Math.floor(window.innerHeight * dpr));
    const colors = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#facc15', '#fafafa'];
    const rnd = (a, b) => a + Math.random() * (b - a);
    const parts = Array.from({ length: pieces }, () => ({
      x: rnd(0, W),
      y: rnd(-H * 0.2, -10),
      w: rnd(6, 12) * dpr,
      h: rnd(8, 16) * dpr,
      vy: rnd(2, 5) * dpr,
      vx: rnd(-1.5, 1.5) * dpr,
      rot: rnd(0, Math.PI * 2),
      vr: rnd(-0.15, 0.15),
      color: colors[(Math.random() * colors.length) | 0],
    }));
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      if (now - start > durationMs) {
        ctx.clearRect(0, 0, W, H);
        return;
      }
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.x += p.vx + Math.sin((now + p.y) / 300) * dpr;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > H + 20) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pieces, durationMs]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  );
}
