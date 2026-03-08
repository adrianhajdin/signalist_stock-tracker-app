import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

type Params = { id: string };

export default async function ThesisDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const thesis = await prisma.thesis.findUnique({
    where: { id },
    include: {
      trade: { include: { events: { orderBy: { createdAt: "asc" } } } },
      researchRun: true,
    },
  });

  if (!thesis || thesis.userId !== user?.id) notFound();

  const dirColor =
    thesis.direction === "LONG"
      ? "text-emerald-500"
      : thesis.direction === "SHORT"
        ? "text-red-500"
        : "text-muted-foreground";

  const pnl = thesis.trade?.realizedPnl;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back */}
      <Link href="/research" className="text-sm text-muted-foreground hover:text-foreground">
        ← Research Feed
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {thesis.ticker}
            <span className={`ml-3 text-xl font-semibold tabular-nums ${dirColor}`}>
              {thesis.direction}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date(thesis.createdAt).toLocaleString()} ·{" "}
            {thesis.researchRun?.source ?? "MANUAL"} research
          </p>
        </div>
        <div className={`text-2xl font-bold tabular-nums ${thesis.confidenceScore >= 70 ? "text-emerald-500" : "text-red-500"}`}>
          {thesis.confidenceScore}%
        </div>
      </div>

      {/* Signals + metadata */}
      <div className="flex flex-wrap gap-2">
        {thesis.signalTypes.map((s) => (
          <Badge key={s} variant="secondary">{s}</Badge>
        ))}
        {thesis.sector && <Badge variant="outline">{thesis.sector}</Badge>}
        <Badge variant="outline">{thesis.holdDuration}</Badge>
      </div>

      {/* Price levels */}
      {thesis.entryPrice && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Entry</p>
                <p className="text-lg font-semibold tabular-nums">${thesis.entryPrice.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Target</p>
                <p className="text-lg font-semibold tabular-nums text-emerald-500">
                  {thesis.targetPrice ? `$${thesis.targetPrice.toFixed(2)}` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stop</p>
                <p className="text-lg font-semibold tabular-nums text-red-500">
                  {thesis.stopLoss ? `$${thesis.stopLoss.toFixed(2)}` : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reasoning */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium">Analysis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p className="leading-relaxed">{thesis.reasoningSummary}</p>

          {thesis.thesisBullets.length > 0 && (
            <ul className="list-disc list-inside space-y-1">
              {thesis.thesisBullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}

          {thesis.riskFlags.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Risks</p>
              <ul className="list-disc list-inside space-y-1 text-red-500/80">
                {thesis.riskFlags.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trade status */}
      {thesis.trade ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">Trade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                <p className={thesis.trade.status === "OPEN" ? "text-emerald-500" : "text-muted-foreground"}>
                  {thesis.trade.status}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Shares</p>
                <p className="tabular-nums">{thesis.trade.shares}</p>
              </div>
              {pnl != null && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">P&amp;L</p>
                  <p className={`tabular-nums font-semibold ${pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                  </p>
                </div>
              )}
            </div>

            {/* Trade events */}
            {thesis.trade.events.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Events</p>
                <ol className="space-y-1 text-xs text-muted-foreground">
                  {thesis.trade.events.map((ev) => (
                    <li key={ev.id} className="flex gap-2">
                      <span className="font-mono">{ev.eventType}</span>
                      <span>{ev.description}</span>
                      {ev.priceAt && (
                        <span className="tabular-nums">${ev.priceAt.toFixed(2)}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        thesis.direction !== "PASS" && (
          <div className="flex justify-end">
            <Button variant="default" disabled>
              Place Paper Trade (coming soon)
            </Button>
          </div>
        )
      )}

      {/* Empty state for PASS */}
      {thesis.direction === "PASS" && (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground text-center">
            The AI passed on this ticker — no trade was placed.
          </p>
        </Card>
      )}
    </div>
  );
}
