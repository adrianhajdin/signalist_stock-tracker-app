/**
 * read_signals — aligned with Session 3 / Workstream B Universe contract.
 *
 * Reads intelligence signals routed to this analyst by background jobs.
 * Applies intelligence-policy constraints (urgency floor, source quality,
 * budget). Falls back to sector/industry/theme/watchlist match if no
 * routed signals.
 *
 * Returns three buckets, segmented by `routeReasonCode` (set by
 * signal-router.ts):
 *   portfolioSignals  — routeReasonCode === "POSITION"
 *   watchlistSignals  — routeReasonCode === "WATCHLIST"
 *   discoverySignals  — DISCOVERY | SECTOR_MATCH | INDUSTRY_MATCH |
 *                       THEME_MATCH | DIRECT_TICKER | CROSS_ANALYST
 *
 * The flat `signals` array is kept for legacy renderers and urgency sorts.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import { prisma } from "@/lib/prisma";
import { etTradingDayDate } from "@/lib/market-hours";
import { toSourceRefs, sourceRefsToToolSources } from "@/lib/agent/tool-types";
import type {
  SignalItem,
  SignalsToolData,
  RouteReasonCode,
  MatchedUniverse,
} from "@/lib/agent/tool-types";

const DISCOVERY_CODES: RouteReasonCode[] = [
  "DISCOVERY",
  "SECTOR_MATCH",
  "INDUSTRY_MATCH",
  "THEME_MATCH",
  "DIRECT_TICKER",
  "CROSS_ANALYST",
];

function mapSignal(
  r: {
    relevanceScore: number;
    routeReason: string | null;
    routeReasonCode: string | null;
    matchedUniverse: unknown;
    signal: {
      id: string;
      type: string;
      headline: string;
      summary: string | null;
      tickers: string[];
      themes: string[];
      sentiment: string | null;
      urgency: string | null;
      freshness: string | null;
      sourceNames: string[];
      sourceUrls: string[];
      artifactId: string | null;
    };
  },
): SignalItem {
  const code = (r.routeReasonCode as RouteReasonCode | null) ?? undefined;
  const mu = (r.matchedUniverse as MatchedUniverse | null) ?? null;
  return {
    signalId: r.signal.id,
    type: r.signal.type,
    headline: r.signal.headline,
    summary: r.signal.summary ?? "",
    tickers: r.signal.tickers,
    themes: r.signal.themes,
    sentiment: r.signal.sentiment ?? "NEUTRAL",
    urgency: r.signal.urgency ?? "MEDIUM",
    freshness: r.signal.freshness ?? undefined,
    sources: toSourceRefs(r.signal.sourceNames, r.signal.sourceUrls),
    relevanceScore: r.relevanceScore,
    routeReason: r.routeReason ?? undefined,
    artifactId: r.signal.artifactId,
    routeReasonCode: code,
    matchedUniverse: mu,
    crossAnalystSource:
      code === "CROSS_ANALYST" ? mu?.fromAnalystId ?? null : null,
  };
}

/** Bucket a SignalItem by its routeReasonCode for the 3-bucket view. */
function bucketOf(
  s: SignalItem,
): "portfolio" | "watchlist" | "discovery" {
  const c = s.routeReasonCode;
  if (c === "POSITION") return "portfolio";
  if (c === "WATCHLIST") return "watchlist";
  // Everything else — DISCOVERY, SECTOR_MATCH, INDUSTRY_MATCH, THEME_MATCH,
  // DIRECT_TICKER, CROSS_ANALYST, or undefined — reads as discovery.
  return "discovery";
}

