import ResearchChat from "@/components/ResearchChat";
import ResearchFeed from "@/components/ResearchFeed";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

type SearchParams = { [key: string]: string | string[] | undefined };

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ResearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const userId = user?.id ?? "";

  // Build Prisma where from URL search params
  const where: Prisma.ThesisWhereInput = { userId };
  const direction = str(sp.direction);
  const confidence = str(sp.confidence);
  const status = str(sp.status);
  const ticker = str(sp.ticker);

  if (direction) where.direction = direction;
  if (confidence === "high") where.confidenceScore = { gte: 70 };
  if (status === "traded") where.trade = { isNot: null };
  if (ticker) where.ticker = { contains: ticker.toUpperCase() };

  const theses = await prisma.thesis.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { trade: true, researchRun: { select: { source: true } } },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Research Feed */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Research Feed</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-generated trade theses
          </p>
        </div>
        <ResearchFeed theses={theses} />
      </div>

      {/* Right: Chat */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Research Chat</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ask the AI to research any stock
          </p>
        </div>
        <ResearchChat userId={userId} />
      </div>
    </div>
  );
}
