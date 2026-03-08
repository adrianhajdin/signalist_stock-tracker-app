"""
FinRobot thesis generation pipeline.

Three-step chain:
  Data-CoT    → parallel Finnhub data collection
  Concept-CoT → GPT-4o identifies signals, direction, initial confidence
  Thesis-CoT  → GPT-4o structured output with full thesis
"""
import asyncio
import logging
import os
import uuid
from datetime import date, timedelta
from typing import Optional

from openai import AsyncOpenAI

from models import ConceptAnalysis, DataContext, SourceItem, ThesisOutput
from services.finnhub import FinnhubService

logger = logging.getLogger(__name__)
_openai = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))

_CONCEPT_SYSTEM = """You are a quantitative research analyst.
Given market data about a stock, identify the trade signal and return a
JSON object with these exact fields:
{
  "direction": "LONG" | "SHORT" | "PASS",
  "hold_duration": "DAY" | "SWING" | "POSITION",
  "signal_types": ["EARNINGS_BEAT","MOMENTUM","SECTOR_ROTATION","MEAN_REVERSION","BREAKOUT","NEWS_CATALYST","MACRO","OTHER"],
  "initial_confidence": <integer 0-100>,
  "reasoning_notes": "<2-3 sentence analysis>",
  "pass_reason": "<reason if PASS, else null>"
}
Be conservative. Prefer PASS when signal is weak."""

_THESIS_SYSTEM = """You are a senior equity analyst generating a trade thesis.
Return a JSON object with these exact fields:
{
  "reasoning_summary": "<2-3 paragraph analysis>",
  "thesis_bullets": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
  "risk_flags": ["<risk 1>", "<risk 2>"],
  "entry_price": <float or null>,
  "target_price": <float or null>,
  "stop_loss": <float or null>,
  "confidence_score": <integer 0-100>
}
thesis_bullets: 3-5 items. risk_flags: 1-3 items.
Price targets must be numbers only (no currency symbols)."""


async def run_data_cot(ticker: str, finnhub: FinnhubService) -> DataContext:
    """Step 1: Parallel Finnhub data collection."""
    today = date.today().isoformat()
    from_date = (date.today() - timedelta(days=3)).isoformat()
    earnings_from = today
    earnings_to = (date.today() + timedelta(days=7)).isoformat()

    quote, profile, financials, news, earnings = await asyncio.gather(
        finnhub.get_quote(ticker),
        finnhub.get_company_profile(ticker),
        finnhub.get_basic_financials(ticker),
        finnhub.get_news(ticker, days_back=3),
        finnhub.get_earnings_calendar(earnings_from, earnings_to),
        return_exceptions=True,
    )

    def safe(v, default):
        return default if isinstance(v, Exception) else v

    quote = safe(quote, {})
    profile = safe(profile, {})
    financials = safe(financials, {})
    news = safe(news, [])
    earnings = safe(earnings, [])

    has_earnings = any(
        e.get("symbol", "").upper() == ticker.upper() for e in earnings
    )
    earnings_date = next(
        (e["date"] for e in earnings if e.get("symbol", "").upper() == ticker.upper()),
        None,
    )

    sources = [
        SourceItem(type="FINANCIAL", provider="FINNHUB", title=f"{ticker} quote", published_at=today),
        SourceItem(type="PROFILE", provider="FINNHUB", title=f"{ticker} company profile", published_at=today),
    ]
    for item in news[:3]:
        sources.append(
            SourceItem(
                type="NEWS",
                provider="FINNHUB",
                title=item.get("headline", "News"),
                url=item.get("url"),
                published_at=str(item.get("datetime", "")),
            )
        )

    return DataContext(
        ticker=ticker,
        price=quote.get("price"),
        change_pct=quote.get("change_pct"),
        company_name=profile.get("name", ticker),
        sector=profile.get("sector", ""),
        market_cap=financials.get("market_cap"),
        market_cap_tier=financials.get("market_cap_tier", "LARGE"),
        pe_ratio=financials.get("pe_ratio"),
        high_52w=financials.get("52w_high"),
        low_52w=financials.get("52w_low"),
        news=news[:5],
        has_upcoming_earnings=has_earnings,
        earnings_date=earnings_date,
        sources=sources,
    )


