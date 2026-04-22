"use client";

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  TrendingUp,
  FileText,
  Globe,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const Silk = lazy(() =>
  import("@/components/ui/silk").then((m) => ({ default: m.Silk }))
);

// ── Ticker chip ──────────────────────────────────────────────────────────────

function T({ s, c }: { s: string; c: number }) {
  const pos = c >= 0;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-brand font-bold text-white">${s}</span>
      <span className={cn("rounded px-1 py-0.5 text-[10px]", pos ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative")}>
        {pos ? "↗" : "↘"} {pos ? "+" : ""}{c.toFixed(2)}%
      </span>
    </span>
  );
}

// ── Inline favicon citation ──────────────────────────────────────────────────

function Fav({ src }: { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="inline-block size-3 ml-1 rounded-sm align-baseline" />
  );
}

const FAV = {
  finnhub: "https://www.google.com/s2/favicons?domain=finnhub.io&sz=32",
  fmp: "https://www.google.com/s2/favicons?domain=financialmodelingprep.com&sz=32",
  perplexity: "https://www.google.com/s2/favicons?domain=perplexity.ai&sz=32",
  firecrawl: "https://www.google.com/s2/favicons?domain=firecrawl.dev&sz=32",
  alpaca: "https://www.google.com/s2/favicons?domain=alpaca.markets&sz=32",
} as const;

// ── Script ──────────────────────────────────────────────────────────────────

type Ev =
  | { type: "text"; node: React.ReactNode; at: number }
  | { type: "tool"; icon: LucideIcon; label: React.ReactNode; sub?: React.ReactNode; at: number; dur: number }
  | { type: "trade"; node: React.ReactNode; at: number };

const SCRIPT: Ev[] = [
  {
    type: "text",
    node: <>Starting with no open positions. My watchlist has <T s="MU" c={0.5} /> — yesterday&apos;s brief noted &quot;Watch Tomorrow: price &gt; $88 AND volume &gt; average.&quot; Let me check if the setup triggered.</>,
    at: 0,
  },
  {
    type: "tool",
    icon: FileText,
    label: "Reading morning intelligence brief",
    sub: <>Portfolio alert on <T s="MU" c={-6.97} /> — down 6.97% on sector-wide chip selloff. Two new opportunities flagged from overnight signals…<Fav src={FAV.perplexity} /><Fav src={FAV.firecrawl} /></>,
    at: 3500,
    dur: 2800,
  },
  {
    type: "text",
    node: <><T s="MU" c={-6.97} /> dropped 6.97% on a broad chip selloff. This looks sector-wide, not company-specific — I want to validate with market data before acting.</>,
    at: 7500,
  },
  {
    type: "tool",
    icon: TrendingUp,
    label: "Market conditions",
    sub: <>SPY $563.20 (+0.42%), VIX 14.8 — risk-on. Tech leading (+1.2%), energy lagging<Fav src={FAV.finnhub} /><Fav src={FAV.fmp} /></>,
    at: 11000,
    dur: 2000,
  },
  {
    type: "tool",
    icon: BarChart3,
    label: "Stock data for MU",
    sub: <>Micron $85.46 (−6.97%) · RSI 28.4 (oversold) · 91% Buy, 54 analysts · Beat EPS 4 consecutive quarters<Fav src={FAV.finnhub} /></>,
    at: 14500,
    dur: 2500,
  },
  {
    type: "text",
    node: <>Fundamentals are strong but I want to confirm the selloff is supply-chain driven, not a Micron-specific downgrade.</>,
    at: 18500,
  },
  {
    type: "tool",
    icon: Globe,
    label: "Searching \"Micron MU stock drop reason\"",
    sub: <>Selloff driven by broad semiconductor tariff fears, not company-specific. Morgan Stanley reiterated $110 target<Fav src={FAV.perplexity} /></>,
    at: 21500,
    dur: 2200,
  },
  {
    type: "text",
    node: <><T s="MU" c={-6.97} /> is oversold at RSI 28.4 with strong fundamentals. The selloff is sector-wide — Morgan Stanley just reiterated $110. This is a buying opportunity.</>,
    at: 25500,
  },
  {
    type: "trade",
    node: (
      <span className="flex items-center gap-2">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-positive" />
        </span>
        <span className="text-xs text-white">BUY 58 shares MU @ $85.46 — $4,957 deployed</span>
        <Fav src={FAV.alpaca} />
      </span>
    ),
    at: 29500,
  },
  {
    type: "text",
    node: <>Trade placed. <T s="MU" c={-6.97} /> is my top pick — oversold bounce with strong earnings and 91% analyst consensus.</>,
    at: 33000,
  },
];

// ── Renderers ───────────────────────────────────────────────────────────────

function TextBlock({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-white/80 leading-relaxed py-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-700">
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
    <div className="py-1.5 animate-in fade-in-0 duration-500">
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

// ── Component ───────────────────────────────────────────────────────────────

export function AuthPreview() {
  const [now, setNow] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const start = Date.now();
    const last = SCRIPT[SCRIPT.length - 1].at;
    const iv = setInterval(() => {
      const e = Date.now() - start;
      setNow(e);
      if (e > last + 3000) clearInterval(iv);
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
    <div className="w-full h-full relative">
      <div className="absolute inset-0">
        <Suspense fallback={<div className="w-full h-full bg-muted/40" />}>
          <Silk speed={2} scale={1} color="#7B7481" noiseIntensity={1.5} rotation={0} />
        </Suspense>
      </div>

      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto flex flex-col justify-end px-10 pb-12"
        style={{
          scrollBehavior: "smooth",
          maskImage: "linear-gradient(to bottom, transparent, black 20%, black 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 20%, black 100%)",
        }}
      >
        <div className="mt-auto max-w-lg">
          {vis.map(({ ev, idx, loading }) => {
            if (ev.type === "text") return <TextBlock key={idx}>{ev.node}</TextBlock>;
            if (ev.type === "tool") return <ToolBlock key={idx} icon={ev.icon} label={ev.label} sub={ev.sub} loading={!!loading} />;
            if (ev.type === "trade") return <div key={idx} className="py-1.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-700">{ev.node}</div>;
            return null;
          })}
        </div>
      </div>
    </div>
  );
}
