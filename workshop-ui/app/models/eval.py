"""Evaluation models."""

from typing import List, Optional
from pydantic import BaseModel
from .chat import ConfigModel


class TestCase(BaseModel):
    """Evaluation test case."""
    input: str
    expected_output: str


class GenerateDatasetRequest(BaseModel):
    """Request to generate test dataset."""
    config: ConfigModel
    context: str
    count: int = 5


class EvalRunRequest(BaseModel):
    """Request to run evaluation."""
    config: ConfigModel
    system_prompt: Optional[str] = None
    dataset: List[TestCase]
    criteria: List[str]
