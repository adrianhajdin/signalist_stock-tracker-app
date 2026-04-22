"use client";

import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { Globe, Settings, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const Silk = lazy(() =>
  import("@/components/ui/silk").then((m) => ({ default: m.Silk }))
);

function DocLink({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium underline decoration-foreground/20 underline-offset-2">📄 {children}</span>
  );
}

type Ev =
  | { type: "user"; node: React.ReactNode; at: number }
  | { type: "text"; node: React.ReactNode; at: number }
  | { type: "tool"; icon: LucideIcon; label: React.ReactNode; sub?: React.ReactNode; at: number; dur: number };

const SCRIPT: Ev[] = [
  {
    type: "user",
    node: <>I want an AI breakout analyst. I check <span className="font-medium underline decoration-muted-foreground/30 underline-offset-2">tradingview.com</span> and <span className="font-medium underline decoration-muted-foreground/30 underline-offset-2">trendspider.com</span> everyday. I&apos;m interested in MU, NVDA, and AMD specifically.</>,
    at: 0,
  },
  {
    type: "text",
    node: <>Great — I&apos;ll build a technical breakout analyst focused on semiconductors. Let me research current setups on your tickers to calibrate the strategy.</>,
    at: 3000,
  },
  {
    type: "tool",
    icon: Search,
    label: "Researching MU, NVDA, AMD — current technical setups",
    sub: <>MU near 52W low with RSI 28. NVDA consolidating above $800. AMD testing breakout at $165 resistance.</>,
    at: 5500,
    dur: 2000,
  },
  {
    type: "text",
    node: <>Based on these setups, I&apos;ll configure your analyst for momentum breakouts with volume confirmation. Adding your domains as daily monitors.</>,
    at: 8500,
  },
  {
    type: "tool",
    icon: Globe,
    label: <>Adding domain monitor: <DocLink>tradingview.com/screener</DocLink></>,
    sub: <>Will extract daily breakout screener data via Firecrawl.</>,
    at: 11000,
    dur: 1200,
  },
  {
    type: "tool",
    icon: Globe,
    label: <>Adding domain monitor: <DocLink>trendspider.com/signals</DocLink></>,
    sub: <>Will extract daily signal alerts and trend analysis.</>,
    at: 13000,
    dur: 1200,
  },
  {
    type: "tool",
    icon: Settings,
    label: "Building analyst configuration",
    sub: <>Momentum Breakout Analyst · LONG-only · Swing · 70%+ confidence · Sectors: Semiconductors, Technology</>,
    at: 15500,
    dur: 1500,
  },
  {
    type: "text",
    node: <>Your analyst is ready. It&apos;ll check TradingView and TrendSpider every morning, watch MU, NVDA, and AMD, and I&apos;ve added KLAC, LRCX, and AMAT as related picks.</>,
    at: 18500,
  },
];

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end py-2 animate-in fade-in-0 slide-in-from-bottom-1 duration-500">
      <div className="rounded-2xl rounded-br-sm bg-foreground/10 px-3 py-2 max-w-[85%]">
        <p className="text-sm text-white/90 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

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

export function BuilderPreview({ className }: { className?: string } = {}) {
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
          <Silk speed={3} scale={1} color="#6B7B5B" noiseIntensity={1.5} rotation={0} />
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
            if (ev.type === "user") return <UserBubble key={idx}>{ev.node}</UserBubble>;
            if (ev.type === "text") return <TextBlock key={idx}>{ev.node}</TextBlock>;
            if (ev.type === "tool") return <ToolBlock key={idx} icon={ev.icon} label={ev.label} sub={ev.sub} loading={!!loading} />;
            return null;
          })}
        </div>
      </div>
    </div>
  );
}
