import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/intelligence/batches — list recent job runs with signal counts
export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20")

  const batches = await prisma.signalBatch.findMany({
    orderBy: { startedAt: "desc" },
    take: Math.min(limit, 50),
    include: {
      _count: { select: { signals: true } },
    },
  })

  return NextResponse.json(batches)
}
