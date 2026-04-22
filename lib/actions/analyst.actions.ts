"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { resolveAlpacaCredentials } from "@/lib/actions/api-keys.actions";
import { DEFAULT_INTELLIGENCE_POLICY } from "@/lib/intelligence/types";
import type { SourceCategory, QueryCategory, IntelligencePolicy } from "@/lib/intelligence/types";
import {
  normalizeSectors,
  normalizeIndustries,
  normalizeThemes,
} from "@/lib/universe/canonical";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface AnalystConfig {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  analystPrompt: string | null;
  description: string | null;
  sectors: string[];
  signalTypes: string[];
  holdDurations: string[];
  directionBias: string;
  minConfidence: number;
  maxOpenPositions: number;
  maxPositionSize: number;
  maxRiskPct: number | null;
  minMarketCapTier: string | null;
  exchanges: string[];
  watchlist: string[];
  exclusionList: string[];
  // ── Universe (B1) — narrower discovery fence ─────────────────────
  industries: string[];
  themes: string[];
  marketCapMin: number | null;
  marketCapMax: number | null;
  dailyLossLimit: number;
  scheduleTime: string;
  createdAt: Date;
  updatedAt: Date;
  // V3 intelligence fields — populated from Monitor table + AgentConfig.intelligencePolicy
  intelligencePolicy: Record<string, unknown> | null;
  domainMonitors: Array<{
    id: string;
    name: string;
    domain: string;
    category: string;
    qualityScore: number;
    enabled: boolean;
  }>;
  searchMonitors: Array<{
    id: string;
    name: string;
    query: string;
    category: string;
    enabled: boolean;
  }>;
}

export interface AnalystOpenTrade {
  id: string;
  ticker: string;
  direction: string;
  entryPrice: number;
  shares: number;
}

export interface AnalystListItem {
  id: string;
  name: string;
  enabled: boolean;
  analystPrompt: string | null;
  description: string | null;
  sectors: string[];
  signalTypes: string[];
  holdDurations: string[];
  directionBias: string;
  minConfidence: number;
  lastRunAt: Date | null;
  lastRunStatus: string | null;
  tradeCount: number;
  winRate: number | null;
  totalPnl: number;
  openTrades: AnalystOpenTrade[];
}

export interface RunWithTheses {
  id: string;
  status: string;
  source: string;
  startedAt: Date;
  completedAt: Date | null;
  theses: {
    id: string;
    ticker: string;
    direction: string;
    confidenceScore: number;
    reasoningSummary: string;
    holdDuration: string;
    signalTypes: string[];
    sourcesUsed: unknown;
    trade: {
      id: string;
      status: string;
      realizedPnl: number | null;
      outcome: string | null;
    } | null;
  }[];
}

export interface PositionWithThesis {
  id: string;
  symbol: string;
  direction: string;
  status: string;
  avgCost: number;
  quantity: number;
  closePrice: number | null;
  realizedPnl: number | null;
  outcome: string | null;
  openedAt: Date;
  closedAt: Date | null;
  thesis: {
    id: string;
    confidenceScore: number;
    reasoningSummary: string;
  };
}

export interface AnalystStats {
  totalRuns: number;
  totalTheses: number;
  totalTrades: number;
  winRate: number | null;
  totalPnl: number;
  wins: number;
  losses: number;
  bestWin: number | null;
  worstLoss: number | null;
  avgConfidence: number | null;
}

export interface MorningBriefItem {
  id: string;
  date: Date;
  marketContext: string;
  portfolioAlerts: unknown;
  watchlistUpdates: unknown;
  newOpportunities: unknown;
  attentionPriority: string[];
  riskFlags: string[];
  signalCount: number;
  generatedAt: Date;
}

export interface AnalystDetail {
  config: AnalystConfig;
  recentRuns: RunWithTheses[];
  recentTrades: PositionWithThesis[];
  stats: AnalystStats;
  briefings: AnalystBriefingItem[];
  morningBriefs: MorningBriefItem[];
}

export interface AnalystBriefingItem {
  id: string;
  runId: string | null;
  narrative: string;
  marketContext: unknown;
  theses: unknown;
  trades: unknown;
  portfolioSnapshot: unknown;
  strategyNotes: string | null;
  marketPosture: string | null;
  watchTomorrow: unknown;
  unresolvedItems: unknown;
  selfCorrections: unknown;
  createdAt: Date;
}

export interface DashboardRun {
  id: string;
  analystId: string | null;
  analystName: string | null;
  source: string;
  startedAt: Date;
  completedAt: Date | null;
  theses: {
    ticker: string;
    direction: string;
    confidenceScore: number;
    trade: { id: string; status: string; realizedPnl: number | null } | null;
  }[];
}

// ── Helper ────────────────────────────────────────────────────────────────────

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── getAnalystList ────────────────────────────────────────────────────────────

