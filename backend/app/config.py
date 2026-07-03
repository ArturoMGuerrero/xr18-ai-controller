"""Configuration settings for XR18 AI Controller"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings"""

    # XR18 Mixer Configuration
    xr18_ip: str = "192.168.1.1"
    xr18_port: int = 10024
    xr18_channels: int = 16

    # Audio Level Thresholds (dB)
    max_threshold_db: float = -6.0
    target_level_db: float = -12.0
    min_threshold_db: float = -40.0

    # AI Configuration
    ai_history_window: int = 100
    ai_confidence_threshold: float = 0.7

    # Server Configuration
    host: str = "127.0.0.1"
    port: int = 8000
    reload: bool = True

    # WebSocket Configuration
    ws_refresh_rate_ms: int = 50

    # Logging
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
