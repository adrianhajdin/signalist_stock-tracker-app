import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  try {
    // Load last 30 position events, 15 theses, 10 research runs in parallel
    const [positionEvents, theses, runs] = await Promise.all([
      prisma.positionEvent.findMany({
        where: { position: { userId } },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { position: { select: { symbol: true, direction: true } } },
      }),
      prisma.thesis.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true,
          ticker: true,
          direction: true,
          confidenceScore: true,
          createdAt: true,
        },
      }),
      prisma.researchRun.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, createdAt: true },
      }),
    ]);

    type AgentEvent = {
      id: string;
      type: string;
      ticker?: string;
      detail: string;
      timestamp: string;
      pnlPct?: number;
      direction?: string;
    };

    const events: AgentEvent[] = [
      ...positionEvents.map((e) => ({
        id: e.id,
        type: mapEventType(e.eventType),
        ticker: e.position?.symbol,
        detail: e.description,
        timestamp: e.createdAt.toISOString(),
        pnlPct: e.pnlAt ?? undefined,
        direction: e.position?.direction,
      })),
      ...theses.map((t) => ({
        id: `thesis-${t.id}`,
        type: "THESIS_GENERATED",
        ticker: t.ticker,
        detail: `${t.direction} thesis generated — ${t.confidenceScore}% confidence`,
        timestamp: t.createdAt.toISOString(),
        direction: t.direction,
      })),
      ...runs.map((r) => ({
        id: `run-${r.id}`,
        type: "RESEARCH_START",
        detail: `Agent started research run`,
        timestamp: r.createdAt.toISOString(),
      })),
    ].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ).slice(0, 50);

    return NextResponse.json({ events });
  } catch (error) {
    console.error("agent-activity error:", error);
    return NextResponse.json({ events: [] });
  }
}

function mapEventType(et: string): string {
  switch (et) {
    case "OPENED": return "TRADE_PLACED";
    case "PRICE_CHECK": return "PRICE_CHECK";
    case "NEAR_TARGET": return "NEAR_TARGET";
    case "CLOSED": return "TRADE_CLOSED";
    case "EVALUATED": return "EVALUATED";
    case "EOD_CHECK": return "PRICE_CHECK";
    default: return "PRICE_CHECK";
  }
}