export async function getAnalystList(): Promise<AnalystListItem[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const configs = await prisma.agentConfig.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  if (configs.length === 0) return [];

  // Load all runs and positions for this user, group in JS
  const [allRuns, allPositions] = await Promise.all([
    prisma.researchRun.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        agentConfigId: true,
        status: true,
        startedAt: true,
      },
    }),
    prisma.position.findMany({
      where: { userId },
      select: {
        id: true,
        symbol: true,
        direction: true,
        status: true,
        avgCost: true,
        quantity: true,
        outcome: true,
        realizedPnl: true,
        analystId: true,
      },
    }),
  ]);

  return configs.map((config) => {
    const configRuns = allRuns.filter((r) => r.agentConfigId === config.id);
    const lastRun = configRuns[0] ?? null;

    const configPositions = allPositions.filter(
      (p) => p.analystId === config.id
    );

    const closedPositions = configPositions.filter((p) => p.outcome != null);
    const wins = closedPositions.filter((p) => p.outcome === "WIN").length;
    const winRate = closedPositions.length > 0 ? wins / closedPositions.length : null;
    const totalPnl = closedPositions.reduce(
      (sum, p) => sum + (p.realizedPnl ?? 0),
      0
    );

    const openTrades: AnalystOpenTrade[] = configPositions
      .filter((p) => p.status === "OPEN")
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        ticker: p.symbol,
        direction: p.direction,
        entryPrice: p.avgCost,
        shares: p.quantity,
      }));

    return {
      id: config.id,
      name: config.name,
      enabled: config.enabled,
      analystPrompt: config.analystPrompt,
      description: config.description,
      sectors: config.sectors,
      signalTypes: config.signalTypes,
      holdDurations: config.holdDurations,
      directionBias: config.directionBias,
      minConfidence: config.minConfidence,
      lastRunAt: lastRun?.startedAt ?? null,
      lastRunStatus: lastRun?.status ?? null,
      tradeCount: configPositions.length,
      winRate,
      totalPnl,
      openTrades,
    };
  });
}

// ── getAnalystDetail ──────────────────────────────────────────────────────────