async def run_concept_cot(
    data: DataContext, agent_config: dict
) -> ConceptAnalysis:
    """Step 2: GPT-4o identifies signals and direction."""
    news_headlines = "\n".join(
        f"- {n.get('headline','')}" for n in data.news[:3]
    )
    prompt = f"""Stock: {data.ticker} ({data.company_name})
Sector: {data.sector}
Price: ${data.price} ({data.change_pct:+.2f}% today)
Market Cap: ${data.market_cap:.0f}M ({data.market_cap_tier})
P/E: {data.pe_ratio}
52-week range: ${data.low_52w} – ${data.high_52w}
Upcoming earnings: {'YES (' + data.earnings_date + ')' if data.has_upcoming_earnings else 'No'}
Recent news:
{news_headlines or 'None'}
Direction bias allowed: {agent_config.get('directionBias', 'BOTH')}
Min confidence threshold: {agent_config.get('minConfidence', 70)}"""

    response = await _openai.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _CONCEPT_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=512,
    )

    import json
    raw = json.loads(response.choices[0].message.content)
    return ConceptAnalysis(**raw)


async def run_thesis_cot(
    data: DataContext,
    concept: ConceptAnalysis,
    total_tokens: list,
) -> ThesisOutput:
    """Step 3: GPT-4o structured thesis synthesis."""
    prompt = f"""Generate a full trade thesis for:
Ticker: {data.ticker} — {data.company_name}
Direction: {concept.direction}
Hold Duration: {concept.hold_duration}
Signals: {', '.join(concept.signal_types)}
Current Price: ${data.price}
52-week High: ${data.high_52w} | Low: ${data.low_52w}
Initial Confidence: {concept.initial_confidence}
Analyst Notes: {concept.reasoning_notes}
Upcoming Earnings: {'YES (' + data.earnings_date + ')' if data.has_upcoming_earnings else 'No'}"""

    response = await _openai.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _THESIS_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.4,
        max_tokens=1024,
    )

    usage = response.usage
    if usage:
        total_tokens[0] += usage.total_tokens
        logger.info(
            "thesis_cot tokens: input=%d output=%d total=%d",
            usage.prompt_tokens,
            usage.completion_tokens,
            usage.total_tokens,
        )

    import json
    raw = json.loads(response.choices[0].message.content)

    return ThesisOutput(
        ticker=data.ticker,
        direction=concept.direction,
        hold_duration=concept.hold_duration,
        confidence_score=raw.get("confidence_score", concept.initial_confidence),
        reasoning_summary=raw.get("reasoning_summary", ""),
        thesis_bullets=raw.get("thesis_bullets", []),
        risk_flags=raw.get("risk_flags", []),
        signal_types=concept.signal_types,
        sector=data.sector or None,
        entry_price=raw.get("entry_price") or data.price,
        target_price=raw.get("target_price"),
        stop_loss=raw.get("stop_loss"),
        sources_used=data.sources,
        model_used="gpt-4o",
    )


async def run_full_pipeline(
    ticker: str,
    agent_config: dict,
    finnhub: Optional[FinnhubService] = None,
) -> tuple[ThesisOutput, int]:
    """
    Orchestrate Data-CoT → Concept-CoT → Thesis-CoT.

    Returns (ThesisOutput, total_tokens_used).
    On any error, returns a PASS thesis rather than raising.
    """
    if finnhub is None:
        finnhub = FinnhubService()

    min_confidence = agent_config.get("minConfidence", 70)
    total_tokens = [0]

    try:
        data = await run_data_cot(ticker, finnhub)

        concept = await run_concept_cot(data, agent_config)
        logger.info(
            "%s concept: direction=%s confidence=%d",
            ticker, concept.direction, concept.initial_confidence,
        )

        # Short-circuit: below confidence threshold → PASS without spending
        # on Thesis-CoT
        if concept.direction == "PASS" or concept.initial_confidence < min_confidence:
            return (
                ThesisOutput(
                    ticker=ticker,
                    direction="PASS",
                    hold_duration=concept.hold_duration,
                    confidence_score=concept.initial_confidence,
                    reasoning_summary=concept.pass_reason or concept.reasoning_notes,
                    thesis_bullets=[],
                    risk_flags=[],
                    signal_types=concept.signal_types,
                    sector=data.sector or None,
                    sources_used=data.sources,
                    model_used="gpt-4o",
                ),
                total_tokens[0],
            )

        thesis = await run_thesis_cot(data, concept, total_tokens)
        return thesis, total_tokens[0]

    except Exception as exc:
        logger.exception("Pipeline error for %s: %s", ticker, exc)
        return (
            ThesisOutput(
                ticker=ticker,
                direction="PASS",
                hold_duration="SWING",
                confidence_score=0,
                reasoning_summary=f"Pipeline error: {exc}",
                thesis_bullets=[],
                risk_flags=["Pipeline error — review logs"],
                signal_types=[],
                model_used="gpt-4o",
            ),
            total_tokens[0],
        )
