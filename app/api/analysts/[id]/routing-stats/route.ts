import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/analysts/[id]/routing-stats?days=30
// Aggregates AnalystSignalRoute rows for one analyst, grouped by
// routeReasonCode. Feeds the "Signal Routing" strip on the analyst page.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: analystId } = await params;

  // Ownership check — don't leak another user's routing history.
  const owned = await prisma.agentConfig.findFirst({
    where: { id: analystId, userId: user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const days = Math.max(
    1,
    Math.min(90, parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30),
  );
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const grouped = await prisma.analystSignalRoute.groupBy({
    by: ["routeReasonCode"],
    where: { analystId, routedAt: { gte: since } },
    _count: { _all: true },
  });

  const byReason: Record<string, number> = {};
  let total = 0;
  let legacy = 0;
  for (const g of grouped) {
    const n = g._count._all;
    total += n;
    if (g.routeReasonCode) byReason[g.routeReasonCode] = n;
    else legacy += n;
  }

  return NextResponse.json({
    total,
    legacy, // routes without a routeReasonCode — pre-Session-3 rows
    byReason,
    since: since.toISOString(),
  });
}