export async function getAnalystDetail(
  analystId: string
): Promise<AnalystDetail | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const config = await prisma.agentConfig.findFirst({
    where: { id: analystId, userId },
  });
  if (!config) return null;

  const [recentRuns, recentPositions, totalRuns, totalTheses, briefings, morningBriefs, monitors] = await Promise.all([
    // Last 20 runs with their theses (join trade info via decisions)
    prisma.researchRun.findMany({
      where: { agentConfigId: analystId, userId },
      orderBy: { startedAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        source: true,
        startedAt: true,
        completedAt: true,
        theses: {
          select: {
            id: true,
            ticker: true,
            direction: true,
            confidenceScore: true,
            reasoningSummary: true,
            holdDuration: true,
            signalTypes: true,
            sourcesUsed: true,
            decisions: {
              take: 1,
              where: { decision: "BUY" },
              select: {
                position: {
                  select: {
                    id: true,
                    status: true,
                    realizedPnl: true,
                    outcome: true,
                  },
                },
              },
            },
          },
          orderBy: { confidenceScore: "desc" },
        },
      },
    }),
    // Last 20 positions attributed to this analyst
    prisma.position.findMany({
      where: { userId, analystId },
      orderBy: { openedAt: "desc" },
      take: 20,
      select: {
        id: true,
        symbol: true,
        direction: true,
        status: true,
        avgCost: true,
        quantity: true,
        closePrice: true,
        realizedPnl: true,
        outcome: true,
        openedAt: true,
        closedAt: true,
        decisions: {
          take: 1,
          select: {
            thesis: {
              select: {
                id: true,
                confidenceScore: true,
                reasoningSummary: true,
              },
            },
          },
        },
      },
    }),
    prisma.researchRun.count({ where: { agentConfigId: analystId, userId } }),
    prisma.thesis.count({
      where: { researchRun: { agentConfigId: analystId }, userId },
    }),
    // Load briefings (most recent 20)
    prisma.analystBriefing.findMany({
      where: { analystId, userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        runId: true,
        narrative: true,
        marketContext: true,
        theses: true,
        trades: true,
        portfolioSnapshot: true,
        strategyNotes: true,
        marketPosture: true,
        watchTomorrow: true,
        unresolvedItems: true,
        selfCorrections: true,
        createdAt: true,
      },
    }),
    // Load morning briefs (most recent 10)
    prisma.morningBrief.findMany({
      where: { analystId },
      orderBy: { date: "desc" },
      take: 10,
      select: {
        id: true,
        date: true,
        marketContext: true,
        portfolioAlerts: true,
        watchlistUpdates: true,
        newOpportunities: true,
        attentionPriority: true,
        riskFlags: true,
        signalCount: true,
        generatedAt: true,
      },
    }),
    // Load monitors (DOMAIN + SEARCH) for intelligence display
    prisma.monitor.findMany({
      where: { analystId },
      select: {
        id: true,
        name: true,
        type: true,
        config: true,
        category: true,
        enabled: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Compute stats from all positions for this analyst
  const [allPositions, avgConfAgg] = await Promise.all([
    prisma.position.findMany({
      where: { userId, analystId },
      select: { outcome: true, realizedPnl: true },
    }),
    prisma.thesis.aggregate({
      where: { researchRun: { agentConfigId: analystId }, userId },
      _avg: { confidenceScore: true },
    }),
  ]);

  const closedPositions = allPositions.filter((p) => p.outcome != null);
  const wins = closedPositions.filter((p) => p.outcome === "WIN").length;
  const losses = closedPositions.filter((p) => p.outcome === "LOSS").length;
  const winRate = closedPositions.length > 0 ? wins / closedPositions.length : null;
  const totalPnl = closedPositions.reduce(
    (sum, p) => sum + (p.realizedPnl ?? 0),
    0
  );
  const winPositions = closedPositions.filter(
    (p) => p.outcome === "WIN" && p.realizedPnl != null
  );
  const lossPositions = closedPositions.filter(
    (p) => p.outcome === "LOSS" && p.realizedPnl != null
  );
  const bestWin =
    winPositions.length > 0
      ? Math.max(...winPositions.map((p) => p.realizedPnl!))
      : null;
  const worstLoss =
    lossPositions.length > 0
      ? Math.min(...lossPositions.map((p) => p.realizedPnl!))
      : null;
  const avgConfidence = avgConfAgg._avg.confidenceScore ?? null;

  // Map monitors into typed arrays for UI display
  const domainMonitors = monitors
    .filter((m) => m.type === "DOMAIN")
    .map((m) => {
      const cfg = (m.config as Record<string, unknown>) ?? {};
      return {
        id: m.id,
        name: m.name,
        domain: (cfg.domain as string) ?? "",
        category: m.category,
        qualityScore: (cfg.qualityScore as number) ?? 3,
        enabled: m.enabled,
      };
    });

  const searchMonitors = monitors
    .filter((m) => m.type === "SEARCH")
    .map((m) => {
      const cfg = (m.config as Record<string, unknown>) ?? {};
      return {
        id: m.id,
        name: m.name,
        query: (cfg.query as string) ?? m.name,
        category: m.category,
        enabled: m.enabled,
      };
    });

  // Map Prisma config (Json fields) → typed AnalystConfig
  const mappedConfig: AnalystConfig = {
    id: config.id,
    userId: config.userId,
    name: config.name,
    enabled: config.enabled,
    analystPrompt: config.analystPrompt,
    description: config.description,
    sectors: config.sectors as string[],
    signalTypes: config.signalTypes as string[],
    holdDurations: config.holdDurations as string[],
    directionBias: config.directionBias,
    minConfidence: config.minConfidence,
    maxOpenPositions: config.maxOpenPositions,
    maxPositionSize: config.maxPositionSize,
    maxRiskPct: config.maxRiskPct,
    minMarketCapTier: config.minMarketCapTier,
    exchanges: (config.exchanges as string[]) ?? [],
    watchlist: (config.watchlist as string[]) ?? [],
    exclusionList: (config.exclusionList as string[]) ?? [],
    industries: (config.industries as string[]) ?? [],
    themes: (config.themes as string[]) ?? [],
    marketCapMin: config.marketCapMin != null ? Number(config.marketCapMin) : null,
    marketCapMax: config.marketCapMax != null ? Number(config.marketCapMax) : null,
    dailyLossLimit: config.dailyLossLimit,
    scheduleTime: config.scheduleTime,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    intelligencePolicy: (config.intelligencePolicy as Record<string, unknown>) ?? null,
    domainMonitors,
    searchMonitors,
  };

  // Map runs: transform theses.decisions[0].position → trade shape for backwards compat
  const mappedRuns: RunWithTheses[] = recentRuns.map((r) => ({
    id: r.id,
    status: r.status,
    source: r.source,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    theses: r.theses.map((th) => {
      const pos = th.decisions[0]?.position;
      return {
        id: th.id,
        ticker: th.ticker,
        direction: th.direction,
        confidenceScore: th.confidenceScore,
        reasoningSummary: th.reasoningSummary,
        holdDuration: th.holdDuration,
        signalTypes: th.signalTypes,
        sourcesUsed: th.sourcesUsed,
        trade: pos
          ? { id: pos.id, status: pos.status, realizedPnl: pos.realizedPnl, outcome: pos.outcome }
          : null,
      };
    }),
  }));

  const mappedTrades: PositionWithThesis[] = recentPositions.map((p) => ({
    id: p.id,
    symbol: p.symbol,
    direction: p.direction,
    status: p.status,
    avgCost: p.avgCost,
    quantity: p.quantity,
    closePrice: p.closePrice,
    realizedPnl: p.realizedPnl,
    outcome: p.outcome,
    openedAt: p.openedAt,
    closedAt: p.closedAt,
    thesis: p.decisions[0]?.thesis ?? { id: "", confidenceScore: 0, reasoningSummary: "" },
  }));

  return {
    config: mappedConfig,
    recentRuns: mappedRuns,
    recentTrades: mappedTrades,
    briefings,
    morningBriefs,
    stats: {
      totalRuns,
      totalTheses,
      totalTrades: allPositions.length,
      winRate,
      totalPnl,
      wins,
      losses,
      bestWin,
      worstLoss,
      avgConfidence,
    },
  };
}

// ── getRecentRunsForDashboard ─────────────────────────────────────────────────

export async function getRecentRunsForDashboard(): Promise<DashboardRun[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const runs = await prisma.researchRun.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: 8,
    select: {
      id: true,
      source: true,
      startedAt: true,
      completedAt: true,
      agentConfigId: true,
      agentConfig: { select: { name: true } },
      theses: {
        select: {
          ticker: true,
          direction: true,
          confidenceScore: true,
          decisions: {
            take: 1,
            where: { decision: "BUY" },
            select: {
              position: {
                select: { id: true, status: true, realizedPnl: true },
              },
            },
          },
        },
        orderBy: { confidenceScore: "desc" },
        take: 8,
      },
    },
  });

  return runs.map((r) => ({
    id: r.id,
    analystId: r.agentConfigId,
    analystName: r.agentConfig?.name ?? null,
    source: r.source,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    theses: r.theses.map((th) => {
      const pos = th.decisions[0]?.position;
      return {
        ticker: th.ticker,
        direction: th.direction,
        confidenceScore: th.confidenceScore,
        trade: pos ? { id: pos.id, status: pos.status, realizedPnl: pos.realizedPnl } : null,
      };
    }),
  }));
}

// ── updateAnalystPrompt ───────────────────────────────────────────────────────

export async function updateAnalystPrompt(
  id: string,
  prompt: string
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");

  await prisma.agentConfig.update({
    where: { id, userId },
    data: { analystPrompt: prompt },
  });

  revalidatePath(`/analysts/${id}`);
}

// ── createAnalystFromWizard ───────────────────────────────────────────────────

export interface WizardConfig {
  analystPrompt: string;
  name: string;
  holdDurations: ("DAY" | "SWING" | "POSITION")[];
  directionBias: "LONG" | "SHORT" | "BOTH";
  maxPositionSize: number;
  minConfidence: number;
}

export async function createAnalystFromWizard(
  data: WizardConfig
): Promise<{ id: string }> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");

  const analyst = await prisma.agentConfig.create({
    data: {
      userId,
      name: data.name,
      enabled: true,
      analystPrompt: data.analystPrompt,
      markets: ["US_EQUITIES"],
      exchanges: ["NASDAQ", "NYSE"],
      sectors: [],
      watchlist: [],
      exclusionList: [],
      maxPositionSize: data.maxPositionSize,
      maxOpenPositions: 5,
      minConfidence: data.minConfidence,
      maxRiskPct: 2,
      dailyLossLimit: 300,
      holdDurations: data.holdDurations,
      directionBias: data.directionBias,
      signalTypes: [],
      minMarketCapTier: "LARGE",
      scheduleTime: "08:00",
      priceCheckFreq: "HOURLY",
      weekendMode: false,
      graduationWinRate: 0.65,
      graduationMinTrades: 50,
      graduationProfitFactor: 1.5,
      realTradingEnabled: false,
      realMaxPosition: data.maxPositionSize,
      emailAlerts: true,
      weeklyDigestEnabled: true,
    },
  });

  return { id: analyst.id };
}

// ── createAnalystFromBuilder (AI chat builder — richer config) ──────────────

interface BuilderConfig {
  name: string;
  analystPrompt: string;
  description?: string;
  directionBias: "LONG" | "SHORT" | "BOTH";
  holdDurations: ("DAY" | "SWING" | "POSITION")[];
  sectors: string[];
  signalTypes: string[];
  minConfidence: number;
  maxPositionSize: number;
  maxOpenPositions: number;
  minMarketCapTier: "LARGE" | "MID" | "SMALL";
  watchlist?: string[];
  exclusionList?: string[];
  // V3: Intelligence layer proposals from the builder
  domainMonitorProposal?: {
    name: string;
    sources: Array<{
      name: string;
      domain: string;
      category: string;
      qualityScore: number;
      reason: string;
    }>;
  };
  intelligenceQueries?: Array<{
    query: string;
    category: string;
    reason: string;
  }>;
  intelligencePolicy?: {
    holdingsAttention: number;
    watchlistAttention: number;
    discoveryAttention: number;
    maxSignalsPerRun?: number;
    maxArtifactReads?: number;
    allowLiveSearch?: boolean;
    liveSearchBudget?: number;
  };
  // Session 3: Universe payload from builder/editor `suggest_config`.
  universe?: {
    sectors?: string[];
    industries?: string[];
    themes?: string[];
    exchanges?: string[];
    marketCapMin?: number;
    marketCapMax?: number;
    priceMin?: number;
    priceMax?: number;
    exclusions?: string[];
  };
}

export async function createAnalystFromBuilder(
  data: BuilderConfig
): Promise<{ id: string }> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");

  // Coerce all values to their expected types — AI tool output can be unpredictable
  const name = String(data.name || "Untitled Analyst");
  const prompt = String(data.analystPrompt || "General market research analyst");
  const posSize = Number(data.maxPositionSize) || 5000;
  const maxPos = Math.round(Number(data.maxOpenPositions) || 5);
  const minConf = Math.round(Number(data.minConfidence) || 70);
  const bias = (["LONG", "SHORT", "BOTH"] as const).includes(data.directionBias as "LONG" | "SHORT" | "BOTH")
    ? data.directionBias
    : "BOTH";
  const holdDurs = Array.isArray(data.holdDurations) ? data.holdDurations : ["SWING"];
  const sectors = Array.isArray(data.sectors) ? data.sectors : [];
  const signals = Array.isArray(data.signalTypes) ? data.signalTypes : [];
  const capTier = (["LARGE", "MID", "SMALL"] as const).includes(data.minMarketCapTier as "LARGE" | "MID" | "SMALL")
    ? data.minMarketCapTier
    : "LARGE";

  console.log(`[analyst] Creating analyst: name="${name}" sectors=${sectors.join(",") || "all"} bias=${bias} posSize=${posSize} minConf=${minConf}`);

  // Parse watchlist: supports both old format (string[]) and new format ({symbol, reason, priority}[])
  const rawWatchlist = Array.isArray(data.watchlist) ? data.watchlist : [];
  const watchlistSymbols: string[] = [];
  const structuredWatchlist: { symbol: string; reason: string; priority: string }[] = [];
  for (const item of rawWatchlist) {
    if (typeof item === "string") {
      watchlistSymbols.push(item.toUpperCase());
    } else if (item && typeof item === "object" && "symbol" in item) {
      const sym = String((item as { symbol: string }).symbol).toUpperCase();
      watchlistSymbols.push(sym);
      structuredWatchlist.push({
        symbol: sym,
        reason: String((item as { reason?: string }).reason ?? "Added during analyst creation"),
        priority: String((item as { priority?: string }).priority ?? "NORMAL"),
      });
    }
  }

  // Build intelligence policy from builder proposal, merging with defaults
  const policyInput = data.intelligencePolicy;
  const intelligencePolicy: IntelligencePolicy = {
    ...DEFAULT_INTELLIGENCE_POLICY,
    ...(policyInput ? {
      holdingsAttention: policyInput.holdingsAttention,
      watchlistAttention: policyInput.watchlistAttention,
      discoveryAttention: policyInput.discoveryAttention,
      ...(policyInput.maxSignalsPerRun != null ? { maxSignalsPerRun: policyInput.maxSignalsPerRun } : {}),
      ...(policyInput.maxArtifactReads != null ? { maxArtifactReads: policyInput.maxArtifactReads } : {}),
      ...(policyInput.allowLiveSearch != null ? { allowLiveSearch: policyInput.allowLiveSearch } : {}),
      ...(policyInput.liveSearchBudget != null ? { liveSearchBudget: policyInput.liveSearchBudget } : {}),
    } : {}),
  };

  // ── Universe payload — maps to AgentConfig fields per B contract ──
  // `universe.sectors/exchanges/exclusions` collapse into the existing
  // `sectors/exchanges/exclusionList` columns. `industries`, `themes`, and
  // `marketCapMin/Max` have dedicated columns. priceMin/priceMax are NOT
  // currently persisted — they're treated as hints for future filtering.
  const universe = data.universe;
  const rawUniverseSectors =
    Array.isArray(universe?.sectors) && universe!.sectors!.length > 0
      ? universe!.sectors!
      : sectors; // fall back to the non-universe sectors field if builder didn't set universe
  // Session A: normalize universe fields at the write boundary so the
  // AgentConfig table only ever stores canonical GICS Title Case sectors /
  // industries and uppercase snake_case themes. Anything the normalizer can't
  // map is dropped silently — same policy as Signal ingestion.
  const universeSectors = normalizeSectors(rawUniverseSectors);
  const universeExchanges = Array.isArray(universe?.exchanges) && universe!.exchanges!.length > 0
    ? universe!.exchanges!
    : ["NASDAQ", "NYSE"];
  const universeExclusions = Array.isArray(universe?.exclusions) ? universe!.exclusions! : [];
  // Combine builder's general exclusionList with universe.exclusions (dedup).
  const combinedExclusions = Array.from(
    new Set([
      ...(Array.isArray(data.exclusionList) ? data.exclusionList : []),
      ...universeExclusions,
    ].map((s) => s.toUpperCase())),
  );
  const industries = normalizeIndustries(
    Array.isArray(universe?.industries) ? universe!.industries! : [],
  );
  const themes = normalizeThemes(
    Array.isArray(universe?.themes) ? universe!.themes! : [],
  );
  const marketCapMin =
    typeof universe?.marketCapMin === "number" && Number.isFinite(universe.marketCapMin)
      ? BigInt(Math.round(universe.marketCapMin))
      : null;
  const marketCapMax =
    typeof universe?.marketCapMax === "number" && Number.isFinite(universe.marketCapMax)
      ? BigInt(Math.round(universe.marketCapMax))
      : null;

  // ── Transactional creation: analyst + watchlist + monitors ──
  // All intelligence setup is atomic — if monitor creation fails midway,
  // the analyst still gets created but without a partial/broken intelligence setup.
  const analyst = await prisma.$transaction(async (tx) => {
    // 1. Create the analyst config (core record)
    const newAnalyst = await tx.agentConfig.create({
      data: {
        userId,
        name,
        description: data.description ?? "",
        enabled: true,
        analystPrompt: prompt,
        markets: ["US_EQUITIES"],
        exchanges: universeExchanges,
        sectors: universeSectors,
        industries,
        themes,
        marketCapMin,
        marketCapMax,
        watchlist: watchlistSymbols,
        exclusionList: combinedExclusions,
        maxPositionSize: posSize,
        maxOpenPositions: maxPos,
        minConfidence: minConf,
        maxRiskPct: 2,
        dailyLossLimit: 300,
        holdDurations: holdDurs,
        directionBias: bias,
        signalTypes: signals,
        minMarketCapTier: capTier,
        scheduleTime: "08:00",
        priceCheckFreq: "HOURLY",
        weekendMode: false,
        graduationWinRate: 0.65,
        graduationMinTrades: 50,
        graduationProfitFactor: 1.5,
        realTradingEnabled: false,
        realMaxPosition: posSize,
        emailAlerts: true,
        weeklyDigestEnabled: true,
        intelligencePolicy: intelligencePolicy as unknown as object,
      },
    });

    // 2. Create structured watchlist items
    if (structuredWatchlist.length > 0) {
      await tx.analystWatchlistItem.createMany({
        data: structuredWatchlist.map((w) => ({
          analystId: newAnalyst.id,
          userId,
          symbol: w.symbol,
          reason: w.reason,
          addedBy: "BUILDER",
          priority: w.priority,
          status: "ACTIVE",
        })),
      });
      console.log(`[analyst] Created ${structuredWatchlist.length} watchlist items for analyst ${newAnalyst.id}`);
    } else if (watchlistSymbols.length > 0) {
      await tx.analystWatchlistItem.createMany({
        data: watchlistSymbols.map((sym) => ({
          analystId: newAnalyst.id,
          userId,
          symbol: sym,
          reason: "Added during analyst creation",
          addedBy: "BUILDER",
          priority: "NORMAL",
          status: "ACTIVE",
        })),
      });
      console.log(`[analyst] Created ${watchlistSymbols.length} watchlist items (legacy format) for analyst ${newAnalyst.id}`);
    }

    // 3. Create domain monitors from domain monitor proposal
    if (data.domainMonitorProposal && data.domainMonitorProposal.sources.length > 0) {
      const proposal = data.domainMonitorProposal;

      for (const src of proposal.sources) {
        const validCategory = (["MARKET", "SECTOR", "COMPANY", "THEMATIC", "SOCIAL", "EVENT"] as const)
          .includes(src.category as SourceCategory) ? src.category : "THEMATIC";
        await tx.monitor.create({
          data: {
            name: src.name,
            type: "DOMAIN",
            method: "perplexity_sonar",
            config: {
              domain: src.domain,
              url: `https://${src.domain}`,
              qualityScore: Math.min(5, Math.max(1, Math.round(src.qualityScore))),
            },
            scope: "ANALYST",
            analystId: newAnalyst.id,
            enabled: true,
            builtIn: false,
            origin: "BUILDER",
            category: validCategory,
          },
        });
      }
      console.log(`[analyst] Created ${proposal.sources.length} domain monitors for analyst ${newAnalyst.id}`);
    }

    // 4. Create search monitors from intelligence queries
    if (data.intelligenceQueries && data.intelligenceQueries.length > 0) {
      for (const q of data.intelligenceQueries) {
        const validCategory = (["MARKET", "SECTOR", "TICKER", "THEMATIC", "EVENT"] as const)
          .includes(q.category as QueryCategory) ? q.category : "THEMATIC";
        await tx.monitor.create({
          data: {
            name: q.query,
            type: "SEARCH",
            method: "perplexity_sonar",
            config: { query: q.query },
            scope: "ANALYST",
            analystId: newAnalyst.id,
            enabled: true,
            builtIn: false,
            origin: "BUILDER",
            category: validCategory,
          },
        });
      }
      console.log(`[analyst] Created ${data.intelligenceQueries.length} search monitors for analyst ${newAnalyst.id}`);
    }

    return newAnalyst;
  });

  console.log(`[analyst] Created analyst id=${analyst.id} name="${name}" policy.holdingsAttn=${intelligencePolicy.holdingsAttention} policy.discoveryAttn=${intelligencePolicy.discoveryAttention}`);
  revalidatePath("/analysts");
  return { id: analyst.id };
}

