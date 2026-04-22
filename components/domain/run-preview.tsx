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

// ── Notion-style linked doc ──────────────────────────────────────────────────

function DocLink({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium underline decoration-white/20 underline-offset-2">{children}</span>
  );
}

// ── Script ───────────────────────────────────────────────────────────────────

type Ev =
  | { type: "text"; node: React.ReactNode; at: number }
  | { type: "tool"; icon: LucideIcon; label: React.ReactNode; sub?: React.ReactNode; at: number; dur: number }
  | { type: "trade"; node: React.ReactNode; at: number };

const SCRIPT: Ev[] = [
  // 1. Agent intro (combined into 1 line)
  {
    type: "text",
    node: <>Starting with no open positions. My watchlist has <T s="MU" c={0.5} /> — yesterday&apos;s brief noted &quot;Watch Tomorrow: price &gt; $88 AND volume &gt; average.&quot; Let me check if the setup triggered.</>,
    at: 0,
  },
  // 2. Read brief — Notion-style doc link
  {
    type: "tool",
    icon: FileText,
    label: <>Reading <DocLink>AI Tech Analyst Daily Monitors &amp; Signals</DocLink></>,
    sub: <>Portfolio alert on <T s="MU" c={-6.97} /> — down 6.97% on sector-wide chip selloff. Two new opportunities flagged from overnight Sonar queries and domain extraction…<Fav src={FAV.perplexity} /><Fav src={FAV.firecrawl} /></>,
    at: 2800,
    dur: 2200,
  },
  // 3. Agent reacts
  {
    type: "text",
    node: <><T s="MU" c={-6.97} /> dropped 6.97% on a broad chip selloff. This looks sector-wide, not company-specific — I want to validate with market data before acting.</>,
    at: 6000,
  },
  // 4. Market conditions
  {
    type: "tool",
    icon: TrendingUp,
    label: "Market conditions",
    sub: <>SPY $563.20 (+0.42%), VIX 14.8 — risk-on. Tech leading (+1.2%), energy lagging<Fav src={FAV.finnhub} /><Fav src={FAV.fmp} /></>,
    at: 8500,
    dur: 1500,
  },
  // 5. Stock data + earnings combined
  {
    type: "tool",
    icon: BarChart3,
    label: "Stock data for MU",
    sub: <>Micron $85.46 (−6.97%) · RSI 28.4 (oversold) · 91% Buy, 54 analysts · Beat EPS by $0.35 last quarter, 4 consecutive beats<Fav src={FAV.finnhub} /></>,
    at: 11000,
    dur: 2000,
  },
  // 6. Agent wants to validate further
  {
    type: "text",
    node: <>Fundamentals are strong but I want to confirm the selloff is supply-chain driven, not a Micron-specific downgrade. Let me search.</>,
    at: 14000,
  },
  // 7. Web search
  {
    type: "tool",
    icon: Globe,
    label: "Searching \"Micron MU stock drop reason March 2026\"",
    sub: <>Selloff driven by broad semiconductor tariff fears, not company-specific. Morgan Stanley reiterated Overweight with $110 target<Fav src={FAV.perplexity} /></>,
    at: 16000,
    dur: 1800,
  },
  // 8. Agent synthesizes
  {
    type: "text",
    node: <><T s="MU" c={-6.97} /> is oversold at RSI 28.4 with strong fundamentals. The selloff is sector-wide — peers are all down but VIX is low and SPY is green. Morgan Stanley just reiterated $110. This is a buying opportunity.</>,
    at: 19000,
  },
  // 9. Trade with pulsing dot
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
    at: 22000,
  },
  // 10. Wrap up with doc link
  {
    type: "text",
    node: <>Trade placed. <T s="MU" c={-6.97} /> is my top pick — oversold bounce with strong earnings and 91% analyst consensus. Let me note this for <DocLink>Daily Portfolio Summary</DocLink>, writing now.</>,
    at: 24500,
  },
];

// ── Renderers ────────────────────────────────────────────────────────────────

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

// ── RunPreview ───────────────────────────────────────────────────────────────

export function RunPreview({ className }: { className?: string } = {}) {
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
          <Silk speed={3} scale={1} color="#7B7481" noiseIntensity={1.5} rotation={0} />
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
            if (ev.type === "trade") return <div key={idx} className="py-1.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-500">{ev.node}</div>;
            return null;
          })}
        </div>
      </div>
    </div>
  );
}
