import { NextRequest } from "next/server";

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL ?? "";
const PYTHON_SERVICE_SECRET = process.env.PYTHON_SERVICE_SECRET ?? "";

export async function POST(req: NextRequest) {
  if (!PYTHON_SERVICE_URL) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", text: "Python service not configured" })}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const body = await req.json();

  const upstream = await fetch(`${PYTHON_SERVICE_URL}/research/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Secret": PYTHON_SERVICE_SECRET,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  // Proxy the SSE stream directly to the client
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