// ── updateAnalystField (direct inline edit of a single config field) ──────────

type UpdatableField =
  | "directionBias"
  | "minConfidence"
  | "maxPositionSize"
  | "maxOpenPositions"
  // NOTE: maxRiskPct and scheduleTime removed from the editable surface —
  // both are orphan fields at runtime (no code path reads them). If
  // scheduling becomes per-analyst in the future, add scheduleTime back.
  | "holdDurations"
  | "watchlist"
  | "exclusionList"
  | "analystPrompt"
  // ── Universe (B1) ─────────────────────────────────────────
  | "sectors"
  | "industries"
  | "themes"
  | "marketCapMin"
  | "marketCapMax";

/** Fields whose server payload must be coerced to BigInt for the BigInt? columns. */
const BIGINT_FIELDS: ReadonlySet<UpdatableField> = new Set<UpdatableField>([
  "marketCapMin",
  "marketCapMax",
]);

export async function updateAnalystField(
  id: string,
  field: UpdatableField,
  value: unknown,
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");

  // Normalize BigInt-backed Universe fields. UI sends number | null; Prisma
  // wants BigInt | null.
  let storedValue: unknown = value;
  if (BIGINT_FIELDS.has(field)) {
    if (value === null || value === undefined || value === "") {
      storedValue = null;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      storedValue = BigInt(Math.trunc(value));
    } else if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value);
      storedValue = Number.isFinite(n) ? BigInt(Math.trunc(n)) : null;
    } else {
      storedValue = null;
    }
  }

  // Session A: route universe arrays through the canonical normalizers so
  // inline chip edits can't re-seed the table with non-canonical values.
  // The combobox already emits canonical Title Case, but defensive
  // normalization protects against programmatic callers.
  if (field === "sectors" && Array.isArray(value)) {
    storedValue = normalizeSectors(value as string[]);
  } else if (field === "industries" && Array.isArray(value)) {
    storedValue = normalizeIndustries(value as string[]);
  } else if (field === "themes" && Array.isArray(value)) {
    storedValue = normalizeThemes(value as string[]);
  }

  await prisma.agentConfig.update({
    where: { id, userId },
    data: { [field]: storedValue },
  });

  revalidatePath(`/analysts/${id}`);
  revalidatePath("/analysts");
}

