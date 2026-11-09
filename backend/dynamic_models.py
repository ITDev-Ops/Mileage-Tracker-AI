"""
Mileage Tracker AI - Dynamic Model Manager & Self-Adapting LLM Engine
====================================================================
Provides resilient, zero-downtime, self-adapting AI capabilities.
When an AI model is deprecated, sunsetted, rate-limited, or unavailable,
this engine dynamically discovers, tests, and adapts to the best available
alternative model without interrupting application features or crashing.
"""

import os
import re
import json
import time
import logging
import asyncio
from typing import List, Dict, Any, Optional, Tuple
import httpx
import openai

logger = logging.getLogger("dynamic_models")

# ---------------------------------------------------------------------------
# Default Candidate Priority Queues (Ordered from newest/fastest to stable)
# ---------------------------------------------------------------------------
# Gemini candidate models:
DEFAULT_GEMINI_CANDIDATES = [
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-pro-latest",
    "gemini-2.5-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
]

# OpenAI candidate models:
DEFAULT_OPENAI_CANDIDATES = [
    "gpt-4o",
    "gpt-4o-mini",
    "o1-mini",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
]

# HTTP status codes indicating a model is permanently deprecated or missing
DEPRECATED_STATUS_CODES = {404, 410}
# HTTP status codes indicating temporary outage or quota throttle
TEMPORARY_OUTAGE_CODES = {429, 500, 502, 503, 504}


