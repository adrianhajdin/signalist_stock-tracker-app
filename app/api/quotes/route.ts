import { NextRequest, NextResponse } from "next/server";

// GET /api/quotes?symbols=SPY,QQQ,IWM
// Used as fallback when Finnhub WebSocket is unavailable (markets closed, rate limit)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols");
  if (!symbolsParam) {
    return NextResponse.json({ quotes: [] });
  }

  const symbols = symbolsParam.split(",").filter(Boolean).slice(0, 20); // cap at 20
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "Finnhub API key not configured" }, { status: 500 });
  }

  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
      const res = await fetch(url, { next: { revalidate: 30 } });
      if (!res.ok) throw new Error(`Finnhub error for ${symbol}: ${res.status}`);
      const data = await res.json();
      return {
        symbol,
        price: data.c ?? 0,       // current price
        change: data.d ?? 0,      // $ change from prev close
        changePct: data.dp ?? 0,  // % change from prev close
        prevClose: data.pc ?? 0,
      };
    })
  );

  const quotes = results
    .map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { symbol: symbols[i], price: 0, change: 0, changePct: 0, prevClose: 0 }
    );

  return NextResponse.json({ quotes });
}