export const readSignals = defineTool({
  description:
    "Read intelligence signals routed to you by background discovery jobs. Returns pre-gathered news, filings, earnings, social, and macro signals matched to your mandate, split into three buckets: portfolioSignals (your open positions), watchlistSignals (your watchlist), and discoverySignals (new-ticker candidates matched via your Universe fence — sectors, industries, themes). Filter by tickers, themes, or urgency. Signals are marked as READ after retrieval. Use discoverySignals to find new names to research — do NOT ignore them.",
  schema: z.object({
    tickers: z.array(z.string()).optional().describe("Filter to signals mentioning these tickers"),
    themes: z.array(z.string()).optional().describe("Filter to signals with these themes (e.g. AI_CAPEX, FED_RATE_CUT)"),
    type: z
      .enum(["NEWS", "EARNINGS", "FILING", "SOCIAL", "PRICE_ACTION", "ANALYST_NOTE", "OPTIONS", "MACRO", "SECTOR"])
      .optional()
      .describe("Filter to a specific signal type"),
    urgency: z
      .enum(["LOW", "MEDIUM", "HIGH", "BREAKING"])
      .optional()
      .describe("Minimum urgency level"),
    bucket: z
      .enum(["POSITION", "WATCHLIST", "DISCOVERY"])
      .optional()
      .describe("Filter to a specific routing bucket. Omit to get all buckets split into three groups."),
    limit: z.number().optional().describe("Max signals to return (default 20, capped by intelligence policy)"),
  }),
  ui: "tool-ui" as const,

  progressLabel: (args) => {
    if (args.bucket === "POSITION") return "Reading portfolio signals";
    if (args.bucket === "WATCHLIST") return "Reading watchlist signals";
    if (args.bucket === "DISCOVERY") return "Reading discovery signals";
    if (args.tickers && args.tickers.length > 0) {
      const sample = args.tickers.slice(0, 2).map((t) => `$${t.toUpperCase()}`).join(", ");
      const extra = args.tickers.length > 2 ? ` (+${args.tickers.length - 2} more)` : "";
      return `Reading signals on ${sample}${extra}`;
    }
    if (args.themes && args.themes.length > 0) {
      const sample = args.themes[0];
      const extra = args.themes.length > 1 ? ` (+${args.themes.length - 1} more)` : "";
      return `Reading signals on ${sample}${extra}`;
    }
    if (args.urgency === "HIGH" || args.urgency === "BREAKING") {
      return "Reading urgent signals";
    }
    return "Reading signals routed to this analyst";
  },

  execute: async ({ tickers, themes, type, urgency, bucket, limit = 20 }, ctx) => {
    if (!ctx.analystId) {
      return {
        summary: "No analyst context — cannot read signals.",
        data: {
          count: 0,
          signals: [],
          portfolioSignals: [],
          watchlistSignals: [],
          discoverySignals: [],
        } as SignalsToolData,
        sources: [],
      };
    }

    const policy = ctx.intelligencePolicy;
    const policyMaxSignals = policy?.maxSignalsPerRun ?? 30;
    const effectiveLimit = Math.min(limit, policyMaxSignals);

    const urgencyOrder = ["LOW", "MEDIUM", "HIGH", "BREAKING"];
    const callerMinIdx = urgency ? urgencyOrder.indexOf(urgency) : 0;
    const policyMinIdx = policy?.minUrgency ? urgencyOrder.indexOf(policy.minUrgency) : 0;
    const effectiveMinIdx = Math.max(callerMinIdx, policyMinIdx);
    const validUrgencies = urgencyOrder.slice(effectiveMinIdx);

    const minSourceQuality = policy?.minSourceQuality ?? 2;
    const excludedCategories = policy?.excludedSourceCategories ?? [];

    // Bucket filter → map to the set of routeReasonCodes to include.
    let codeFilter: RouteReasonCode[] | null = null;
    if (bucket === "POSITION") codeFilter = ["POSITION"];
    else if (bucket === "WATCHLIST") codeFilter = ["WATCHLIST"];
    else if (bucket === "DISCOVERY") codeFilter = DISCOVERY_CODES;

    // Pull a wider slice than `effectiveLimit` so we can split into three
    // buckets and still have enough in each.
    const loadCap = Math.max(effectiveLimit * 3, 30);

    const routes = await prisma.analystSignalRoute.findMany({
      where: {
        analystId: ctx.analystId,
        status: { in: ["PENDING", "READ"] },
        ...(codeFilter ? { routeReasonCode: { in: codeFilter } } : {}),
        signal: {
          ...(tickers && tickers.length > 0 ? { tickers: { hasSome: tickers } } : {}),
          ...(themes && themes.length > 0 ? { themes: { hasSome: themes } } : {}),
          ...(type ? { type } : {}),
          urgency: { in: validUrgencies },
          sourceQuality: { gte: minSourceQuality },
        },
      },
      include: { signal: { include: { artifact: true } } },
      orderBy: { relevanceScore: "desc" },
      take: loadCap + excludedCategories.length * 5,
    });

    let filtered = routes;
    if (excludedCategories.length > 0) {
      filtered = routes.filter((r) => {
        const signalSectors = r.signal.sectors ?? [];
        return !signalSectors.some((s: string) => (excludedCategories as string[]).includes(s));
      });
    }

    // Per-bucket cap so discovery isn't crowded out by a hot-ticker hour.
    const perBucketCap = Math.max(3, Math.floor(effectiveLimit / 3));

    const groupedByBucket: {
      portfolio: typeof filtered;
      watchlist: typeof filtered;
      discovery: typeof filtered;
    } = { portfolio: [], watchlist: [], discovery: [] };
    for (const r of filtered) {
      const code = r.routeReasonCode as RouteReasonCode | null;
      if (code === "POSITION") groupedByBucket.portfolio.push(r);
      else if (code === "WATCHLIST") groupedByBucket.watchlist.push(r);
      else groupedByBucket.discovery.push(r);
    }

    const picked: typeof filtered = [];
    const pickedIds = new Set<string>();
    for (const b of ["portfolio", "watchlist", "discovery"] as const) {
      for (const r of groupedByBucket[b].slice(0, perBucketCap)) {
        picked.push(r);
        pickedIds.add(r.id);
      }
    }
    // Backfill to effectiveLimit with whatever's left, highest score first.
    for (const r of filtered) {
      if (picked.length >= effectiveLimit) break;
      if (pickedIds.has(r.id)) continue;
      picked.push(r);
      pickedIds.add(r.id);
    }

    const finalRoutes = picked.slice(0, effectiveLimit);

    if (finalRoutes.length > 0) {
      await prisma.analystSignalRoute.updateMany({
        where: { id: { in: finalRoutes.map((r) => r.id) } },
        data: { status: "READ" },
      });
    }

    // Fallback: no routed signals at all for this analyst today.
    if (finalRoutes.length === 0) {
      const config = await prisma.agentConfig.findUnique({
        where: { id: ctx.analystId },
        select: {
          sectors: true,
          industries: true,
          themes: true,
          watchlist: true,
          exclusionList: true,
        },
      });

      const cfgSectors = config?.sectors ?? [];
      const cfgIndustries = config?.industries ?? [];
      const cfgThemes = config?.themes ?? [];
      const cfgWatchlist = config?.watchlist ?? [];
      const exclSet = new Set(
        (config?.exclusionList ?? []).map((e) => e.toUpperCase()),
      );

      const hasAnyFilter =
        cfgWatchlist.length > 0 ||
        cfgSectors.length > 0 ||
        cfgIndustries.length > 0 ||
        cfgThemes.length > 0;

      if (hasAnyFilter) {
        const today = etTradingDayDate();
        const fallbackSignals = await prisma.signal.findMany({
          where: {
            createdAt: { gte: today },
            urgency: { in: validUrgencies },
            sourceQuality: { gte: minSourceQuality },
            OR: [
              ...(cfgWatchlist.length > 0 ? [{ tickers: { hasSome: cfgWatchlist } }] : []),
              ...(cfgSectors.length > 0 ? [{ sectors: { hasSome: cfgSectors } }] : []),
              ...(cfgIndustries.length > 0 ? [{ industries: { hasSome: cfgIndustries } }] : []),
              ...(cfgThemes.length > 0 ? [{ themes: { hasSome: cfgThemes } }] : []),
            ],
          },
          orderBy: { createdAt: "desc" },
          take: effectiveLimit,
        });

        if (fallbackSignals.length > 0) {
          const watchSet = new Set(cfgWatchlist.map((w) => w.toUpperCase()));
          const fbSignals: SignalItem[] = fallbackSignals
            .filter((s) => !s.tickers.some((t) => exclSet.has(t.toUpperCase())))
            .map((s): SignalItem => {
              const hasWatchlist = s.tickers.some((t) => watchSet.has(t.toUpperCase()));
              // Fallback never has position data (positions require routing),
              // so classify as WATCHLIST or DISCOVERY only.
              const code: RouteReasonCode = hasWatchlist ? "WATCHLIST" : "DISCOVERY";
              return {
                signalId: s.id,
                type: s.type,
                headline: s.headline,
                summary: s.summary ?? "",
                tickers: s.tickers,
                themes: s.themes,
                sentiment: s.sentiment ?? "NEUTRAL",
                urgency: s.urgency ?? "MEDIUM",
                freshness: s.freshness ?? undefined,
                sources: toSourceRefs(s.sourceNames, s.sourceUrls),
                relevanceScore: 0,
                routeReason: "fallback_sector_watchlist_match",
                artifactId: s.artifactId,
                routeReasonCode: code,
                matchedUniverse: {
                  inWatchlist: hasWatchlist,
                  inPositions: false,
                },
                crossAnalystSource: null,
              };
            });

          const portfolioSignals: SignalItem[] = [];
          const watchlistSignals = fbSignals.filter((s) => bucketOf(s) === "watchlist");
          const discoverySignals = fbSignals.filter((s) => bucketOf(s) === "discovery");

          const urgent = fbSignals.filter((s) => s.urgency === "HIGH" || s.urgency === "BREAKING").length;
          const bullish = fbSignals.filter((s) => s.sentiment === "BULLISH").length;
          const bearish = fbSignals.filter((s) => s.sentiment === "BEARISH").length;
          return {
            summary: `${fbSignals.length} signal${fbSignals.length !== 1 ? "s" : ""} (${urgent} urgent, ${bullish} bullish, ${bearish} bearish). Fallback: sector/industry/theme/watchlist match.`,
            data: {
              count: fbSignals.length,
              fallback: true,
              fallbackReason:
                "No routed signals found — falling back to sector/industry/theme/watchlist match",
              policyApplied: {
                maxSignals: policyMaxSignals,
                minUrgency: urgencyOrder[effectiveMinIdx],
                minSourceQuality,
                excludedCategories,
              },
              signals: fbSignals,
              portfolioSignals,
              watchlistSignals,
              discoverySignals,
              discoveryNote:
                discoverySignals.length === 0
                  ? "No discovery candidates this session — your Universe may need expansion."
                  : undefined,
              tickers: fbSignals.map((s) => ({
                ticker: s.tickers[0] ?? "MACRO",
                tag: s.urgency,
                summary: s.headline,
              })),
            } as SignalsToolData & { tickers: { ticker: string; tag: string; summary: string }[] },
            sources: sourceRefsToToolSources(fbSignals.flatMap((s) => s.sources)),
          };
        }
      }

      // Nothing — return empty but still shape-stable.
      return {
        summary: "No signals routed or available for fallback.",
        data: {
          count: 0,
          signals: [],
          portfolioSignals: [],
          watchlistSignals: [],
          discoverySignals: [],
          discoveryNote: "No discovery candidates this session.",
        } as SignalsToolData,
        sources: [],
      };
    }

    const mappedSignals = finalRoutes.map(mapSignal);

    const portfolioSignals = mappedSignals.filter((s) => bucketOf(s) === "portfolio");
    const watchlistSignals = mappedSignals.filter((s) => bucketOf(s) === "watchlist");
    const discoverySignals = mappedSignals.filter((s) => bucketOf(s) === "discovery");

    const urgent = mappedSignals.filter((s) => s.urgency === "HIGH" || s.urgency === "BREAKING").length;
    const bullish = mappedSignals.filter((s) => s.sentiment === "BULLISH").length;
    const bearish = mappedSignals.filter((s) => s.sentiment === "BEARISH").length;

    return {
      summary:
        `${mappedSignals.length} signal${mappedSignals.length !== 1 ? "s" : ""} ` +
        `(${urgent} urgent, ${bullish} bullish, ${bearish} bearish) · ` +
        `${portfolioSignals.length} portfolio / ${watchlistSignals.length} watchlist / ${discoverySignals.length} discovery.`,
      data: {
        count: mappedSignals.length,
        policyApplied: {
          maxSignals: policyMaxSignals,
          minUrgency: urgencyOrder[effectiveMinIdx],
          minSourceQuality,
          excludedCategories,
        },
        signals: mappedSignals,
        portfolioSignals,
        watchlistSignals,
        discoverySignals,
        discoveryNote:
          discoverySignals.length === 0
            ? "No discovery candidates this session — your Universe may need expansion."
            : undefined,
        tickers: mappedSignals.map((s) => ({
          ticker: s.tickers[0] ?? "MACRO",
          tag: s.urgency,
          summary: s.headline,
        })),
      } as SignalsToolData & { tickers: { ticker: string; tag: string; summary: string }[] },
      sources: sourceRefsToToolSources(mappedSignals.flatMap((s) => s.sources)),
    };
  },
});
