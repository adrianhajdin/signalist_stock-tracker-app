"use client";

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Eye,
  FileText,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const Silk = lazy(() =>
  import("@/components/ui/silk").then((m) => ({ default: m.Silk }))
);

function T({ s, c }: { s: string; c: number }) {
  const pos = c >= 0;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-brand font-bold text-white">${s}</span>
      <span className={cn("rounded px-1 py-0.5 text-[10px]", pos ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative")}>
        {pos ? "+" : ""}{c.toFixed(1)}%
      </span>
    </span>
  );
}

function DocLink({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium underline decoration-white/20 underline-offset-2">{children}</span>
  );
}

type Ev =
  | { type: "text"; node: React.ReactNode; at: number }
  | { type: "tool"; icon: LucideIcon; label: React.ReactNode; sub?: React.ReactNode; at: number; dur: number };

const SCRIPT: Ev[] = [
  {
    type: "text",
    node: <>Reviewing portfolio performance this week. 3 open positions, 2 closed trades. Let me summarize results and plan ahead.</>,
    at: 0,
  },
  {
    type: "tool",
    icon: BarChart3,
    label: "Summarizing portfolio performance",
    sub: <>Week P&L: +$1,240 (+2.4%). Winners: <T s="MU" c={8.3} />, <T s="NVDA" c={3.1} />. Closed <T s="AMD" c={-1.2} /> at stop loss.</>,
    at: 2800,
    dur: 2000,
  },
  {
    type: "text",
    node: <><T s="MU" c={8.3} /> is approaching my $92 target. I need to tighten the trailing stop and reprioritize the watchlist.</>,
    at: 6000,
  },
  {
    type: "tool",
    icon: Eye,
    label: "Updating watchlist priorities",
    sub: <>Moved KLAC to top (earnings catalyst May 1). Removed INTC (thesis invalidated). Added MRVL based on new domain signal.</>,
    at: 8500,
    dur: 1500,
  },
  {
    type: "tool",
    icon: Search,
    label: "Adjusting search monitors",
    sub: <>Added &quot;MRVL custom silicon AI&quot; monitor. Updated KLAC monitor to include earnings whisper data. Paused AMD breakout monitor.</>,
    at: 11000,
    dur: 1500,
  },
  {
    type: "tool",
    icon: FileText,
    label: <>Writing <DocLink>Tomorrow&apos;s Intelligence Brief</DocLink></>,
    sub: <>What to watch: KLAC earnings setup, MU target approach ($92), MRVL custom silicon thesis. 2 domain extractions queued for overnight.</>,
    at: 14000,
    dur: 2000,
  },
  {
    type: "text",
    node: <>Brief written and monitors updated. Tomorrow I&apos;ll focus on KLAC pre-earnings positioning and decide whether to take profits on <T s="MU" c={8.3} /> at target.</>,
    at: 17500,
  },
];

function TextBlock({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-white/80 leading-relaxed py-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-500">
      {children}
    </p>
  );
}

function ToolBlock({
  icon: Icon,
  label,
  sub,
  loading,
}: {
  icon: LucideIcon;
  label: React.ReactNode;
  sub?: React.ReactNode;
  loading: boolean;
}) {
  return (
    <div className="py-1.5 animate-in fade-in-0 duration-300">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 shrink-0 text-white/50" />
        <span className="text-sm text-white/70">{label}</span>
        {loading && (
          <div className="h-1.5 w-12 rounded-full bg-muted relative overflow-hidden">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
          </div>
        )}
      </div>
      {!loading && sub && (
        <p className="ml-5 mt-0.5 text-xs text-white/50 leading-relaxed">{sub}</p>
      )}
    </div>
  );
}

export function BriefPreview({ className }: { className?: string } = {}) {
  const [now, setNow] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const start = Date.now();
    const last = SCRIPT[SCRIPT.length - 1].at;
    const iv = setInterval(() => {
      const e = Date.now() - start;
      setNow(e);
      if (e > last + 2000) clearInterval(iv);
    }, 100);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [now]);

  const vis: Array<{ ev: Ev; idx: number; loading?: boolean }> = [];
  for (let i = 0; i < SCRIPT.length; i++) {
    const ev = SCRIPT[i];
    if (now < ev.at) break;
    if (ev.type === "tool") {
      vis.push({ ev, idx: i, loading: (now - ev.at) < ev.dur });
    } else {
      vis.push({ ev, idx: i });
    }
  }

  return (
    <div className={cn("w-full h-[300px] rounded-2xl overflow-hidden relative text-white", className)}>
      <div className="absolute inset-0">
        <Suspense fallback={<div className="w-full h-full bg-muted/40" />}>
          <Silk speed={3} scale={1} color="#7B6B5B" noiseIntensity={1.5} rotation={0} />
        </Suspense>
      </div>

      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto flex flex-col justify-end p-6"
        style={{
          scrollBehavior: "smooth",
          maskImage: "linear-gradient(to bottom, transparent, black 25%, black 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 25%, black 100%)",
        }}
      >
        <div className="mt-auto">
          {vis.map(({ ev, idx, loading }) => {
            if (ev.type === "text") return <TextBlock key={idx}>{ev.node}</TextBlock>;
            if (ev.type === "tool") return <ToolBlock key={idx} icon={ev.icon} label={ev.label} sub={ev.sub} loading={!!loading} />;
            return null;
          })}
        </div>
      </div>
    </div>
  );
}