class DynamicModelRegistry:
    """
    Manages active models, tracks deprecations, discovers working models,
    and guarantees zero-crash fallback across Google Gemini and OpenAI.
    """

    def __init__(self):
        self._deprecated_gemini: set = set()
        self._deprecated_openai: set = set()
        self._cooldown_gemini: Dict[str, float] = {}  # model -> timestamp until cooldown ends
        self._cooldown_openai: Dict[str, float] = {}

        # Cached active preferred models
        self._preferred_gemini: Optional[str] = None
        self._preferred_openai: Optional[str] = None

        # Discovered live models from API metadata (with cache expiration)
        self._discovered_gemini_models: List[str] = []
        self._discovered_gemini_expires: float = 0.0

        self._discovered_openai_models: List[str] = []
        self._discovered_openai_expires: float = 0.0

        # Shared HTTP client for Gemini calls
        self._http_client: Optional[httpx.AsyncClient] = None
        # Background discovery flag to prevent redundant concurrent discovery tasks
        self._discovery_running = False
        self._lock = asyncio.Lock()

    async def get_http_client(self) -> httpx.AsyncClient:
        """Returns or creates a pooled AsyncClient with resilient timeouts."""
        is_closed = False
        if self._http_client is not None:
            closed_attr = getattr(self._http_client, "is_closed", False)
            is_closed = closed_attr is True or (callable(closed_attr) and closed_attr() is True)
        if self._http_client is None or is_closed:
            self._http_client = httpx.AsyncClient(
                timeout=httpx.Timeout(30.0, connect=6.0),
                limits=httpx.Limits(max_keepalive_connections=25, max_connections=50)
            )
        return self._http_client

    async def close(self):
        """Cleanly close HTTP client pool on shutdown."""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()

    # -----------------------------------------------------------------------
    # Gemini Dynamic Discovery & Candidate Resolution
    # -----------------------------------------------------------------------
    async def discover_gemini_models(self, api_key: str) -> List[str]:
        """
        Dynamically queries Google's /v1beta/models endpoint to find
        all active models currently supporting content generation.
        Caches result for 30 minutes.
        """
        now = time.time()
        if self._discovered_gemini_models and now < self._discovered_gemini_expires:
            return self._discovered_gemini_models

        if not api_key or self._discovery_running:
            return self._discovered_gemini_models

        self._discovery_running = True
        try:
            client = await self.get_http_client()
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
            res = await client.get(url, timeout=5.0)
            if res.status_code == 200:
                data = res.json()
                valid_models = []
                for m in data.get("models", []):
                    name = m.get("name", "").replace("models/", "")
                    methods = m.get("supportedGenerationMethods", [])
                    if "generateContent" in methods:
                        # Exclude embedding or text-only legacy if needed
                        if "embedding" not in name:
                            valid_models.append(name)
                if valid_models:
                    self._discovered_gemini_models = valid_models
                    self._discovered_gemini_expires = now + 1800.0  # 30 min cache
                    logger.info(f"Discovered {len(valid_models)} active Gemini models from Google API")
                    return valid_models
        except Exception as e:
            logger.debug(f"Dynamic Gemini model discovery skipped: {e}")
        finally:
            self._discovery_running = False

        return self._discovered_gemini_models

    def get_gemini_candidate_queue(self, custom_model: Optional[str] = None) -> List[str]:
        """
        Returns prioritized queue of Gemini models, placing the preferred
        model first, then custom configured models, then discovered models,
        and finally default fallbacks, skipping deprecated ones.
        """
        now = time.time()
        candidates: List[str] = []

        # 1. First priority: Currently known working/preferred model
        if self._preferred_gemini and self._preferred_gemini not in self._deprecated_gemini:
            if self._cooldown_gemini.get(self._preferred_gemini, 0) < now:
                candidates.append(self._preferred_gemini)

        # 2. Configured custom model (e.g. from environment)
        env_model = os.environ.get("GEMINI_MODEL", "").strip()
        for m in [custom_model, env_model]:
            if m and m not in candidates and m not in self._deprecated_gemini:
                if self._cooldown_gemini.get(m, 0) < now:
                    candidates.append(m)

        # 3. Known active discovered models
        for m in self._discovered_gemini_models:
            if m not in candidates and m not in self._deprecated_gemini:
                if self._cooldown_gemini.get(m, 0) < now:
                    candidates.append(m)

        # 4. Standard prioritized defaults
        for m in DEFAULT_GEMINI_CANDIDATES:
            if m not in candidates and m not in self._deprecated_gemini:
                if self._cooldown_gemini.get(m, 0) < now:
                    candidates.append(m)

        return candidates

    def mark_gemini_deprecated(self, model: str, reason: str = ""):
        """Permanently records that a model is deprecated / sunset."""
        if model not in self._deprecated_gemini:
            self._deprecated_gemini.add(model)
            logger.warning(f"[DYNAMIC MODEL] Gemini model '{model}' marked DEPRECATED/UNAVAILABLE. Reason: {reason}")
            if self._preferred_gemini == model:
                self._preferred_gemini = None

    def mark_gemini_cooldown(self, model: str, cooldown_seconds: float = 60.0):
        """Temporarily cools down a model due to temporary 429/503 outage."""
        self._cooldown_gemini[model] = time.time() + cooldown_seconds
        logger.info(f"[DYNAMIC MODEL] Gemini model '{model}' cooled down for {cooldown_seconds}s (temporary load/rate limit)")

    def mark_gemini_success(self, model: str):
        """Caches working model as preferred to optimize future latency."""
        self._preferred_gemini = model
        self._deprecated_gemini.discard(model)
        self._cooldown_gemini.pop(model, None)

    # -----------------------------------------------------------------------
    # OpenAI Dynamic Candidate Resolution
    # -----------------------------------------------------------------------
    def get_openai_candidate_queue(self, custom_model: Optional[str] = None) -> List[str]:
        """Returns prioritized queue of OpenAI models, skipping deprecated ones."""
        now = time.time()
        candidates: List[str] = []

        if self._preferred_openai and self._preferred_openai not in self._deprecated_openai:
            if self._cooldown_openai.get(self._preferred_openai, 0) < now:
                candidates.append(self._preferred_openai)

        env_model = os.environ.get("OPENAI_MODEL", "").strip()
        for m in [custom_model, env_model]:
            if m and m not in candidates and m not in self._deprecated_openai:
                if self._cooldown_openai.get(m, 0) < now:
                    candidates.append(m)

        for m in DEFAULT_OPENAI_CANDIDATES:
            if m not in candidates and m not in self._deprecated_openai:
                if self._cooldown_openai.get(m, 0) < now:
                    candidates.append(m)

        return candidates

    def mark_openai_deprecated(self, model: str, reason: str = ""):
        if model not in self._deprecated_openai:
            self._deprecated_openai.add(model)
            logger.warning(f"[DYNAMIC MODEL] OpenAI model '{model}' marked DEPRECATED/UNAVAILABLE. Reason: {reason}")
            if self._preferred_openai == model:
                self._preferred_openai = None

    def mark_openai_cooldown(self, model: str, cooldown_seconds: float = 60.0):
        self._cooldown_openai[model] = time.time() + cooldown_seconds
        logger.info(f"[DYNAMIC MODEL] OpenAI model '{model}' cooled down for {cooldown_seconds}s")

    def mark_openai_success(self, model: str):
        self._preferred_openai = model
        self._deprecated_openai.discard(model)
        self._cooldown_openai.pop(model, None)

    # -----------------------------------------------------------------------
    # Status Inspection
    # -----------------------------------------------------------------------
    def get_status(self) -> Dict[str, Any]:
        """Provides complete operational status of active models and fallbacks."""
        return {
            "gemini": {
                "preferred_model": self._preferred_gemini,
                "deprecated_models": sorted(list(self._deprecated_gemini)),
                "cooldown_models": {m: round(t - time.time(), 1) for m, t in self._cooldown_gemini.items() if t > time.time()},
                "candidate_queue": self.get_gemini_candidate_queue(),
                "discovered_count": len(self._discovered_gemini_models)
            },
            "openai": {
                "preferred_model": self._preferred_openai,
                "deprecated_models": sorted(list(self._deprecated_openai)),
                "cooldown_models": {m: round(t - time.time(), 1) for m, t in self._cooldown_openai.items() if t > time.time()},
                "candidate_queue": self.get_openai_candidate_queue()
            }
        }


