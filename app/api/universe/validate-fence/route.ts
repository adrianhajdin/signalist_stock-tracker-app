import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeSectors,
  normalizeIndustries,
  normalizeThemes,
} from "@/lib/universe/canonical";

// POST /api/universe/validate-fence
// Body: { sectors?, industries?, themes?, lookbackDays? }
// Returns { count } — how many signals in the last N days would have
// matched this fence. Mirrors discover_signals_for_fence's match semantics
// (OR within dim, AND across — empty dim = no filter) but runs without the
// tool envelope so the Editor panel can call it post-apply for validation.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    sectors?: string[];
    industries?: string[];
    themes?: string[];
    lookbackDays?: number;
  };

  const sectors = normalizeSectors(body.sectors ?? []);
  const industries = normalizeIndustries(body.industries ?? []);
  const themes = normalizeThemes(body.themes ?? []);
  const lookbackDays = Math.max(1, Math.min(30, body.lookbackDays ?? 7));
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // AND across dimensions; empty dimension = no filter.
  const andClauses: Array<Record<string, unknown>> = [];
  if (sectors.length > 0) andClauses.push({ sectors: { hasSome: sectors } });
  if (industries.length > 0) andClauses.push({ industries: { hasSome: industries } });
  if (themes.length > 0) andClauses.push({ themes: { hasSome: themes } });

  if (andClauses.length === 0) {
    return NextResponse.json({ count: 0, lookbackDays, empty: true });
  }

  const count = await prisma.signal.count({
    where: { createdAt: { gte: since }, AND: andClauses },
  });

  return NextResponse.json({
    count,
    lookbackDays,
    fence: { sectors, industries, themes },
  });
}
