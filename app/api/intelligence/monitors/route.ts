import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"
import { etTradingDayDate } from "@/lib/market-hours"

// GET /api/intelligence/monitors — list monitors scoped to the current user
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id

  const type = req.nextUrl.searchParams.get("type") // SEARCH | DOMAIN | API
  const scope = req.nextUrl.searchParams.get("scope") // FIRM | ANALYST
  const analystId = req.nextUrl.searchParams.get("analystId")

  const todayStart = etTradingDayDate()

  // Get this user's analyst IDs for filtering
  const userAnalystIds = await prisma.agentConfig.findMany({
    where: { userId },
    select: { id: true },
  })
  const analystIds = userAnalystIds.map((a) => a.id)

  const monitors = await prisma.monitor.findMany({
    where: {
      // Only show valid monitor types (excludes legacy PORTFOLIO/WATCHLIST)
      type: type ?? { in: ["SEARCH", "DOMAIN", "API"] },
      ...(scope ? { scope } : {}),
      ...(analystId ? { analystId } : {}),
      // Scope to user: show monitors linked to their analysts, or FIRM monitors with no analyst
      OR: [
        { analystId: { in: analystIds } },
        { analystId: null, scope: "FIRM" },
      ],
      // Exclude legacy per-ticker monitors (ticker-search-*) — replaced by permanent portfolio/watchlist monitors
      NOT: { id: { startsWith: "ticker-search-" } },
    },
    orderBy: [{ builtIn: "desc" }, { type: "asc" }, { createdAt: "asc" }],
    include: {
      analyst: { select: { id: true, name: true } },
      _count: {
        select: {
          signals: {
            where: { createdAt: { gte: todayStart } },
          },
        },
      },
    },
  })

  // For built-in TICKER-category SEARCH monitors, include the actual tickers being monitored
  const enriched = await Promise.all(
    monitors.map(async (m) => {
      if (m.builtIn && m.category === "TICKER" && m.type === "SEARCH") {
        // Check config or name to determine if this tracks positions or watchlist items
        const trackType = (m.config as Record<string, unknown> | null)?.track as string | undefined
        const isWatchlist = trackType === "watchlist" || m.name.toLowerCase().includes("watchlist")
        if (isWatchlist) {
          const items = await prisma.analystWatchlistItem.findMany({
            where: { status: "ACTIVE", analystId: { in: analystIds } },
            select: { symbol: true, reason: true, priority: true, analystId: true },
          })
          return { ...m, monitoredTickers: items.map((i) => ({ ticker: i.symbol, reason: i.reason, priority: i.priority, analystId: i.analystId })) }
        }
        // Default: track open positions
        const positions = await prisma.position.findMany({
          where: { status: "OPEN", userId },
          select: { symbol: true, direction: true, analystId: true },
          distinct: ["symbol"],
        })
        return { ...m, monitoredTickers: positions.map((p) => ({ ticker: p.symbol, reason: `Open ${p.direction} position`, analystId: p.analystId })) }
      }
      return { ...m, monitoredTickers: null }
    })
  )

  return NextResponse.json(enriched)
}

// POST /api/intelligence/monitors — create a new monitor
const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["SEARCH", "DOMAIN", "API"]),
  method: z.string().default("perplexity_sonar"),
  config: z.record(z.string(), z.unknown()).optional(),
  scope: z.enum(["FIRM", "ANALYST"]).default("FIRM"),
  analystId: z.string().optional(),
  category: z.enum(["MARKET", "SECTOR", "TICKER", "THEMATIC", "EVENT"]).default("MARKET"),
  origin: z.enum(["USER", "BUILDER", "BRIEFING_AGENT"]).default("USER"),
  expiresAt: z.string().datetime().optional(),
  sourceRunId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data
  const monitor = await prisma.monitor.create({
    data: {
      name: data.name,
      type: data.type,
      method: data.method,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: (data.config ?? undefined) as any,
      scope: data.scope,
      analystId: data.analystId ?? null,
      enabled: true,
      builtIn: false,
      origin: data.origin,
      category: data.category,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      sourceRunId: data.sourceRunId ?? null,
    },
  })

  return NextResponse.json(monitor, { status: 201 })
}

// PATCH /api/intelligence/monitors — toggle enabled or update config
const patchSchema = z.object({
  id: z.string(),
  enabled: z.boolean().optional(),
  name: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  category: z.string().optional(),
})

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { id, ...updates } = parsed.data
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  )

  const updated = await prisma.monitor.update({
    where: { id },
    data: filtered,
  })

  return NextResponse.json(updated)
}

// DELETE /api/intelligence/monitors — delete a monitor (prevents deleting built-in)
// Pass ?purge=non-builtin to delete ALL non-built-in monitors (fresh start)
// Pass ?purge=all-non-api to delete all SEARCH + DOMAIN monitors that aren't built-in
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  const purge = req.nextUrl.searchParams.get("purge")

  // Bulk purge modes
  if (purge === "non-builtin") {
    const result = await prisma.monitor.deleteMany({
      where: { builtIn: false },
    })
    return NextResponse.json({ deleted: result.count, mode: "non-builtin" })
  }

  if (purge === "all-non-api") {
    const result = await prisma.monitor.deleteMany({
      where: {
        builtIn: false,
        type: { in: ["SEARCH", "DOMAIN"] },
      },
    })
    return NextResponse.json({ deleted: result.count, mode: "all-non-api" })
  }

  // Single delete
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  const monitor = await prisma.monitor.findUnique({ where: { id } })
  if (!monitor) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }
  if (monitor.builtIn) {
    return NextResponse.json({ error: "Cannot delete built-in monitor. You can disable it instead." }, { status: 403 })
  }

  await prisma.monitor.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
