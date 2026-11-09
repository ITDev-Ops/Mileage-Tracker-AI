"""
Unit and Integration Tests for Dynamic Model Adapter
===================================================
Tests dynamic model discovery, deprecation quarantine, transient outage cooldown,
failover cascading, and zero-crash rule heuristics.
"""

import sys
import os
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock

# Ensure project root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ["TESTING"] = "1"

from backend.dynamic_models import (
    DynamicModelRegistry,
    model_registry,
    call_gemini_dynamic,
    call_openai_dynamic,
    fallback_classify_trip,
    clean_json_text
)


def test_clean_json_text():
    raw_markdown = "```json\n{\"classification\": \"business\", \"confidence\": 0.95}\n```"
    cleaned = clean_json_text(raw_markdown)
    assert cleaned == '{"classification": "business", "confidence": 0.95}'

    plain = '{"key": "value"}'
    assert clean_json_text(plain) == '{"key": "value"}'


def test_fallback_classify_trip():
    # Medical test
    med = fallback_classify_trip("123 Main St", "Dr. Smith Clinic, 400 Health Ave", 4.5)
    assert med["classification"] == "medical"
    assert med["confidence"] > 0.8

    # Charity test
    charity = fallback_classify_trip("Home", "Community Food Bank Shelter", 8.2)
    assert charity["classification"] == "charity"
    assert charity["confidence"] > 0.8

    # Business test
    biz = fallback_classify_trip("Office HQ", "Client Site Depot B", 15.0)
    assert biz["classification"] == "business"
    assert biz["confidence"] > 0.8

    # Default personal test
    short_trip = fallback_classify_trip("Home", "Local Park", 2.0)
    assert short_trip["classification"] == "personal"


def test_dynamic_model_registry_queue_and_quarantine():
    reg = DynamicModelRegistry()
    queue = reg.get_gemini_candidate_queue()
    assert len(queue) > 0
    first_model = queue[0]

    # Mark first model as deprecated
    reg.mark_gemini_deprecated(first_model, "Model deprecated test")
    assert first_model in reg._deprecated_gemini

    new_queue = reg.get_gemini_candidate_queue()
    assert first_model not in new_queue
    assert len(new_queue) == len(queue) - 1

    # Mark second model as cooling down
    second_model = new_queue[0]
    reg.mark_gemini_cooldown(second_model, 60.0)
    third_queue = reg.get_gemini_candidate_queue()
    assert second_model not in third_queue

    # Mark success on a model (should un-deprecate and become #1 preferred)
    reg.mark_gemini_success("gemini-3-flash-preview")
    assert reg._preferred_gemini == "gemini-3-flash-preview"
    assert reg.get_gemini_candidate_queue()[0] == "gemini-3-flash-preview"


def test_call_gemini_dynamic_adaptation():
    """Simulates first model failing with 404 (deprecated), second succeeding with 200."""
    async def run():
        with patch.dict("os.environ", {"GEMINI_API_KEY": "test-key-123"}):
            model_registry._discovered_gemini_models = ["gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"]
            model_registry._discovered_gemini_expires = 9999999999.0

            mock_resp_404 = MagicMock()
            mock_resp_404.status_code = 404
            mock_resp_404.text = "models/gemini-2.5-flash is no longer available. Deprecated."

            mock_resp_200 = MagicMock()
            mock_resp_200.status_code = 200
            mock_resp_200.json.return_value = {
                "candidates": [{
                    "content": {"parts": [{"text": "{\"status\": \"adapted_ok\"}"}]}
                }]
            }

            mock_client = AsyncMock()
            mock_client.is_closed = False
            mock_client.post.side_effect = [mock_resp_404, mock_resp_200]
            model_registry._http_client = mock_client

            res = await call_gemini_dynamic({"contents": [{"parts": [{"text": "hi"}]}]})
            assert res == mock_resp_200.json()
            assert mock_client.post.call_count == 2
            model_registry._http_client = None

    asyncio.run(run())


def test_call_gemini_dynamic_temporary_outage_failover():
    """Simulates first model failing with 503 (high demand), second succeeding."""
    async def run():
        with patch.dict("os.environ", {"GEMINI_API_KEY": "test-key-123"}):
            model_registry._discovered_gemini_models = ["gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"]
            model_registry._discovered_gemini_expires = 9999999999.0

            mock_resp_503 = MagicMock()
            mock_resp_503.status_code = 503
            mock_resp_503.text = "This model is experiencing high demand. 503 UNAVAILABLE."

            mock_resp_200 = MagicMock()
            mock_resp_200.status_code = 200
            mock_resp_200.json.return_value = {
                "candidates": [{
                    "content": {"parts": [{"text": "{\"status\": \"recovered\"}"}]}
                }]
            }

            mock_client = AsyncMock()
            mock_client.is_closed = False
            mock_client.post.side_effect = [mock_resp_503, mock_resp_200]
            model_registry._http_client = mock_client

            res = await call_gemini_dynamic({"contents": [{"parts": [{"text": "hi"}]}]})
            assert res == mock_resp_200.json()
            assert mock_client.post.call_count == 2
            model_registry._http_client = None

    asyncio.run(run())


def test_openai_candidate_queue_and_status():
    reg = DynamicModelRegistry()
    q = reg.get_openai_candidate_queue()
    assert len(q) >= 2
    top = q[0]
    reg.mark_openai_deprecated(top, "Model deprecated")
    assert top in reg._deprecated_openai
    assert top not in reg.get_openai_candidate_queue()

    status = reg.get_status()
    assert "gemini" in status
    assert "openai" in status
    assert top in status["openai"]["deprecated_models"]


if __name__ == "__main__":
    test_clean_json_text()
    print("test_clean_json_text passed")
    test_fallback_classify_trip()
    print("test_fallback_classify_trip passed")
    test_dynamic_model_registry_queue_and_quarantine()
    print("test_dynamic_model_registry_queue_and_quarantine passed")
    test_call_gemini_dynamic_adaptation()
    print("test_call_gemini_dynamic_adaptation passed")
    test_call_gemini_dynamic_temporary_outage_failover()
    print("test_call_gemini_dynamic_temporary_outage_failover passed")
    test_openai_candidate_queue_and_status()
    print("test_openai_candidate_queue_and_status passed")
    print("\nALL 6 UNIT TESTS PASSED SUCCESSFULLY!")
