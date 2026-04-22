import { NextRequest, NextResponse } from "next/server";

// GET /api/stocks/search?q=NVDA
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ results: [] }, { status: 500 });
  }

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  try {
    const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`Finnhub ${res.status}`);
    const data = await res.json();
    const results = (Array.isArray(data?.result) ? data.result : [])
      .filter((r: { type?: string }) => r.type === "Common Stock")
      .slice(0, 10)
      .map((r: { symbol: string; description?: string }) => ({
        symbol: r.symbol,
        description: r.description ?? r.symbol,
      }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
