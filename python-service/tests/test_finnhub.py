"""Unit tests for FinnhubService using a mocked Finnhub client."""
import asyncio
from unittest.mock import MagicMock, patch

import pytest

from services.finnhub import FinnhubService


def make_mock_client():
    client = MagicMock()
    client.quote.return_value = {
        "c": 189.50,
        "d": 1.20,
        "dp": 0.64,
        "h": 191.00,
        "l": 188.00,
        "o": 188.50,
        "pc": 188.30,
    }
    client.company_news.return_value = [
        {
            "headline": "Apple hits all-time high",
            "summary": "Shares rose on strong earnings.",
            "source": "Reuters",
            "url": "https://reuters.com/apple",
            "datetime": 1700000000,
        }
    ]
    client.company_profile2.return_value = {
        "name": "Apple Inc",
        "finnhubIndustry": "Technology",
        "marketCapitalization": 3_000_000,
        "exchange": "NASDAQ",
        "country": "US",
    }
    client.company_basic_financials.return_value = {
        "metric": {
            "peNormalizedAnnual": 28.5,
            "pbAnnual": 45.0,
            "marketCapitalization": 3_000_000,
            "52WeekHigh": 199.0,
            "52WeekLow": 164.0,
        }
    }
    client.earnings_calendar.return_value = {
        "earningsCalendar": [
            {"symbol": "AAPL", "date": "2024-02-01", "epsEstimate": 2.10, "revenueEstimate": 120e9},
        ]
    }
    return client


@pytest.fixture
def svc():
    return FinnhubService(client=make_mock_client())


@pytest.mark.asyncio
async def test_get_quote(svc):
    # Patch rate-limit sleep so tests are fast
    with patch("services.finnhub.asyncio.sleep", return_value=None):
        result = await svc.get_quote("AAPL")
    assert result["symbol"] == "AAPL"
    assert result["price"] == 189.50
    assert result["change_pct"] == 0.64


@pytest.mark.asyncio
async def test_get_news_returns_items(svc):
    with patch("services.finnhub.asyncio.sleep", return_value=None):
        news = await svc.get_news("AAPL")
    assert len(news) >= 1
    assert "headline" in news[0]
    assert "url" in news[0]


@pytest.mark.asyncio
async def test_get_company_profile(svc):
    with patch("services.finnhub.asyncio.sleep", return_value=None):
        profile = await svc.get_company_profile("AAPL")
    assert profile["name"] == "Apple Inc"
    assert profile["sector"] == "Technology"


@pytest.mark.asyncio
async def test_get_basic_financials_tier(svc):
    with patch("services.finnhub.asyncio.sleep", return_value=None):
        fin = await svc.get_basic_financials("AAPL")
    assert fin["market_cap_tier"] == "MEGA"
    assert fin["pe_ratio"] == 28.5


@pytest.mark.asyncio
async def test_get_earnings_calendar(svc):
    with patch("services.finnhub.asyncio.sleep", return_value=None):
        cal = await svc.get_earnings_calendar("2024-02-01", "2024-02-07")
    assert len(cal) == 1
    assert cal[0]["symbol"] == "AAPL"
