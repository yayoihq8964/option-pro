from __future__ import annotations

from functools import lru_cache
from pydantic import Field, AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment or .env."""

    massive_api_key: str = Field(default="", alias="MASSIVE_API_KEY")
    massive_base_url: AnyHttpUrl = Field(default="https://api.massive.com", alias="MASSIVE_BASE_URL")
    finnhub_api_key: str = Field(default="", alias="FINNHUB_API_KEY")
    finnhub_base_url: AnyHttpUrl = Field(default="https://finnhub.io/api/v1", alias="FINNHUB_BASE_URL")
    finnhub_enrich_limit: int = Field(default=20, alias="FINNHUB_ENRICH_LIMIT")
    yahoo_options_enabled: bool = Field(default=True, alias="YAHOO_OPTIONS_ENABLED")
    yahoo_options_enrich_limit: int = Field(default=90, alias="YAHOO_OPTIONS_ENRICH_LIMIT")
    yahoo_option_target_dte: int = Field(default=30, alias="YAHOO_OPTION_TARGET_DTE")
    yahoo_option_min_dte: int = Field(default=14, alias="YAHOO_OPTION_MIN_DTE")
    yahoo_option_max_dte: int = Field(default=60, alias="YAHOO_OPTION_MAX_DTE")
    yahoo_option_strike_window_pct: float = Field(default=0.16, alias="YAHOO_OPTION_STRIKE_WINDOW_PCT")
    yahoo_options_failure_limit: int = Field(default=8, alias="YAHOO_OPTIONS_FAILURE_LIMIT")
    marketdata_token: str = Field(default="", alias="MARKETDATA_TOKEN")
    marketdata_api_token: str = Field(default="", alias="MARKETDATA_API_TOKEN")
    marketdata_base_url: AnyHttpUrl = Field(default="https://api.marketdata.app", alias="MARKETDATA_BASE_URL")
    marketdata_options_enrich_limit: int = Field(default=8, alias="MARKETDATA_OPTIONS_ENRICH_LIMIT")
    marketdata_option_dte: int = Field(default=30, alias="MARKETDATA_OPTION_DTE")
    marketdata_option_strike_limit: int = Field(default=8, alias="MARKETDATA_OPTION_STRIKE_LIMIT")
    marketdata_option_mode: str = Field(default="delayed", alias="MARKETDATA_OPTION_MODE")
    cache_ttl: int = Field(default=60, alias="CACHE_TTL")
    request_timeout: float = Field(default=20.0, alias="REQUEST_TIMEOUT")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", populate_by_name=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
