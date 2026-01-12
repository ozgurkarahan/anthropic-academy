"""Anthropic client factory functions."""

from typing import List, Optional
import anthropic
from ..models import ConfigModel


def get_client(config: ConfigModel, beta_features: Optional[List[str]] = None) -> anthropic.Anthropic:
    """Create Anthropic client with provided config and optional beta features."""
    default_betas = ["prompt-caching-2024-07-31"]
    all_betas = default_betas + (beta_features or [])

    return anthropic.Anthropic(
        api_key=config.api_key,
        base_url=config.base_url if config.base_url else None,
        default_headers={"anthropic-beta": ", ".join(all_betas)}
    )


def get_code_exec_client(config: ConfigModel) -> anthropic.Anthropic:
    """Create Anthropic client with code execution beta headers."""
    return anthropic.Anthropic(
        api_key=config.api_key,
        base_url=config.base_url if config.base_url else None,
        default_headers={
            "anthropic-beta": "code-execution-2025-08-25, files-api-2025-04-14"
        }
    )
