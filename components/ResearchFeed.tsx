"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCallback } from "react";

type Trade = {
  id: string;
  realizedPnl: number | null;
  status: string;
  entryPrice: number;
  closePrice: number | null;
};

type Thesis = {
  id: string;
  ticker: string;
  direction: string;
  confidenceScore: number;
  holdDuration: string;
  signalTypes: string[];
  sector: string | null;
  reasoningSummary: string;
  createdAt: Date;
  trade: Trade | null;
  researchRun: { source: string } | null;
};

const FILTERS = [
  { label: "All", params: {} },
  { label: "Long only", params: { direction: "LONG" } },
  { label: "Short only", params: { direction: "SHORT" } },
  { label: "High confidence", params: { confidence: "high" } },
  { label: "Traded", params: { status: "traded" } },
];

export default function ResearchFeed({ theses }: { theses: Thesis[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const applyFilter = useCallback(
    (params: Record<string, string>) => {
      const sp = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => sp.set(k, v));
      router.push(`${pathname}?${sp.toString()}`);
    },
    [router, pathname]
  );

  const activeKey = searchParams.toString();

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const key = new URLSearchParams(f.params as Record<string, string>).toString();
          const active = key === activeKey;
          return (
            <button
              key={f.label}
              onClick={() => applyFilter(f.params as Record<string, string>)}
              className={`text-xs font-medium uppercase tracking-wide px-3 py-1 rounded-full border transition-colors ${
                active
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:border-foreground"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {theses.length === 0 && (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground text-center">
            No theses yet. Use Research Chat to generate your first trade idea.
          </p>
        </Card>
      )}

      {/* Thesis cards */}
      {theses.map((thesis) => (
        <ThesisCard key={thesis.id} thesis={thesis} />
      ))}
    </div>
  );
}

function ThesisCard({ thesis }: { thesis: Thesis }) {
  const dirColor =
    thesis.direction === "LONG"
      ? "text-emerald-500"
      : thesis.direction === "SHORT"
        ? "text-red-500"
        : "text-muted-foreground";

  const pnl = thesis.trade?.realizedPnl;
  const pnlColor = pnl != null ? (pnl >= 0 ? "text-emerald-500" : "text-red-500") : null;

  return (
    <Link href={`/research/${thesis.id}`}>
      <Card className="hover:border-foreground/30 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{thesis.ticker}</span>
              <span className={`text-sm font-medium tabular-nums ${dirColor}`}>
                {thesis.direction}
              </span>
              {thesis.researchRun?.source === "AGENT" && (
                <Badge variant="secondary" className="text-xs">AI</Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {pnl != null && (
                <span className={`text-xs font-semibold tabular-nums ${pnlColor}`}>
                  {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                </span>
              )}
              <span className={`text-xs font-semibold tabular-nums ${thesis.confidenceScore >= 70 ? "text-emerald-500" : "text-red-500"}`}>
                {thesis.confidenceScore}%
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {thesis.signalTypes.slice(0, 3).map((s) => (
              <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
            ))}
            {thesis.sector && (
              <Badge variant="outline" className="text-xs">{thesis.sector}</Badge>
            )}
            <Badge variant="outline" className="text-xs">{thesis.holdDuration}</Badge>
          </div>

          <p className="text-xs text-muted-foreground line-clamp-2">
            {thesis.reasoningSummary}
          </p>

          <p className="text-xs text-muted-foreground">
            {new Date(thesis.createdAt).toLocaleDateString()}
            {thesis.trade && (
              <span className="ml-2">
                · Trade{" "}
                <span className={thesis.trade.status === "OPEN" ? "text-emerald-500" : "text-muted-foreground"}>
                  {thesis.trade.status}
                </span>
              </span>
            )}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
