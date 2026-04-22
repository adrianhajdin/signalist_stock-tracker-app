"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ── Auth helper ──────────────────────────────────────────────────────────────

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface WatchlistItemView {
  id: string;
  symbol: string;
  reason: string;
  notes: string | null;
  addedBy: string;
  priority: string;
  status: string;
  thesisDirection: string | null;
  targetPrice: number | null;
  stopPrice: number | null;
  conviction: number | null;
  catalyst: string | null;
  lastReviewedAt: Date | null;
  createdAt: Date;
  thesisCount: number;
  latestThesis: {
    direction: string;
    confidenceScore: number;
    createdAt: Date;
  } | null;
}

// ── Legacy compat (used by old user-level watchlist) ─────────────────────────

export async function getWatchlistSymbolsByEmail(
  email: string,
): Promise<string[]> {
  if (!email) return [];
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { watchlist: { select: { symbol: true } } },
    });
    return user?.watchlist.map((w) => w.symbol) ?? [];
  } catch (err) {
    console.error("getWatchlistSymbolsByEmail error:", err);
    return [];
  }
}

// ── Stock page: analyst watchlist status ─────────────────────────────────────

export interface AnalystWatchlistStatus {
  id: string;
  name: string;
  isWatched: boolean;
}

/** Get all analysts for the current user with whether each is watching this symbol. */
export async function getWatchlistStatusForSymbol(
  symbol: string,
): Promise<AnalystWatchlistStatus[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const upper = symbol.toUpperCase();

  const analysts = await prisma.agentConfig.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      watchlistItems: {
        where: { symbol: upper, status: "ACTIVE" },
        select: { id: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return analysts.map((a) => ({
    id: a.id,
    name: a.name,
    isWatched: a.watchlistItems.length > 0,
  }));
}

// ── Queries ──────────────────────────────────────────────────────────────────

/** Get all active watchlist items for an analyst, with thesis counts. */
export async function getWatchlistItems(
  analystId: string,
): Promise<WatchlistItemView[]> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");

  const items = await prisma.analystWatchlistItem.findMany({
    where: { analystId, userId, status: "ACTIVE" },
    orderBy: [
      { priority: "asc" }, // HIGH first (alphabetically: H < L < N)
      { createdAt: "desc" },
    ],
  });

  if (items.length === 0) return [];

  // Get thesis counts and latest thesis per symbol for this analyst
  const symbols = items.map((i) => i.symbol);
  const runIds = await prisma.researchRun.findMany({
    where: { agentConfigId: analystId, userId },
    select: { id: true },
  });
  const runIdList = runIds.map((r) => r.id);

  const theses =
    runIdList.length > 0
      ? await prisma.thesis.findMany({
          where: {
            userId,
            ticker: { in: symbols },
            researchRunId: { in: runIdList },
          },
          select: {
            ticker: true,
            direction: true,
            confidenceScore: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

  // Group by symbol
  const thesisBySymbol = new Map<
    string,
    { count: number; latest: (typeof theses)[0] | null }
  >();
  for (const t of theses) {
    const existing = thesisBySymbol.get(t.ticker);
    if (existing) {
      existing.count++;
    } else {
      thesisBySymbol.set(t.ticker, { count: 1, latest: t });
    }
  }

  return items.map((item) => {
    const thesisData = thesisBySymbol.get(item.symbol);
    return {
      id: item.id,
      symbol: item.symbol,
      reason: item.reason,
      notes: item.notes,
      addedBy: item.addedBy,
      priority: item.priority,
      status: item.status,
      thesisDirection: item.thesisDirection,
      targetPrice: item.targetPrice,
      stopPrice: item.stopPrice,
      conviction: item.conviction,
      catalyst: item.catalyst,
      lastReviewedAt: item.lastReviewedAt,
      createdAt: item.createdAt,
      thesisCount: thesisData?.count ?? 0,
      latestThesis: thesisData?.latest
        ? {
            direction: thesisData.latest.direction,
            confidenceScore: thesisData.latest.confidenceScore,
            createdAt: thesisData.latest.createdAt,
          }
        : null,
    };
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

/** Add a stock to an analyst's watchlist. Reactivates if previously removed. */
export async function addWatchlistItem(
  analystId: string,
  symbol: string,
  reason: string = "Added manually",
  addedBy: string = "USER",
  priority: string = "NORMAL",
): Promise<WatchlistItemView> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");

  // Verify analyst ownership
  const analyst = await prisma.agentConfig.findFirst({
    where: { id: analystId, userId },
    select: { id: true },
  });
  if (!analyst) throw new Error("Analyst not found");

  const upper = symbol.toUpperCase();

  // Check for existing ACTIVE item
  const existing = await prisma.analystWatchlistItem.findFirst({
    where: { analystId, symbol: upper, status: "ACTIVE" },
  });
  if (existing) {
    return {
      id: existing.id,
      symbol: existing.symbol,
      reason: existing.reason,
      notes: existing.notes,
      addedBy: existing.addedBy,
      priority: existing.priority,
      status: existing.status,
      thesisDirection: existing.thesisDirection,
      targetPrice: existing.targetPrice,
      stopPrice: existing.stopPrice,
      conviction: existing.conviction,
      catalyst: existing.catalyst,
      lastReviewedAt: existing.lastReviewedAt,
      createdAt: existing.createdAt,
      thesisCount: 0,
      latestThesis: null,
    };
  }

  // Create new item
  const item = await prisma.analystWatchlistItem.create({
    data: {
      analystId,
      userId,
      symbol: upper,
      reason,
      addedBy,
      priority,
      status: "ACTIVE",
    },
  });

  // Keep the legacy String[] in sync
  await syncLegacyWatchlist(analystId);

  revalidatePath(`/analysts/${analystId}`);
  return {
    id: item.id,
    symbol: item.symbol,
    reason: item.reason,
    notes: item.notes,
    addedBy: item.addedBy,
    priority: item.priority,
    status: item.status,
    thesisDirection: item.thesisDirection,
    targetPrice: item.targetPrice,
    stopPrice: item.stopPrice,
    conviction: item.conviction,
    catalyst: item.catalyst,
    lastReviewedAt: item.lastReviewedAt,
    createdAt: item.createdAt,
    thesisCount: 0,
    latestThesis: null,
  };
}

/** Remove a stock from an analyst's watchlist (soft delete). */
export async function removeWatchlistItem(
  analystId: string,
  symbol: string,
  removeReason: string = "Removed manually",
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");

  const upper = symbol.toUpperCase();

  const item = await prisma.analystWatchlistItem.findFirst({
    where: { analystId, symbol: upper, status: "ACTIVE", userId },
  });
  if (!item) return;

  await prisma.analystWatchlistItem.update({
    where: { id: item.id },
    data: {
      status: "REMOVED",
      removedAt: new Date(),
      removeReason,
    },
  });

  await syncLegacyWatchlist(analystId);
  revalidatePath(`/analysts/${analystId}`);
}

/** Update priority or notes on a watchlist item. */
export async function updateWatchlistItem(
  itemId: string,
  data: { priority?: string; notes?: string; reason?: string },
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Not authenticated");

  await prisma.analystWatchlistItem.update({
    where: { id: itemId, userId },
    data: {
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.reason !== undefined ? { reason: data.reason } : {}),
    },
  });
}

/** Graduate a watchlist item (stock was traded). Called by place_trade tool. */
export async function graduateWatchlistItem(
  analystId: string,
  symbol: string,
): Promise<void> {
  const upper = symbol.toUpperCase();

  const item = await prisma.analystWatchlistItem.findFirst({
    where: { analystId, symbol: upper, status: "ACTIVE" },
  });
  if (!item) return;

  await prisma.analystWatchlistItem.update({
    where: { id: item.id },
    data: {
      status: "GRADUATED",
      removeReason: "Promoted to active position",
      removedAt: new Date(),
    },
  });

  await syncLegacyWatchlist(analystId);
}

/** Mark a watchlist item as reviewed (updates lastReviewedAt). */
export async function markWatchlistReviewed(
  analystId: string,
  symbol: string,
): Promise<void> {
  const upper = symbol.toUpperCase();

  await prisma.analystWatchlistItem.updateMany({
    where: { analystId, symbol: upper, status: "ACTIVE" },
    data: { lastReviewedAt: new Date() },
  });
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Keep AgentConfig.watchlist String[] in sync with the new table. */
async function syncLegacyWatchlist(analystId: string): Promise<void> {
  const activeItems = await prisma.analystWatchlistItem.findMany({
    where: { analystId, status: "ACTIVE" },
    select: { symbol: true },
  });
  const symbols = activeItems.map((i) => i.symbol);
  await prisma.agentConfig.update({
    where: { id: analystId },
    data: { watchlist: symbols },
  });
}
