import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import FallingCodeCanvas from "../components/FallingCodeCanvas";
import { useAuth } from "../context/AuthContext";

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, isLocked } = useAuth();
  const [rainPaused, setRainPaused] = useState(false);

  const handleToggleRain = useCallback(() => {
    setRainPaused((prev) => !prev);
  }, []);

  const handleEnterStudio = () => {
    if (user && !isLocked) {
      navigate("/dashboard");
    } else {
      navigate("/auth");
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0E1116] font-sans text-[#EDEBE6] antialiased">
      <div className="studio-base pointer-events-none fixed inset-0" aria-hidden="true" />
      <div className="studio-noise pointer-events-none fixed inset-0" aria-hidden="true" />
      <FallingCodeCanvas paused={rainPaused} onTogglePause={handleToggleRain} />
      <div className="studio-vignette pointer-events-none fixed inset-0" aria-hidden="true" />

      <div className="relative z-[2] mx-auto max-w-[1080px] px-6 pb-[90px] pt-[26px]">
        <nav className="flex items-center justify-between rounded-xl border border-white/[0.09] bg-[rgba(20,24,31,0.78)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_16px_50px_rgba(0,0,0,0.45)] backdrop-blur-[14px]">
          <div className="flex items-center gap-3">
            <div className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-gradient-to-br from-[#FFB224] via-[#FF6B00] to-[#7C8AFF] text-sm font-black text-[#14100A] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
              ◈
            </div>
            <div className="ml-2.5 hidden items-center gap-5 text-[13.5px] text-[#9AA0A8] sm:flex">
              <span className="font-semibold text-[#EDEBE6]">Studio</span>
              <span>Protocols</span>
              <span>Systems</span>
              <span>Archive</span>
            </div>
          </div>
          <div className="flex gap-3.5 font-mono text-[11px] tracking-[0.08em]">
            <span className="inline-flex items-center gap-[7px] rounded-full border border-white/[0.09] bg-white/[0.03] px-3 py-1.5 text-[#FFB224]">
              <i className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#FFB224] shadow-[0_0_10px_#FFB224]" />
              ● LIVE
            </span>
            <span className="inline-flex items-center gap-[7px] rounded-full border border-white/[0.09] bg-white/[0.03] px-3 py-1.5 text-[#34D399]">
              <i className="h-[7px] w-[7px] rounded-full bg-[#34D399] shadow-[0_0_10px_#34D399]" />
              ● SYS OK
            </span>
          </div>
        </nav>

        <header className="px-0 pb-3 pt-[88px] text-center">
          <div className="inline-flex items-center gap-[9px] rounded-full border border-white/[0.09] bg-[rgba(20,24,31,0.7)] px-[15px] py-[7px] font-mono text-[11.5px] tracking-[0.12em] text-[#9AA0A8] backdrop-blur-[8px]">
            <b className="font-bold text-[#FFB224]">01 / HARMONIZED</b>
            SLATE · CARBON · DAYLIGHT — ONE CANVAS
          </div>
          <h1 className="mb-3.5 mt-[22px] text-[36px] font-[750] leading-[1.03] tracking-[-0.032em] sm:text-[54px]">
            Code falls.
            <br />
            <span className="bg-gradient-to-b from-white from-20% via-[#FFB224] via-75% to-[#FF6B00] bg-clip-text text-transparent">
              Clarity remains.
            </span>
          </h1>
          <p className="mx-auto max-w-[600px] text-base leading-[1.75] text-[#9AA0A8]">
            One warm-slate canvas — <strong className="font-semibold text-[#EDEBE6]">24px dots + grain + graph</strong>{" "}
            fused. Amber for live, emerald for healthy, mono where it counts, generous line-height
            where you read.
          </p>
          <div className="mt-[26px] flex justify-center gap-3">
            <button
              type="button"
              onClick={handleEnterStudio}
              className="cursor-pointer rounded-[9px] border border-white bg-[#EDEBE6] px-[22px] py-[11px] text-sm font-[650] text-[#0E1116] shadow-[0_8px_28px_rgba(255,255,255,0.12)]"
            >
              Enter the studio
            </button>
            <button
              type="button"
              onClick={handleToggleRain}
              className="cursor-pointer rounded-[9px] border border-white/[0.15] bg-white/[0.04] px-[22px] py-[11px] font-mono text-[13px] font-semibold text-[#EDEBE6] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
            >
              ⌘K &nbsp;quick action
            </button>
          </div>
        </header>

        <section className="mt-[38px] overflow-hidden rounded-[14px] border border-white/[0.15] bg-[rgba(20,24,31,0.78)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur-[16px]">
          <div className="flex items-center gap-2 border-b border-white/[0.09] px-[18px] py-3 font-mono text-[11px] tracking-[0.1em] text-[#9AA0A8]">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#FFB224]" />
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#34D399]" />
            <span className="ml-2">STUDIO — PALETTE + READER · unified</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="border-b border-white/[0.09] p-6 md:border-b-0 md:border-r">
              <h2 className="mb-3.5 font-mono text-[11px] tracking-[0.14em] text-[#9AA0A8]">
                <b className="text-[#FFB224]">⌘</b> &nbsp;QUICK ACTIONS
              </h2>
              <div className="flex items-center gap-2.5 rounded-[9px] border border-[rgba(255,178,36,0.3)] bg-[rgba(255,178,36,0.1)] px-[13px] py-[11px] text-[13.5px]">
                <span>◈ &nbsp;Deploy protocol 042</span>
                <kbd className="ml-auto rounded-md border border-white/[0.09] border-b-2 px-2 py-0.5 font-mono text-[10.5px] text-[#9AA0A8]">
                  ↵
                </kbd>
              </div>
              <button
                type="button"
                onClick={handleToggleRain}
                className="mt-1.5 flex w-full cursor-pointer items-center gap-2.5 rounded-[9px] border border-white/[0.09] bg-white/[0.02] px-[13px] py-[11px] text-left text-[13.5px] text-[#9AA0A8]"
              >
                <span>✦ &nbsp;Toggle code rain</span>
                <kbd className="ml-auto rounded-md border border-white/[0.09] border-b-2 px-2 py-0.5 font-mono text-[10.5px] text-[#9AA0A8]">
                  R
                </kbd>
              </button>
              <div className="mt-1.5 flex items-center gap-2.5 rounded-[9px] border border-white/[0.09] bg-white/[0.02] px-[13px] py-[11px] text-[13.5px] text-[#9AA0A8]">
                <span>▦ &nbsp;Snap to 24px grid</span>
                <kbd className="ml-auto rounded-md border border-white/[0.09] border-b-2 px-2 py-0.5 font-mono text-[10.5px] text-[#9AA0A8]">
                  G
                </kbd>
              </div>
              <div className="mt-3.5">
                <div className="mb-1.5 flex justify-between font-mono text-[11px] text-[#9AA0A8]">
                  <span>FOCUS · DAY SESSION</span>
                  <span className="text-[#34D399]">72%</span>
                </div>
                <div className="h-[7px] overflow-hidden rounded-full border border-white/[0.09] bg-white/[0.07]">
                  <i className="block h-full w-[72%] rounded-full bg-gradient-to-r from-[#34D399] to-[#FFB224]" />
                </div>
              </div>
            </div>
            <div className="p-6">
              <h2 className="mb-3.5 font-mono text-[11px] tracking-[0.14em] text-[#9AA0A8]">
                <b className="text-[#34D399]">§</b> &nbsp;READER — 01 / OBJECTIVE
              </h2>
              <p className="text-[14.5px] leading-[1.75] text-[#CFCBC2]">
                <strong className="text-[#EDEBE6]">Hypothesis:</strong> one canvas carries all three
                ideas — structure from Slate, warmth from Carbon, readability from Daylight.
              </p>
              <div className="mt-[18px] overflow-hidden rounded-[10px] border border-white/[0.09] bg-[#0A0D12] font-mono text-[12.5px] leading-[1.7]">
                <pre className="whitespace-pre-wrap px-[18px] py-4 text-[#D8D3C8]">
                  <span className="text-[#6E7681]"># harmonized tokens</span>
                  {"\n"}
                  bg: <span className="text-[#FFB224]">#0E1116</span>{" "}
                  <span className="text-[#6E7681]">· dots 24px · graph 120px · grain 5%</span>
                  {"\n"}
                  live: <span className="text-[#FFB224]">#FFB224</span>{"   "}ok:{" "}
                  <span className="text-[#34D399]">#34D399</span>{"   "}link:{" "}
                  <span className="text-[#7C8AFF]">#7C8AFF</span>
                  {"\n"}
                  type: <span className="text-[#34D399]">mono headers · sans 15px/1.75 body</span>
                </pre>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-[18px] grid grid-cols-1 overflow-hidden rounded-xl border border-white/[0.09] bg-[rgba(20,24,31,0.6)] md:grid-cols-3">
          <article className="border-b border-white/[0.09] p-6 md:border-b-0 md:border-r">
            <div className="font-mono text-[10.5px] tracking-[0.12em] text-[#FFB224]">
              FROM SLATE — STRUCTURE
            </div>
            <h3 className="mb-[7px] mt-2.5 text-sm">1px hairlines + vignette</h3>
            <p className="text-[13px] leading-[1.7] text-[#9AA0A8]">
              Crisp borders, centered vignette. Content floats, chrome disappears.
            </p>
          </article>
          <article className="border-b border-white/[0.09] p-6 md:border-b-0 md:border-r">
            <div className="font-mono text-[10.5px] tracking-[0.12em] text-[#34D399]">
              FROM CARBON — FEEL
            </div>
            <h3 className="mb-[7px] mt-2.5 text-sm">Grain + amber / emerald</h3>
            <p className="text-[13px] leading-[1.7] text-[#9AA0A8]">
              SVG noise for tactility. Amber = live, emerald = healthy. Nothing else.
            </p>
          </article>
          <article className="p-6">
            <div className="font-mono text-[10.5px] tracking-[0.12em] text-[#7C8AFF]">
              FROM DAYLIGHT — READ
            </div>
            <h3 className="mb-[7px] mt-2.5 text-sm">Graph + generous type</h3>
            <p className="text-[13px] leading-[1.7] text-[#9AA0A8]">
              Faint 120px graph for alignment. 15px / 1.75 body for long sessions.
            </p>
          </article>
        </section>

        <div className="mt-[26px] flex flex-wrap justify-center gap-2.5">
          <code className="rounded-lg border border-white/[0.09] bg-white/[0.03] px-[13px] py-[7px] font-mono text-[11.5px] text-[#9AA0A8]">
            <b className="text-[#EDEBE6]">base</b> #0E1116
          </code>
          <code className="rounded-lg border border-white/[0.09] bg-white/[0.03] px-[13px] py-[7px] font-mono text-[11.5px] text-[#9AA0A8]">
            <b className="text-[#EDEBE6]">texture</b> dots + grain + graph
          </code>
          <code className="rounded-lg border border-white/[0.09] bg-white/[0.03] px-[13px] py-[7px] font-mono text-[11.5px] text-[#9AA0A8]">
            <b className="text-[#EDEBE6]">rain</b> top 620px · fades ↓
          </code>
          <code className="rounded-lg border border-white/[0.09] bg-white/[0.03] px-[13px] py-[7px] font-mono text-[11.5px] text-[#9AA0A8]">
            <b className="text-[#EDEBE6]">accents</b> #FFB224 · #34D399
          </code>
        </div>
      </div>
    </div>
  );
}
