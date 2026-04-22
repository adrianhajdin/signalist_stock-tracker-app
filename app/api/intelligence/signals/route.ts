import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"

// GET /api/intelligence/signals — list recent signals/findings.
//
// PRODUCT CONTRACT (updated):
//   The Findings feed shows EVERY signal the firm has collected. Routing is
//   about per-analyst relevance ranking, not about firm-feed visibility. An
//   aggregate signal (market movers, earnings calendar) should appear in
//   Findings even before — or without ever — being routed to an analyst.
//
//   Previous implementation filtered by `routes.some(analystId IN userAnalysts)`,
//   which meant aggregate signals with no routes (the common case while the
//   router catches up or if they match no analyst's fence) disappeared from
//   the feed entirely. Fixed here.
//
//   The route payload is still returned on each signal so the UI can render
//   "Routed to: …" chips. Analyst + Route filters still work — they just
//   become opt-in narrow-downs rather than mandatory visibility gates.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Get this user's analyst IDs — used only when the client explicitly filters
  // by analyst or route reason (so the filter is intersected with this user's
  // analysts rather than leaking cross-firm in a future multi-user world).
  const userAnalysts = await prisma.agentConfig.findMany({
    where: { userId: user.id },
    select: { id: true },
  })
  const analystIds = userAnalysts.map((a) => a.id)

  const type = req.nextUrl.searchParams.get("type")
  const urgency = req.nextUrl.searchParams.get("urgency")
  const batchId = req.nextUrl.searchParams.get("batchId")
  const theme = req.nextUrl.searchParams.get("theme")
  const routeReasonCode = req.nextUrl.searchParams.get("routeReasonCode")
  const orphans = req.nextUrl.searchParams.get("orphans") === "1"
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50")

  const parseCsv = (raw: string | null): string[] | null => {
    if (!raw) return null;
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : null;
  };
  const tickers = parseCsv(req.nextUrl.searchParams.get("ticker"));
  const sectors = parseCsv(req.nextUrl.searchParams.get("sector"));
  const industries = parseCsv(req.nextUrl.searchParams.get("industry"));
  const filterAnalystIds = parseCsv(req.nextUrl.searchParams.get("analystId"));
  const routeCodes = parseCsv(routeReasonCode);

  // Route filter is now OPT-IN. We only attach a `routes: { some: … }` clause
  // if the caller actually filtered by analyst or route-reason. With no such
  // filter, every signal is visible — routing is metadata, not a visibility
  // gate.
  const hasRouteFilter = filterAnalystIds !== null || routeCodes !== null;
  let routeFilterClause: object = {};
  if (hasRouteFilter) {
    const routeReasonWhere = routeCodes
      ? routeCodes.length === 1
        ? { routeReasonCode: routeCodes[0] }
        : { routeReasonCode: { in: routeCodes } }
      : {};
    const scopedAnalystIds = filterAnalystIds
      ? filterAnalystIds.filter((id) => analystIds.includes(id))
      : analystIds;
    const analystRouteWhere: Record<string, unknown> =
      scopedAnalystIds.length === 1
        ? { analystId: scopedAnalystIds[0], ...routeReasonWhere }
        : { analystId: { in: scopedAnalystIds }, ...routeReasonWhere };
    routeFilterClause = { routes: { some: analystRouteWhere } };
  }

  const signals = await prisma.signal.findMany({
    where: {
      ...(tickers
        ? tickers.length === 1
          ? { tickers: { has: tickers[0] } }
          : { tickers: { hasSome: tickers } }
        : {}),
      ...(type ? { type } : {}),
      ...(urgency ? { urgency } : {}),
      ...(batchId ? { batchId } : {}),
      ...(sectors
        ? sectors.length === 1
          ? { sectors: { has: sectors[0] } }
          : { sectors: { hasSome: sectors } }
        : {}),
      ...(industries
        ? industries.length === 1
          ? { industries: { has: industries[0] } }
          : { industries: { hasSome: industries } }
        : {}),
      ...(theme ? { themes: { has: theme } } : {}),
      ...(orphans ? { sectors: { isEmpty: true }, themes: { isEmpty: true } } : {}),
      ...routeFilterClause,
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
    select: {
      id: true,
      batchId: true,
      artifactId: true,
      monitorId: true,
      type: true,
      headline: true,
      summary: true,
      evidence: true,
      tickers: true,
      themes: true,
      sectors: true,
      industries: true,
      sentiment: true,
      noveltyScore: true,
      urgency: true,
      sourceQuality: true,
      freshness: true,
      sourceUrls: true,
      sourceNames: true,
      searchTool: true,
      searchQuery: true,
      searchContext: true,
      aggregateType: true,
      dataPayload: true,
      itemCount: true,
      expiresAt: true,
      createdAt: true,
      batch: {
        select: { jobType: true, status: true, startedAt: true },
      },
      monitor: {
        select: { id: true, name: true, type: true, method: true, config: true },
      },
      routes: {
        select: {
          id: true,
          analystId: true,
          analyst: { select: { id: true, name: true } },
          relevanceScore: true,
          routeReason: true,
          routeReasonCode: true,
          matchedUniverse: true,
          status: true,
        },
      },
    },
  })

  return NextResponse.json(signals)
}
