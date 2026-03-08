import asyncio
import json
import re
import time
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from models import RunRequest, RunResponse, ThesisOutput
from services.finrobot import run_data_cot, run_concept_cot, run_thesis_cot
from services.finnhub import FinnhubService
from services.scanner import get_research_candidates

router = APIRouter()


# ---------------------------------------------------------------------------
# /research/run — batch, non-streaming
# ---------------------------------------------------------------------------

@router.post("/run", response_model=RunResponse)
async def research_run(body: RunRequest):
    started = time.monotonic()
    agent_config = body.agent_config

    tickers = body.tickers
    if not tickers:
        tickers = await get_research_candidates(agent_config)

    sem = asyncio.Semaphore(5)

    async def run_one(ticker: str):
        async with sem:
            try:
                from services.finrobot import run_full_pipeline
                return await asyncio.wait_for(
                    run_full_pipeline(ticker, agent_config), timeout=60.0
                )
            except asyncio.TimeoutError:
                return (
                    ThesisOutput(
                        ticker=ticker,
                        direction="PASS",
                        hold_duration="SWING",
                        confidence_score=0,
                        reasoning_summary="Pipeline timed out after 60s",
                        thesis_bullets=[],
                        risk_flags=["Timeout — pipeline took too long"],
                        signal_types=[],
                        model_used="gpt-4o",
                    ),
                    0,
                )

    results = await asyncio.gather(*[run_one(t) for t in tickers])
    theses = [r[0] for r in results]
    total_tokens = sum(r[1] for r in results)
    passed = sum(1 for t in theses if t.direction == "PASS")

    return RunResponse(
        run_id=str(uuid.uuid4()),
        theses=theses,
        tickers_researched=len(theses),
        tickers_passed=passed,
        total_tokens=total_tokens,
        duration_seconds=round(time.monotonic() - started, 2),
        source=body.source,
    )


# ---------------------------------------------------------------------------
# /research/chat — SSE streaming
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    agent_config: dict = {}


def _extract_ticker(message: str) -> str | None:
    """Best-effort ticker extraction from a natural language message."""
    # Match explicit uppercase tickers: "Research NVDA", "AAPL vs MSFT"
    found = re.findall(r"\b([A-Z]{1,5})\b", message)
    # Exclude common English words that look like tickers
    stopwords = {"I", "A", "AI", "OR", "AND", "FOR", "THE", "IN", "OF", "ON",
                 "VS", "AT", "BY", "IS", "IT", "BE", "DO", "GO", "TO"}
    candidates = [t for t in found if t not in stopwords]
    return candidates[0] if candidates else None


async def _stream_chat(message: str, agent_config: dict) -> AsyncGenerator[dict, None]:
    ticker = _extract_ticker(message)

    if not ticker:
        yield {"data": json.dumps({"type": "error", "text": "Could not identify a ticker in your message. Try: 'Research NVDA for a swing trade'"})}
        return

    finnhub = FinnhubService()

    def event(type_: str, **kwargs) -> dict:
        return {"data": json.dumps({"type": type_, **kwargs})}

    yield event("thinking", text=f"Gathering market data for {ticker}...")
    try:
        data = await run_data_cot(ticker, finnhub)
    except Exception as exc:
        yield event("error", text=f"Failed to gather data: {exc}")
        return

    yield event("thinking", text=f"Analyzing signals for {ticker}...")
    try:
        concept = await run_concept_cot(data, agent_config)
    except Exception as exc:
        yield event("error", text=f"Analysis failed: {exc}")
        return

    if concept.direction == "PASS" or concept.initial_confidence < agent_config.get("minConfidence", 70):
        thesis = ThesisOutput(
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
        )
        yield event("complete", thesis=thesis.model_dump())
        return

    yield event("thinking", text=f"Writing thesis for {ticker} ({concept.direction})...")

    # Stream thesis tokens via OpenAI streaming
    import os
    from openai import AsyncOpenAI
    from services.finrobot import _THESIS_SYSTEM
    _openai = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))

    prompt = f"""Generate a full trade thesis for:
Ticker: {data.ticker} — {data.company_name}
Direction: {concept.direction}
Hold Duration: {concept.hold_duration}
Signals: {', '.join(concept.signal_types)}
Current Price: ${data.price}
Initial Confidence: {concept.initial_confidence}
Analyst Notes: {concept.reasoning_notes}"""

    full_text = ""
    async with _openai.chat.completions.stream(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _THESIS_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
        max_tokens=1024,
    ) as stream:
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                full_text += delta
                yield event("token", text=delta)

    # Parse the complete response into ThesisOutput
    try:
        raw = json.loads(full_text)
        thesis = ThesisOutput(
            ticker=ticker,
            direction=concept.direction,
            hold_duration=concept.hold_duration,
            confidence_score=raw.get("confidence_score", concept.initial_confidence),
            reasoning_summary=raw.get("reasoning_summary", full_text),
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
    except Exception:
        thesis = ThesisOutput(
            ticker=ticker,
            direction=concept.direction,
            hold_duration=concept.hold_duration,
            confidence_score=concept.initial_confidence,
            reasoning_summary=full_text,
            thesis_bullets=[],
            risk_flags=[],
            signal_types=concept.signal_types,
            sector=data.sector or None,
            sources_used=data.sources,
            model_used="gpt-4o",
        )

    yield event("complete", thesis=thesis.model_dump())


@router.post("/chat")
async def research_chat(body: ChatRequest):
    return EventSourceResponse(_stream_chat(body.message, body.agent_config))
