import { NextRequest, NextResponse } from "next/server"
import { inngest } from "@/lib/inngest/client"

// POST /api/intelligence/trigger — manually trigger an intelligence job
// Body: { job: "market-sweep" | "portfolio-monitor" | "domain-monitor" | "signal-router" | "morning-brief" | "full-pipeline" }

const JOB_EVENTS: Record<string, string> = {
  "market-sweep": "intelligence/market-sweep",
  "portfolio-monitor": "intelligence/portfolio-monitor",
  "domain-monitor": "intelligence/domain-monitor",
  "signal-router": "intelligence/route-signals",
  "morning-brief": "intelligence/generate-briefs",
}

// Full pipeline fires all 5 in order (Inngest will execute them)
const PIPELINE_ORDER = [
  "market-sweep",
  "portfolio-monitor",
  "domain-monitor",
  "signal-router",
  "morning-brief",
]

export async function POST(req: NextRequest) {
  const { job } = (await req.json()) as { job?: string }

  if (!job) {
    return NextResponse.json(
      { error: `Missing job. Valid options: ${[...Object.keys(JOB_EVENTS), "full-pipeline"].join(", ")}` },
      { status: 400 }
    )
  }

  if (job === "full-pipeline") {
    // Fire all pipeline events — Inngest handles execution
    await inngest.send(
      PIPELINE_ORDER.map((j) => ({
        name: JOB_EVENTS[j],
        data: {},
      }))
    )
    return NextResponse.json({ triggered: "full-pipeline", events: PIPELINE_ORDER })
  }

  if (!JOB_EVENTS[job]) {
    return NextResponse.json(
      { error: `Invalid job. Valid options: ${[...Object.keys(JOB_EVENTS), "full-pipeline"].join(", ")}` },
      { status: 400 }
    )
  }

  await inngest.send({ name: JOB_EVENTS[job], data: {} })

  return NextResponse.json({ triggered: job, event: JOB_EVENTS[job] })
}
