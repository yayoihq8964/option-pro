from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from typing import Any


class TTLCache:
    """Small async-friendly in-memory TTL cache.

    This is intentionally process-local and dependency-free for the MVP. It is
    safe for FastAPI's single event-loop access pattern; multi-worker Docker
    deployments will each have their own cache.
    """

    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        entry = self._store.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if expires_at <= time.time():
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any, ttl: int) -> Any:
        self._store[key] = (time.time() + ttl, value)
        return value

    async def get_or_set(self, key: str, ttl: int, producer: Callable[[], Awaitable[Any]]) -> Any:
        cached = self.get(key)
        if cached is not None:
            return cached
        value = await producer()
        return self.set(key, value, ttl)

    def clear(self) -> None:
        self._store.clear()


cache = TTLCache()