// ── updateAnalystWatchlist (add/remove single symbol) ────────────────────────

export async function addToWatchlist(
  id: string,
  symbol: string,
): Promise<string[]> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");

  const config = await prisma.agentConfig.findFirst({
    where: { id, userId },
    select: { watchlist: true },
  });
  if (!config) throw new Error("Analyst not found");

  const current = (config.watchlist as string[]) ?? [];
  const upper = symbol.toUpperCase();
  if (current.includes(upper)) return current;

  const updated = [...current, upper];
  await prisma.agentConfig.update({
    where: { id, userId },
    data: { watchlist: updated },
  });

  revalidatePath(`/analysts/${id}`);
  return updated;
}

export async function removeFromWatchlist(
  id: string,
  symbol: string,
): Promise<string[]> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");

  const config = await prisma.agentConfig.findFirst({
    where: { id, userId },
    select: { watchlist: true },
  });
  if (!config) throw new Error("Analyst not found");

  const current = (config.watchlist as string[]) ?? [];
  const upper = symbol.toUpperCase();
  const updated = current.filter((s) => s !== upper);

  await prisma.agentConfig.update({
    where: { id, userId },
    data: { watchlist: updated },
  });

  revalidatePath(`/analysts/${id}`);
  return updated;
}

// ── deleteAnalyst (cascade delete all related data) ─────────────────────────

