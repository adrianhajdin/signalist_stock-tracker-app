import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Optional: filter to a specific analyst
  const body = await req.json().catch(() => ({})) as { agentConfigId?: string };
  const agentConfigId = body.agentConfigId ?? null;

  await inngest.send({
    name: "app/research.run.manual",
    data: {
      userId: user.id,
      ...(agentConfigId ? { agentConfigId } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
