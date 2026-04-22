import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/intelligence/routes — analyst signal route summary
export async function GET() {
  // Group routes by analyst with counts by relevance tier
  const analysts = await prisma.agentConfig.findMany({
    where: { enabled: true },
    select: {
      id: true,
      name: true,
      _count: {
        select: { signalRoutes: true },
      },
    },
  })

  const result = await Promise.all(
    analysts.map(async (analyst) => {
      const routes = await prisma.analystSignalRoute.findMany({
        where: { analystId: analyst.id },
        select: { relevanceScore: true, status: true },
        orderBy: { routedAt: "desc" },
        take: 200,
      })

      const high = routes.filter((r) => r.relevanceScore >= 60).length
      const medium = routes.filter((r) => r.relevanceScore >= 30 && r.relevanceScore < 60).length
      const low = routes.filter((r) => r.relevanceScore < 30).length
      const pending = routes.filter((r) => r.status === "PENDING").length
      const read = routes.filter((r) => r.status === "READ").length

      return {
        analystId: analyst.id,
        analystName: analyst.name,
        totalRoutes: analyst._count.signalRoutes,
        high,
        medium,
        low,
        pending,
        read,
      }
    })
  )

  return NextResponse.json(result)
}
