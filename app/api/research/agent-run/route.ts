import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/research/agent-run
 * Creates a ResearchRun row and returns its ID.
 * The actual research happens via the LLM agent on the run page.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    console.warn("[agent-run] Unauthorized request");
    return new Response("Unauthorized", { status: 401 });
  }

  const { agentConfigId } = (await req.json()) as {
    agentConfigId?: string;
  };

  console.log(`[agent-run] Creating run for user=${user.id} agentConfigId=${agentConfigId ?? "none"}`);

  // Load agent config if provided
  const agentConfig = agentConfigId
    ? await prisma.agentConfig
        .findFirst({ where: { id: agentConfigId, userId: user.id } })
        .catch((err) => {
          console.error("[agent-run] Failed to load config:", err);
          return null;
        })
    : null;

  try {
    // Prevent concurrent runs for the same analyst — two simultaneous runs
    // can race past duplicate-position checks and create conflicting trades.
    if (agentConfigId) {
      const existingRun = await prisma.researchRun.findFirst({
        where: {
          agentConfigId: agentConfigId,
          status: "RUNNING",
        },
        select: { id: true, startedAt: true },
      });
      if (existingRun) {
        console.warn(`[agent-run] BLOCKED: analyst ${agentConfigId} already has RUNNING run ${existingRun.id}`);
        return Response.json(
          { error: "This analyst already has a run in progress.", existingRunId: existingRun.id },
          { status: 409 },
        );
      }
    }

    const run = await prisma.researchRun.create({
      data: {
        userId: user.id,
        source: "MANUAL",
        status: "RUNNING",
        parameters: agentConfig
          ? ({
              analystName: agentConfig.name,
              agentMode: true,
            } as object)
          : ({ agentMode: true } as object),
        ...(agentConfig ? { agentConfigId: agentConfig.id } : {}),
      },
    });

    console.log(`[agent-run] Created run=${run.id} analyst=${agentConfig?.name ?? "none"}`);
    return Response.json({ runId: run.id });
  } catch (err) {
    console.error("[agent-run] Failed to create run:", err);
    return new Response("Failed to create run", { status: 500 });
  }
}
