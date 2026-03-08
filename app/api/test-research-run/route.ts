/**
 * DAV-29: Temporary test route for M3 E2E validation.
 * DELETE THIS FILE after M3 milestone review is complete.
 *
 * Usage: GET /api/test-research-run?ticker=NVDA
 * Returns thesis + trade IDs created in Supabase.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { triggerResearchRun } from "@/lib/actions/research.actions";

export async function GET(req: NextRequest) {
  // Only allow in non-production or with a guard
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_TEST_ROUTE) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const ticker = req.nextUrl.searchParams.get("ticker") ?? "NVDA";

  const result = await triggerResearchRun(user.id, [ticker], "AGENT");
  return NextResponse.json(result);
}
