import { useEffect, useRef } from "react";

const GLYPHS = "01{}<>/\\$#*&+=;:".split("");
const COLORS = ["255,178,36", "52,211,153", "124,138,255", "154,160,168"];

export default function CodeRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let raf = 0;
    let width = 0;
    let height = 0;
    let drops: number[] = [];

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = Math.max(1, Math.floor(width / 22));
      drops = Array.from({ length: cols }, () => Math.random() * -40);
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.font = "13px JetBrains Mono, ui-monospace, Menlo, monospace";
      drops.forEach((drop, index) => {
        const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? "0";
        const y = drop * 18;
        const fade = Math.max(0, 1 - (y / Math.max(height, 1)) ** 1.4);
        context.fillStyle = `rgba(${COLORS[index % COLORS.length]}, ${0.55 * fade})`;
        context.fillText(glyph, index * 22, y);
        if (y > height && Math.random() > 0.975) drops[index] = 0;
        else drops[index] = drop + 0.35;
      });
    };

    resize();
    draw();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    if (!reduce) {
      const tick = () => {
        frame += 1;
        if (frame % 2 === 0) draw();
        raf = window.requestAnimationFrame(tick);
      };
      raf = window.requestAnimationFrame(tick);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      window.cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}
