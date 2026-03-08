"""Market scanner — builds the list of tickers to research each run."""
from datetime import date, timedelta

from services.finnhub import FinnhubService

MAX_CANDIDATES = 10


async def get_research_candidates(agent_config: dict) -> list[str]:
    """
    Combine trending tickers + upcoming earnings + watchlist, then filter
    by exchange / sector / market-cap rules from agent_config.

    Returns 3–10 ticker symbols, hard-capped at 10 to control API costs.
    """
    finnhub = FinnhubService()
    seen: set[str] = set()
    candidates: list[str] = []

    # 1. Agent watchlist gets top priority
    for t in agent_config.get("watchlist", []):
        _add(t, seen, candidates)

    # 2. Upcoming earnings in the next 5 days (high-signal catalyst)
    today = date.today()
    from_date = today.isoformat()
    to_date = (today + timedelta(days=5)).isoformat()
    try:
        earnings = await finnhub.get_earnings_calendar(from_date, to_date)
        for item in earnings[:20]:
            _add(item["symbol"], seen, candidates)
    except Exception:
        pass

    # 3. Trending / high-liquidity names as a floor
    try:
        trending = await finnhub.scan_trending_tickers()
        for t in trending:
            _add(t, seen, candidates)
    except Exception:
        pass

    # Filter by exchange and sector if specified
    exclusion_list = {t.upper() for t in agent_config.get("exclusionList", [])}
    allowed_sectors = {s.upper() for s in agent_config.get("sectors", [])}
    min_cap_tier = agent_config.get("minMarketCapTier", "LARGE")
    cap_tier_rank = {"MEGA": 4, "LARGE": 3, "MID": 2, "SMALL": 1}
    min_rank = cap_tier_rank.get(min_cap_tier, 3)

    filtered: list[str] = []
    for ticker in candidates:
        if ticker.upper() in exclusion_list:
            continue
        if len(filtered) >= MAX_CANDIDATES:
            break
        if not allowed_sectors and min_rank <= 3:
            # No sector/cap filter configured — include everything
            filtered.append(ticker)
            continue
        try:
            profile = await finnhub.get_company_profile(ticker)
            financials = await finnhub.get_basic_financials(ticker)
            sector = profile.get("sector", "").upper()
            tier = financials.get("market_cap_tier", "SMALL")
            if allowed_sectors and sector not in allowed_sectors:
                continue
            if cap_tier_rank.get(tier, 1) < min_rank:
                continue
            filtered.append(ticker)
        except Exception:
            filtered.append(ticker)  # include on error rather than drop

    # Guarantee minimum of 3
    if len(filtered) < 3:
        fallback = [t for t in candidates if t not in filtered]
        filtered.extend(fallback[: 3 - len(filtered)])

    return filtered[:MAX_CANDIDATES]


def _add(ticker: str, seen: set[str], out: list[str]) -> None:
    t = ticker.upper().strip()
    if t and t not in seen:
        seen.add(t)
        out.append(t)
