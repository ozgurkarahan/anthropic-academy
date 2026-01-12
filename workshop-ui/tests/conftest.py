"""Pytest fixtures for Workshop UI tests."""

import os
import sys
import tempfile
import shutil
import pytest

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient


@pytest.fixture
def temp_sandbox_dir():
    """Create a temporary directory for sandbox testing."""
    temp_dir = tempfile.mkdtemp(prefix="workshop-test-")
    yield temp_dir
    # Cleanup
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)


@pytest.fixture
def test_client():
    """Create a FastAPI test client."""
    from main import app
    return TestClient(app)


@pytest.fixture
def mock_config():
    """Mock API configuration (no real API calls)."""
    return {
        "api_key": "sk-test-mock-key",
        "base_url": "https://api.anthropic.com",
        "model": "claude-sonnet-4-20250514"
    }


@pytest.fixture
def sample_tools():
    """Sample tools for testing."""
    return [
        {
            "name": "calculator",
            "description": "Perform basic math calculations.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "expression": {"type": "string", "description": "Math expression"}
                },
                "required": ["expression"]
            }
        }
    ]
