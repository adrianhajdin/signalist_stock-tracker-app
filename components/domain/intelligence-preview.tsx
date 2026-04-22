"use client";

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { Globe, FileText, SatelliteDish, BarChart3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const Silk = lazy(() =>
  import("@/components/ui/silk").then((m) => ({ default: m.Silk }))
);

const FAV = {
  perplexity: "https://www.google.com/s2/favicons?domain=perplexity.ai&sz=32",
  firecrawl: "https://www.google.com/s2/favicons?domain=firecrawl.dev&sz=32",
  finnhub: "https://www.google.com/s2/favicons?domain=finnhub.io&sz=32",
  fmp: "https://www.google.com/s2/favicons?domain=financialmodelingprep.com&sz=32",
} as const;

function Fav({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="inline-block size-3 ml-1 rounded-sm align-baseline" />;
}

function DocLink({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium underline decoration-foreground/20 underline-offset-2">{children}</span>
  );
}

type Ev =
  | { type: "text"; node: React.ReactNode; at: number }
  | { type: "tool"; icon: LucideIcon; label: React.ReactNode; sub?: React.ReactNode; at: number; dur: number };

const SCRIPT: Ev[] = [
  {
    type: "tool",
    icon: SatelliteDish,
    label: "Running firm market sweep",
    sub: <>Scanning market movers, sector rotation, and macro events for today<Fav src={FAV.fmp} /><Fav src={FAV.finnhub} /></>,
    at: 0,
    dur: 1800,
  },
  {
    type: "tool",
    icon: Globe,
    label: "Searching \"semiconductor earnings outlook Q2 2026\"",
    sub: <>Found 8 results — Morgan Stanley raised sector outlook, TSMC guidance beat expectations<Fav src={FAV.perplexity} /></>,
    at: 2500,
    dur: 1500,
  },
  {
    type: "tool",
    icon: Globe,
    label: <>Extracting <DocLink>chartmill.com/stock/screener/technical-breakouts</DocLink></>,
    sub: <>Extracted 12 breakout candidates — MU, KLAC, AMAT showing volume surge patterns<Fav src={FAV.firecrawl} /></>,
    at: 5000,
    dur: 2000,
  },
  {
    type: "tool",
    icon: BarChart3,
    label: "Checking earnings calendar — next 7 days",
    sub: <>14 reports upcoming: MU (Apr 30), LRCX (May 1), AMD (May 2)<Fav src={FAV.finnhub} /></>,
    at: 8000,
    dur: 1200,
  },
  {
    type: "text",
    node: <>Pipeline complete. 23 signals gathered from 4 sources. Routing to analysts by sector and relevance.</>,
    at: 10500,
  },
  {
    type: "tool",
    icon: FileText,
    label: <>Writing <DocLink>AI Tech Analyst Morning Brief</DocLink></>,
    sub: <>Market context, 3 portfolio alerts, 2 watchlist updates, 4 new opportunities. Attention priority: MU, FIVN, KLAC.</>,
    at: 13000,
    dur: 2000,
  },
  {
    type: "text",
    node: <>Briefs delivered to 3 analysts. Each will read their personalized brief when they start their research session.</>,
    at: 16500,
  },
];

function TextBlock({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-white/80 leading-relaxed py-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-500">
      {children}
    </p>
  );
}

function ToolBlock({ icon: Icon, label, sub, loading }: { icon: LucideIcon; label: React.ReactNode; sub?: React.ReactNode; loading: boolean }) {
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

export function IntelligencePreview({ className }: { className?: string } = {}) {
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
          <Silk speed={3} scale={1} color="#5B6B7B" noiseIntensity={1.5} rotation={0} />
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
