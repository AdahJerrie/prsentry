import { useEffect, useRef, useState } from "react";

const DIFF_TOKENS = [
  "+",
  "-",
  "@@",
  "func",
  "async",
  "defer",
  "ctx",
  "SHA256",
  "err != nil",
  "SELECT $1",
  "+return",
  "-query",
  "@@ -42,6",
];

interface ColumnStream {
  x: number;
  y: number;
  speed: number;
  tokenIndex: number;
  opacity: number;
  isAdd: boolean;
  isRemove: boolean;
}

interface FallingCodeCanvasProps {
  paused: boolean;
  onTogglePause: () => void;
}

export default function FallingCodeCanvas({
  paused,
  onTogglePause,
}: FallingCodeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Keyboard listener for 'R' toggle when not typing in an input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        onTogglePause();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onTogglePause]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId = 0;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    const height = (canvas.height = 620);

    const colSpacing = 76;
    const numCols = Math.max(8, Math.floor(width / colSpacing));

    const streams: ColumnStream[] = Array.from({ length: numCols }, (_, idx) => {
      const tokenIdx = idx % DIFF_TOKENS.length;
      const tok = DIFF_TOKENS[tokenIdx];
      return {
        x: idx * colSpacing + 24,
        y: (idx * 97) % height,
        speed: 0.28 + (idx % 4) * 0.11,
        tokenIndex: tokenIdx,
        opacity: 0.055 + (idx % 3) * 0.025,
        isAdd: tok.startsWith("+"),
        isRemove: tok.startsWith("-"),
      };
    });

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = 620;
    };
    window.addEventListener("resize", handleResize);

    const renderFrame = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.font = '500 11px "JetBrains Mono", monospace';

      for (const s of streams) {
        const token = DIFF_TOKENS[s.tokenIndex];
        if (s.isAdd) {
          ctx.fillStyle = `rgba(52, 211, 153, ${s.opacity})`;
        } else if (s.isRemove) {
          ctx.fillStyle = `rgba(248, 113, 113, ${s.opacity})`;
        } else {
          ctx.fillStyle = `rgba(154, 165, 180, ${s.opacity})`;
        }

        ctx.fillText(token, s.x, s.y);

        if (!paused && !reducedMotion) {
          s.y += s.speed;
          if (s.y > height - 20) {
            s.y = -16;
            s.tokenIndex = (s.tokenIndex + 1) % DIFF_TOKENS.length;
            const nextTok = DIFF_TOKENS[s.tokenIndex];
            s.isAdd = nextTok.startsWith("+");
            s.isRemove = nextTok.startsWith("-");
          }
        }
      }

      if (!paused && !reducedMotion) {
        animationFrameId = window.requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [paused, reducedMotion]);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-[620px] overflow-hidden select-none"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block h-[620px] w-full" />
      {/* Smooth vertical fade into #0E1116 */}
      <div
        className="
          absolute inset-0
          bg-gradient-to-b from-transparent via-[#0E1116]/45 to-[#0E1116]
        "
      />
    </div>
  );
}
