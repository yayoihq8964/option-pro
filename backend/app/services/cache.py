from __future__ import annotations

import asyncio
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
        self._locks: dict[str, asyncio.Lock] = {}

    def get(self, key: str) -> Any | None:
        entry = self.get_with_expiry(key)
        if entry is None:
            return None
        return entry[1]

    def get_with_expiry(self, key: str) -> tuple[float, Any] | None:
        entry = self._store.get(key)
        if not entry:
            return None
        expires_at, value = entry
        if expires_at <= time.time():
            self._store.pop(key, None)
            return None
        return expires_at, value

    def set(self, key: str, value: Any, ttl: int) -> Any:
        self._store[key] = (time.time() + ttl, value)
        return value

    async def get_or_set(self, key: str, ttl: int, producer: Callable[[], Awaitable[Any]]) -> Any:
        value, _, _ = await self.get_or_set_with_meta(key, ttl, producer)
        return value

    async def get_or_set_with_meta(
        self,
        key: str,
        ttl: int,
        producer: Callable[[], Awaitable[Any]],
    ) -> tuple[Any, bool, float]:
        cached = self.get_with_expiry(key)
        if cached is not None:
            expires_at, value = cached
            return value, True, expires_at

        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            cached = self.get_with_expiry(key)
            if cached is not None:
                expires_at, value = cached
                return value, True, expires_at

            value = await producer()
            expires_at = time.time() + ttl
            self._store[key] = (expires_at, value)
            return value, False, expires_at

    def clear(self) -> None:
        self._store.clear()


cache = TTLCache()
