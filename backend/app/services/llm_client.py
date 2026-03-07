"""Generic Ollama LLM client — reusable across bounce detection, data parsing, etc.

Usage:
    from app.services.llm_client import llm

    # Simple generation
    result = llm.generate("Summarize this email: ...")

    # Classification
    label = llm.classify(
        text="Mail delivery failed ...",
        categories=["hard_bounce", "soft_bounce", "ooo", "normal"],
        system_prompt="Classify this email.",
    )

    # Health check
    if llm.is_available():
        ...
"""
import time
import requests
from app.config import OLLAMA_URL, OLLAMA_MODEL
from app.logging_config import get_logger

logger = get_logger("llm_client")

# After this many consecutive failures, skip AI until a manual reset / restart
_MAX_CONSECUTIVE_FAILURES = 3


class LLMClient:
    """Lightweight wrapper around the Ollama REST API."""

    def __init__(self, base_url: str = OLLAMA_URL, model: str = OLLAMA_MODEL):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._timeout = 300  # seconds — CPU inference can be slow
        self._max_retries = 2
        self._consecutive_failures = 0

    @property
    def is_healthy(self) -> bool:
        """False when too many consecutive generate() calls have failed."""
        return self._consecutive_failures < _MAX_CONSECUTIVE_FAILURES

    def reset_failures(self) -> None:
        """Reset the failure counter (e.g. at the start of a new scan cycle)."""
        self._consecutive_failures = 0

    # ── Core generation ──────────────────────────────────────────────── #

    def generate(self, prompt: str, *, system: str = "", temperature: float = 0.1) -> str:
        """Send a prompt to Ollama and return the response text.

        Retries up to *_max_retries* on timeout / connection errors with
        exponential back-off.  Tracks consecutive failures so callers can
        check ``is_healthy`` and skip AI when Ollama is unresponsive.
        """
        if not self.is_healthy:
            logger.warning(
                f"Skipping Ollama call — {self._consecutive_failures} consecutive failures"
            )
            return ""

        payload: dict = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature},
        }
        if system:
            payload["system"] = system

        last_err: Exception | None = None
        for attempt in range(1, self._max_retries + 1):
            try:
                resp = requests.post(
                    f"{self.base_url}/api/generate",
                    json=payload,
                    timeout=self._timeout,
                )
                # If 404, the model probably isn't pulled yet — try once
                if resp.status_code == 404:
                    logger.warning(f"Model {self.model} not found, attempting auto-pull...")
                    if self.ensure_model():
                        resp = requests.post(
                            f"{self.base_url}/api/generate",
                            json=payload,
                            timeout=self._timeout,
                        )
                    else:
                        logger.error(f"Auto-pull of {self.model} failed — cannot generate")
                        self._consecutive_failures += 1
                        return ""
                resp.raise_for_status()
                self._consecutive_failures = 0  # success — reset counter
                return resp.json().get("response", "").strip()
            except (requests.ConnectionError, requests.Timeout) as e:
                last_err = e
                wait = 2 ** attempt  # 2s, 4s
                logger.warning(
                    f"Ollama attempt {attempt}/{self._max_retries} failed "
                    f"({type(e).__name__}), retrying in {wait}s …"
                )
                time.sleep(wait)
            except requests.RequestException as e:
                # Non-retryable HTTP error (4xx, 5xx other than 404)
                logger.error(f"Ollama generate error (non-retryable): {e}")
                self._consecutive_failures += 1
                return ""

        # All retries exhausted
        self._consecutive_failures += 1
        logger.error(
            f"Ollama generate failed after {self._max_retries} attempts: {last_err}  "
            f"(consecutive failures: {self._consecutive_failures})"
        )
        return ""

    # ── Classification helper ────────────────────────────────────────── #

    def classify(
        self,
        text: str,
        categories: list[str],
        *,
        system_prompt: str = "",
    ) -> str:
        """Ask the model to classify *text* into one of *categories*.

        Returns the category string, or "unknown" on failure.
        """
        cats = ", ".join(categories)
        prompt = (
            f"Classify the following text into EXACTLY ONE of these categories: {cats}\n\n"
            f"Text:\n{text[:2000]}\n\n"
            f"Reply with ONLY the category name, nothing else."
        )
        result = self.generate(prompt, system=system_prompt, temperature=0.0)
        # Normalize — pick the first token that matches a known category
        result_lower = result.lower().strip()
        for cat in categories:
            if cat.lower() in result_lower:
                return cat
        # Fuzzy: handle common LLM truncations (e.g. "oo" → ooo, "hard" → hard_bounce)
        _FUZZY: dict[str, str] = {
            "oo": "ooo", "out of office": "ooo", "out-of-office": "ooo",
            "hard": "hard_bounce", "soft": "soft_bounce",
        }
        fuzzy_match = _FUZZY.get(result_lower)
        if fuzzy_match and fuzzy_match in [c.lower() for c in categories]:
            logger.info(f"LLM fuzzy match: {result!r} → {fuzzy_match}")
            # Return the original-cased category
            for cat in categories:
                if cat.lower() == fuzzy_match:
                    return cat
        logger.warning(f"LLM returned unrecognized category: {result!r}")
        return "unknown"

    # ── Extract text helper ──────────────────────────────────────────── #

    def extract(self, text: str, *, instruction: str) -> str:
        """Ask the model to extract specific information from text."""
        prompt = f"{instruction}\n\nText:\n{text[:3000]}"
        return self.generate(prompt, temperature=0.0)

    # ── Health / availability ────────────────────────────────────────── #

    def is_available(self) -> bool:
        """Check if Ollama is reachable."""
        try:
            resp = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return resp.status_code == 200
        except requests.RequestException:
            return False

    def list_models(self) -> list[str]:
        """Return list of locally available model names."""
        try:
            resp = requests.get(f"{self.base_url}/api/tags", timeout=10)
            resp.raise_for_status()
            return [m["name"] for m in resp.json().get("models", [])]
        except requests.RequestException:
            return []

    def ensure_model(self) -> bool:
        """Pull the configured model if not already present. Returns True on success."""
        models = self.list_models()
        # Check if model is already available (name may include :tag)
        if any(self.model in m for m in models):
            return True
        logger.info(f"Pulling model {self.model} ...")
        try:
            resp = requests.post(
                f"{self.base_url}/api/pull",
                json={"name": self.model, "stream": False},
                timeout=600,  # models can be large
            )
            resp.raise_for_status()
            logger.info(f"Model {self.model} pulled successfully")
            return True
        except requests.RequestException as e:
            logger.error(f"Failed to pull model {self.model}: {e}")
            return False

    def model_info(self) -> dict:
        """Get info about the current model (size, parameters, etc.)."""
        try:
            resp = requests.post(
                f"{self.base_url}/api/show",
                json={"name": self.model},
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException:
            return {}


# Module-level singleton
llm = LLMClient()