export async function deleteAnalyst(analystId: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");

  // Verify ownership
  const config = await prisma.agentConfig.findFirst({
    where: { id: analystId, userId },
  });
  if (!config) throw new Error("Analyst not found");

  // 1. Find all runs for this analyst
  const runs = await prisma.researchRun.findMany({
    where: { agentConfigId: analystId },
    select: { id: true },
  });
  const runIds = runs.map((r) => r.id);

  // 2. Find all positions for this analyst
  const positions = await prisma.position.findMany({
    where: { analystId },
    select: { id: true, symbol: true, status: true },
  });
  const positionIds = positions.map((p) => p.id);

  // 3. Close any open Alpaca positions
  const { closePosition: closeAlpacaPos } = await import("@/lib/alpaca");
  const creds = await resolveAlpacaCredentials(config.userId) ?? undefined;
  for (const pos of positions) {
    if (pos.status === "OPEN") {
      try {
        await closeAlpacaPos(pos.symbol, creds).catch(() => {});
      } catch {
        // Best effort — position may not exist
      }
    }
  }

  // 4. Find theses from those runs
  const theses = await prisma.thesis.findMany({
    where: { researchRunId: { in: runIds } },
    select: { id: true },
  });
  const thesisIds = theses.map((t) => t.id);

  // 5. Delete in dependency order (deepest first)
  await prisma.positionEvent.deleteMany({ where: { positionId: { in: positionIds } } });
  await prisma.tradeDecision.deleteMany({ where: { analystId } });
  await prisma.order.deleteMany({ where: { positionId: { in: positionIds } } });
  await prisma.position.deleteMany({ where: { id: { in: positionIds } } });
  await prisma.thesis.deleteMany({ where: { id: { in: thesisIds } } });
  // RunEvent and RunMessage cascade from ResearchRun (onDelete: Cascade)
  await prisma.analystBriefing.deleteMany({ where: { analystId } });
  await prisma.researchRun.deleteMany({ where: { id: { in: runIds } } });
  await prisma.agentConfig.delete({ where: { id: analystId } });

  revalidatePath("/analysts");
  revalidatePath("/trades");
  revalidatePath("/");
}