# Global singleton registry
model_registry = DynamicModelRegistry()


# ---------------------------------------------------------------------------
# High-Level Dynamic Calling Functions
# ---------------------------------------------------------------------------

async def call_gemini_dynamic(payload: dict, custom_model: Optional[str] = None) -> dict:
    """
    Executes a Gemini API request with automatic model adaptation.
    If the requested model is deprecated (404/410) or degraded (503/429),
    it dynamically tries the next best candidate model in the queue until
    success or queue exhaustion.

    Returns the JSON response dict from the working model.
    Raises Exception if all candidates fail or API key is absent.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured")

    # Trigger background model discovery if not yet done and not in test mode
    if not model_registry._discovered_gemini_models and not model_registry._discovery_running and not os.environ.get("TESTING"):
        asyncio.create_task(model_registry.discover_gemini_models(api_key))

    candidates = model_registry.get_gemini_candidate_queue(custom_model)
    if not candidates:
        candidates = list(DEFAULT_GEMINI_CANDIDATES)

    client = await model_registry.get_http_client()
    last_exception = None

    for model in candidates:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        try:
            response = await client.post(url, json=payload, timeout=20.0)
            
            # Case 1: Success (200 OK)
            if response.status_code == 200:
                res_json = response.json()
                model_registry.mark_gemini_success(model)
                return res_json

            # Case 2: Permanent Deprecation or Not Found (404, 410, or 400 with 'deprecated' in body)
            err_text = response.text
            if response.status_code in DEPRECATED_STATUS_CODES or (
                response.status_code == 400 and ("deprecated" in err_text.lower() or "not supported" in err_text.lower())
            ):
                model_registry.mark_gemini_deprecated(model, err_text[:160])
                logger.info(f"Dynamically adapting from deprecated model '{model}' to next candidate...")
                continue

            # Case 3: Temporary Outage / Quota / High Demand (503, 429)
            if response.status_code in TEMPORARY_OUTAGE_CODES:
                model_registry.mark_gemini_cooldown(model, 60.0)
                logger.warning(f"Model '{model}' returned HTTP {response.status_code} (demand spike/rate limit). Trying next candidate...")
                continue

            # Other unexpected HTTP status
            logger.warning(f"Gemini API returned {response.status_code} for model {model}: {err_text[:160]}")
            last_exception = Exception(f"Gemini API {response.status_code}: {err_text[:160]}")

        except httpx.TimeoutException:
            logger.warning(f"Gemini request timed out on model '{model}'. Attempting next candidate...")
            model_registry.mark_gemini_cooldown(model, 30.0)
            continue
        except Exception as ex:
            logger.warning(f"Gemini call to model '{model}' encountered error: {ex}")
            last_exception = ex

    raise last_exception or Exception("All dynamic Gemini model candidates failed")


async def call_openai_dynamic(
    messages: List[Dict[str, Any]],
    response_format: Optional[Dict[str, str]] = None,
    custom_model: Optional[str] = None,
    max_tokens: Optional[int] = None
) -> Tuple[str, str]:
    """
    Executes an OpenAI chat completion with automatic model adaptation.
    If a model is deprecated (e.g. gpt-4-turbo, gpt-3.5-turbo) or out of quota,
    it automatically cycles through candidate OpenAI models.

    Returns: Tuple of (content_string, successful_model_name).
    """
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise ValueError("OPENAI_API_KEY is not configured")

    client = openai.AsyncOpenAI(api_key=api_key)
    candidates = model_registry.get_openai_candidate_queue(custom_model)
    last_exception = None

    for model in candidates:
        try:
            kwargs = {
                "model": model,
                "messages": messages,
                "timeout": 20.0
            }
            if response_format:
                kwargs["response_format"] = response_format
            if max_tokens:
                kwargs["max_tokens"] = max_tokens

            response = await client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content or ""
            model_registry.mark_openai_success(model)
            return content, model

        except openai.NotFoundError as nfe:
            model_registry.mark_openai_deprecated(model, str(nfe))
            continue
        except openai.BadRequestError as bre:
            err_msg = str(bre).lower()
            if "deprecated" in err_msg or "does not exist" in err_msg:
                model_registry.mark_openai_deprecated(model, str(bre))
                continue
            last_exception = bre
            break
        except openai.RateLimitError as rle:
            err_msg = str(rle).lower()
            if "insufficient_quota" in err_msg or "credit_balance_exhausted" in err_msg:
                model_registry.mark_openai_cooldown(model, 300.0)
            else:
                model_registry.mark_openai_cooldown(model, 60.0)
            last_exception = rle
            continue
        except Exception as e:
            logger.warning(f"OpenAI model '{model}' call failed: {e}")
            last_exception = e

    raise last_exception or Exception("All dynamic OpenAI model candidates failed")


# ---------------------------------------------------------------------------
# Fallback Heuristic Utilities (Zero-Crash Guarantee)
# ---------------------------------------------------------------------------

def clean_json_text(text: str) -> str:
    """Safely extracts clean JSON substring from LLM text containing markdown blocks."""
    if not text:
        return "{}"
    t = text.strip()
    # Strip markdown ```json ... ``` blocks
    if t.startswith("```"):
        lines = t.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        t = "\n".join(lines).strip()
    return t


def fallback_classify_trip(start_address: str, end_address: str, distance: float, notes: str = "") -> dict:
    """
    Deterministic rule-based classification when all external AI models are unreachable.
    Prevents trip classification from failing.
    """
    combined = f"{start_address} {end_address} {notes}".lower()

    # Medical checks
    medical_keywords = ["hospital", "clinic", "doctor", "pharmacy", "medical", "dental", "urgent care", "therapy"]
    if any(k in combined for k in medical_keywords):
        return {
            "classification": "medical",
            "confidence": 0.88,
            "purpose": "Medical appointment / healthcare travel",
            "client_name": None
        }

    # Charity checks
    charity_keywords = ["church", "food bank", "shelter", "goodwill", "salvation army", "nonprofit", "charity", "volunteer"]
    if any(k in combined for k in charity_keywords):
        return {
            "classification": "charity",
            "confidence": 0.85,
            "purpose": "Charitable service / volunteer activity",
            "client_name": None
        }

    # Business checks
    business_keywords = ["office", "client", "meeting", "site", "depot", "warehouse", "store", "supply", "conference", "job", "delivery"]
    if any(k in combined for k in business_keywords):
        return {
            "classification": "business",
            "confidence": 0.82,
            "purpose": "Business travel / client appointment",
            "client_name": None
        }

    # Standard default
    return {
        "classification": "business" if distance > 10.0 else "personal",
        "confidence": 0.65,
        "purpose": "Standard mileage travel",
        "client_name": None
    }
