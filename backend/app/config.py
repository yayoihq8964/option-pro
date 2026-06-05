from __future__ import annotations

from functools import lru_cache
from pydantic import Field, AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment or .env."""

    massive_api_key: str = Field(default="", alias="MASSIVE_API_KEY")
    massive_base_url: AnyHttpUrl = Field(default="https://api.massive.com", alias="MASSIVE_BASE_URL")
    cache_ttl: int = Field(default=60, alias="CACHE_TTL")
    request_timeout: float = Field(default=20.0, alias="REQUEST_TIMEOUT")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", populate_by_name=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
