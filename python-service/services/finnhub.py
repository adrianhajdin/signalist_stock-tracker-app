"""Finnhub data fetcher with async wrapper and rate limiting."""
import asyncio
import os
from datetime import date, timedelta
from typing import Any

import finnhub

# Finnhub free tier: 60 req/min — enforce 1s between calls
_RATE_LIMIT_SECS = 1.0
_lock = asyncio.Lock()


def _sync_client() -> finnhub.Client:
    api_key = os.getenv("FINNHUB_API_KEY", "")
    return finnhub.Client(api_key=api_key)


async def _call(fn, *args, **kwargs) -> Any:
    """Run a synchronous Finnhub call with rate limiting."""
    async with _lock:
        result = await asyncio.to_thread(fn, *args, **kwargs)
        await asyncio.sleep(_RATE_LIMIT_SECS)
        return result


class FinnhubService:
    def __init__(self, client=None):
        self.client = client or _sync_client()

    async def get_quote(self, symbol: str) -> dict:
        """Current price, change, % change."""
        raw = await _call(self.client.quote, symbol)
        return {
            "symbol": symbol,
            "price": raw.get("c"),
            "change": raw.get("d"),
            "change_pct": raw.get("dp"),
            "high": raw.get("h"),
            "low": raw.get("l"),
            "open": raw.get("o"),
            "prev_close": raw.get("pc"),
        }

    async def get_news(self, symbol: str, days_back: int = 3) -> list[dict]:
        """Recent company news."""
        from_date = (date.today() - timedelta(days=days_back)).isoformat()
        to_date = date.today().isoformat()
        raw = await _call(self.client.company_news, symbol, _from=from_date, to=to_date)
        return [
            {
                "headline": item.get("headline", ""),
                "summary": item.get("summary", ""),
                "source": item.get("source", ""),
                "url": item.get("url", ""),
                "datetime": item.get("datetime"),
            }
            for item in (raw or [])
        ]

    async def get_company_profile(self, symbol: str) -> dict:
        """Name, sector, market cap."""
        raw = await _call(self.client.company_profile2, symbol=symbol)
        return {
            "name": raw.get("name", ""),
            "sector": raw.get("finnhubIndustry", ""),
            "market_cap": raw.get("marketCapitalization"),
            "exchange": raw.get("exchange", ""),
            "country": raw.get("country", ""),
        }

    async def get_earnings_calendar(self, from_date: str, to_date: str) -> list[dict]:
        """Upcoming earnings reports."""
        raw = await _call(
            self.client.earnings_calendar,
            _from=from_date,
            to=to_date,
            symbol="",
            international=False,
        )
        items = raw.get("earningsCalendar", []) if isinstance(raw, dict) else []
        return [
            {
                "symbol": item.get("symbol", ""),
                "date": item.get("date", ""),
                "eps_estimate": item.get("epsEstimate"),
                "revenue_estimate": item.get("revenueEstimate"),
            }
            for item in items
        ]

    async def scan_trending_tickers(self) -> list[str]:
        """Most active / moving stocks.
        
        Finnhub free tier lacks a direct movers endpoint; returns a curated
        list of high-liquidity names as a fallback. Scanner enriches this
        further with watchlist and earnings tickers.
        """
        return ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AMD"]

    async def get_basic_financials(self, symbol: str) -> dict:
        """P/E, P/B, market cap tier."""
        raw = await _call(self.client.company_basic_financials, symbol, "all")
        metric = raw.get("metric", {}) if isinstance(raw, dict) else {}
        market_cap = metric.get("marketCapitalization", 0)
        if market_cap >= 200_000:
            tier = "MEGA"
        elif market_cap >= 10_000:
            tier = "LARGE"
        elif market_cap >= 2_000:
            tier = "MID"
        else:
            tier = "SMALL"
        return {
            "pe_ratio": metric.get("peNormalizedAnnual"),
            "pb_ratio": metric.get("pbAnnual"),
            "market_cap": market_cap,
            "market_cap_tier": tier,
            "52w_high": metric.get("52WeekHigh"),
            "52w_low": metric.get("52WeekLow"),
        }