// ── updateAnalystFromBuilder (apply AI-suggested config to existing analyst) ──

export async function updateAnalystFromBuilder(
  id: string,
  data: Partial<BuilderConfig>
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.analystPrompt !== undefined) updateData.analystPrompt = data.analystPrompt;
  if (data.directionBias !== undefined) updateData.directionBias = data.directionBias;
  if (data.holdDurations !== undefined) updateData.holdDurations = data.holdDurations;
  if (data.sectors !== undefined) updateData.sectors = normalizeSectors(data.sectors);
  if (data.signalTypes !== undefined) updateData.signalTypes = data.signalTypes;
  if (data.minConfidence !== undefined) updateData.minConfidence = data.minConfidence;
  if (data.maxPositionSize !== undefined) updateData.maxPositionSize = data.maxPositionSize;
  if (data.maxOpenPositions !== undefined) updateData.maxOpenPositions = data.maxOpenPositions;
  if (data.minMarketCapTier !== undefined) updateData.minMarketCapTier = data.minMarketCapTier;
  if (data.exclusionList !== undefined) updateData.exclusionList = data.exclusionList;

  // Session 3: Universe payload — writes directly to AgentConfig columns per
  // the Workstream B contract. Any omitted key leaves the existing value
  // untouched. `universe.exclusions` is merged into `exclusionList` (dedup).
  // Session A: sector/industry/theme arrays are run through the canonical
  // normalizers so AgentConfig never stores legacy SCREAMING_SNAKE or Sonar
  // title casing next to a GICS Title Case value.
  if (data.universe !== undefined) {
    const u = data.universe;
    if (Array.isArray(u.sectors)) updateData.sectors = normalizeSectors(u.sectors);
    if (Array.isArray(u.exchanges)) updateData.exchanges = u.exchanges;
    if (Array.isArray(u.industries)) updateData.industries = normalizeIndustries(u.industries);
    if (Array.isArray(u.themes)) updateData.themes = normalizeThemes(u.themes);
    // $5T ceiling — no real company approaches this, so anything above
    // is definitely a "no bound" sentinel the model slipped through. Cap
    // matches the Zod refine in suggest_config.ts.
    const CAP_CEILING = 5e12;
    if (typeof u.marketCapMin === "number" && Number.isFinite(u.marketCapMin)) {
      // 0 is a sentinel "no floor" the model sometimes sends despite the
      // schema instruction to omit. Treat as null.
      updateData.marketCapMin =
        u.marketCapMin === 0 || u.marketCapMin >= CAP_CEILING
          ? null
          : BigInt(Math.round(u.marketCapMin));
    } else if (u.marketCapMin === null) {
      updateData.marketCapMin = null;
    }
    if (typeof u.marketCapMax === "number" && Number.isFinite(u.marketCapMax)) {
      updateData.marketCapMax =
        u.marketCapMax >= CAP_CEILING ? null : BigInt(Math.round(u.marketCapMax));
    } else if (u.marketCapMax === null) {
      updateData.marketCapMax = null;
    }
    if (Array.isArray(u.exclusions) && u.exclusions.length > 0) {
      const base = Array.isArray(data.exclusionList) ? data.exclusionList : [];
      updateData.exclusionList = Array.from(
        new Set([...base, ...u.exclusions].map((s) => s.toUpperCase())),
      );
    }
  }

  // Handle structured watchlist updates
  if (data.watchlist !== undefined) {
    const rawWatchlist = Array.isArray(data.watchlist) ? data.watchlist : [];
    const watchlistSymbols: string[] = [];
    const structuredItems: { symbol: string; reason: string; priority: string }[] = [];
    for (const item of rawWatchlist) {
      if (typeof item === "string") {
        watchlistSymbols.push(item.toUpperCase());
      } else if (item && typeof item === "object" && "symbol" in item) {
        const sym = String((item as { symbol: string }).symbol).toUpperCase();
        watchlistSymbols.push(sym);
        structuredItems.push({
          symbol: sym,
          reason: String((item as { reason?: string }).reason ?? "Updated via editor"),
          priority: String((item as { priority?: string }).priority ?? "NORMAL"),
        });
      }
    }
    updateData.watchlist = watchlistSymbols;

    // Update the AnalystWatchlistItem table — mark old items REMOVED, create new ones
    if (structuredItems.length > 0 || watchlistSymbols.length > 0) {
      // Soft-remove existing items not in the new list
      const existingItems = await prisma.analystWatchlistItem.findMany({
        where: { analystId: id, status: "ACTIVE" },
        select: { id: true, symbol: true },
      });
      const newSymbolSet = new Set(watchlistSymbols);
      const toRemove = existingItems.filter((i) => !newSymbolSet.has(i.symbol));
      if (toRemove.length > 0) {
        await prisma.analystWatchlistItem.updateMany({
          where: { id: { in: toRemove.map((i) => i.id) } },
          data: { status: "REMOVED", removedAt: new Date(), removeReason: "Removed via editor" },
        });
      }

      // Create new items that don't already exist
      const existingSymbolSet = new Set(existingItems.map((i) => i.symbol));
      const toCreate = (structuredItems.length > 0 ? structuredItems : watchlistSymbols.map((s) => ({ symbol: s, reason: "Updated via editor", priority: "NORMAL" })))
        .filter((w) => !existingSymbolSet.has(w.symbol));
      if (toCreate.length > 0) {
        await prisma.analystWatchlistItem.createMany({
          data: toCreate.map((w) => ({
            analystId: id,
            userId,
            symbol: w.symbol,
            reason: w.reason,
            addedBy: "BUILDER",
            priority: w.priority,
            status: "ACTIVE",
          })),
        });
      }
    }
  }

  // Update intelligence policy on AgentConfig if provided
  if (data.intelligencePolicy) {
    const policyInput = data.intelligencePolicy;
    updateData.intelligencePolicy = {
      ...DEFAULT_INTELLIGENCE_POLICY,
      holdingsAttention: policyInput.holdingsAttention,
      watchlistAttention: policyInput.watchlistAttention,
      discoveryAttention: policyInput.discoveryAttention,
      ...(policyInput.maxSignalsPerRun != null ? { maxSignalsPerRun: policyInput.maxSignalsPerRun } : {}),
      ...(policyInput.maxArtifactReads != null ? { maxArtifactReads: policyInput.maxArtifactReads } : {}),
      ...(policyInput.allowLiveSearch != null ? { allowLiveSearch: policyInput.allowLiveSearch } : {}),
      ...(policyInput.liveSearchBudget != null ? { liveSearchBudget: policyInput.liveSearchBudget } : {}),
    };
  }

  await prisma.agentConfig.update({
    where: { id, userId },
    data: updateData,
  });

  // Create domain monitors from domainMonitorProposal (replace existing BUILDER-origin monitors)
  if (data.domainMonitorProposal && data.domainMonitorProposal.sources.length > 0) {
    // Remove old builder-created domain monitors for this analyst
    await prisma.monitor.deleteMany({
      where: { analystId: id, type: "DOMAIN", origin: "BUILDER" },
    });

    for (const src of data.domainMonitorProposal.sources) {
      const validCategory = (["MARKET", "SECTOR", "COMPANY", "THEMATIC", "SOCIAL", "EVENT"] as const)
        .includes(src.category as SourceCategory) ? src.category : "THEMATIC";
      await prisma.monitor.create({
        data: {
          name: src.name,
          type: "DOMAIN",
          method: "perplexity_sonar",
          config: {
            domain: src.domain,
            url: `https://${src.domain}`,
            qualityScore: Math.min(5, Math.max(1, Math.round(src.qualityScore))),
          },
          scope: "ANALYST",
          analystId: id,
          enabled: true,
          builtIn: false,
          origin: "BUILDER",
          category: validCategory,
        },
      });
    }
    console.log(`[analyst] Replaced domain monitors for analyst ${id}: ${data.domainMonitorProposal.sources.length} created`);
  }

  // Create search monitors from intelligenceQueries — full reset.
  // A rebuild through the Editor is the user intentionally redefining the
  // analyst's search queries from scratch, so we remove BOTH the previous
  // BUILDER-origin monitors AND any BRIEFING_AGENT-origin rows that
  // accumulated from the now-killed post-run auto-generator. Without this
  // second delete, rebuilt analysts still show dozens of stale
  // ticker-specific queries next to their clean new set of 5.
  if (data.intelligenceQueries && data.intelligenceQueries.length > 0) {
    await prisma.monitor.deleteMany({
      where: {
        analystId: id,
        type: "SEARCH",
        origin: { in: ["BUILDER", "BRIEFING_AGENT"] },
      },
    });

    for (const q of data.intelligenceQueries) {
      const validCategory = (["MARKET", "SECTOR", "TICKER", "THEMATIC", "EVENT"] as const)
        .includes(q.category as QueryCategory) ? q.category : "THEMATIC";
      await prisma.monitor.create({
        data: {
          name: q.query,
          type: "SEARCH",
          method: "perplexity_sonar",
          config: { query: q.query },
          scope: "ANALYST",
          analystId: id,
          enabled: true,
          builtIn: false,
          origin: "BUILDER",
          category: validCategory,
        },
      });
    }
    console.log(`[analyst] Replaced search monitors for analyst ${id}: ${data.intelligenceQueries.length} created (any BRIEFING_AGENT legacy rows also purged)`);
  }

  revalidatePath(`/analysts/${id}`);
  revalidatePath("/analysts");
}
