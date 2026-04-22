import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

// GET /api/intelligence/coverage?days=7
// Returns per-dimension counts of signals routed to any of this user's
// analysts within the lookback. Feeds the Coverage strip on /intelligence.
// Orphan = sectors[] AND themes[] both empty — a signal the router can't
// place via the universe fence.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const analystIds = (
    await prisma.agentConfig.findMany({
      where: { userId: user.id },
      select: { id: true },
    })
  ).map((a) => a.id);

  if (analystIds.length === 0) {
    return NextResponse.json({
      total: 0,
      orphanCount: 0,
      sectors: [],
      industries: [],
      themes: [],
      since: null,
    });
  }

  const days = Math.max(
    1,
    Math.min(30, parseInt(req.nextUrl.searchParams.get("days") ?? "7", 10) || 7),
  );
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const signals = await prisma.signal.findMany({
    where: {
      createdAt: { gte: since },
      routes: { some: { analystId: { in: analystIds } } },
    },
    select: {
      id: true,
      sectors: true,
      industries: true,
      themes: true,
    },
  });

  const sectorCounts = new Map<string, number>();
  const industryCounts = new Map<string, number>();
  const themeCounts = new Map<string, number>();
  let orphanCount = 0;

  for (const s of signals) {
    if (s.sectors.length === 0 && s.themes.length === 0) orphanCount += 1;
    for (const v of s.sectors) sectorCounts.set(v, (sectorCounts.get(v) ?? 0) + 1);
    for (const v of s.industries) industryCounts.set(v, (industryCounts.get(v) ?? 0) + 1);
    for (const v of s.themes) themeCounts.set(v, (themeCounts.get(v) ?? 0) + 1);
  }

  const toRows = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    total: signals.length,
    orphanCount,
    sectors: toRows(sectorCounts),
    industries: toRows(industryCounts),
    themes: toRows(themeCounts),
    since: since.toISOString(),
  });
}
