import { useEffect, useRef, useState } from "react";

const GLYPHS = "01{}<>/\\$#*&+=;:".split("");
const COLORS = ["255,178,36", "52,211,153", "124,138,255", "154,160,168"];

interface FallingCodeCanvasProps {
  paused: boolean;
  onTogglePause: () => void;
}

export default function FallingCodeCanvas({
  paused,
  onTogglePause,
}: FallingCodeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(paused);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        onTogglePause();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onTogglePause]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let drops: number[] = [];
    let frame = 0;
    let raf = 0;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = "14px ui-monospace, Menlo, monospace";
      const cols = Math.max(1, Math.floor(width / 22));
      drops = Array.from({ length: cols }, () => Math.random() * -40);
    };

    const fadeAt = (y: number) => {
      const t = y / Math.max(height, 1);
      return Math.max(0, 1 - t ** 1.4);
    };

    const tick = () => {
      raf = window.requestAnimationFrame(tick);
      if (pausedRef.current || reducedMotion) return;
      frame += 1;
      if (frame % 2) return;

      ctx.fillStyle = "rgba(14,17,22,0.14)";
      ctx.fillRect(0, 0, width, height);
      ctx.font = "14px ui-monospace, Menlo, monospace";

      for (let i = 0; i < drops.length; i += 1) {
        const x = i * 22 + 8;
        const y = drops[i] * 18;
        const glyph = GLYPHS[(Math.random() * GLYPHS.length) | 0] ?? "0";
        const color =
          COLORS[((Math.random() * 10) | 0) % 4 === 0 ? (Math.random() * 3) | 0 : 3] ??
          COLORS[3];
        const alpha = (0.25 + Math.random() * 0.55) * fadeAt(y);
        if (alpha <= 0.01) {
          drops[i] = y > height ? Math.random() * -10 : drops[i] + 1;
          continue;
        }
        ctx.fillStyle = `rgba(${color},${Math.min(1, alpha + 0.25)})`;
        ctx.fillText(glyph, x, y);
        ctx.fillStyle = `rgba(${color},${alpha * 0.35})`;
        ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0] ?? "0", x, y - 18);
        drops[i] += 1;
        if (y > height + 20 && Math.random() > 0.975) drops[i] = 0;
      }
    };

    resize();
    window.addEventListener("resize", resize);
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(raf);
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (!paused) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [paused]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[1] h-[620px] select-none [mask-image:linear-gradient(to_bottom,#000_0%,#000_35%,transparent_92%)]"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block h-full w-full opacity-90" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent from-40% to-[#0E1116]" />
    </div>
  );
}
