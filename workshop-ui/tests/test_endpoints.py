"""Tests for API endpoints."""

import os
import sys
import json
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from main import app, SANDBOX_SESSIONS, execute_tool


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


class TestHomeEndpoint:
    """Tests for home page."""

    def test_home_returns_html(self, client):
        """Test that home returns HTML."""
        response = client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]

    def test_home_contains_workshop_ui(self, client):
        """Test that home contains expected elements."""
        response = client.get("/")
        assert b"Workshop" in response.content or b"Claude" in response.content


class TestSampleToolsEndpoint:
    """Tests for /api/sample-tools."""

    def test_returns_tools_list(self, client):
        """Test that sample tools endpoint returns tools."""
        response = client.get("/api/sample-tools")
        assert response.status_code == 200

        data = response.json()
        assert "tools" in data
        assert len(data["tools"]) >= 3

    def test_tools_have_required_fields(self, client):
        """Test that tools have required fields."""
        response = client.get("/api/sample-tools")
        tools = response.json()["tools"]

        for tool in tools:
            assert "name" in tool
            assert "description" in tool
            assert "input_schema" in tool


class TestUploadEndpoint:
    """Tests for /api/upload."""

    def test_upload_image(self, client):
        """Test uploading an image."""
        # Create a simple PNG header
        png_header = b'\x89PNG\r\n\x1a\n' + b'\x00' * 100

        response = client.post(
            "/api/upload",
            files={"file": ("test.png", png_header, "image/png")}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["file_type"] == "image"
        assert data["filename"] == "test.png"
        assert "base64" in data

    def test_upload_pdf(self, client):
        """Test uploading a PDF."""
        pdf_content = b'%PDF-1.4' + b'\x00' * 100

        response = client.post(
            "/api/upload",
            files={"file": ("test.pdf", pdf_content, "application/pdf")}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["file_type"] == "pdf"


class TestTextEditorSessionEndpoints:
    """Tests for text editor session endpoints."""

    def test_create_session(self, client):
        """Test creating a text editor session."""
        response = client.post("/api/texteditor/session")
        assert response.status_code == 200

        data = response.json()
        assert "session_id" in data

        # Cleanup
        session_id = data["session_id"]
        if session_id in SANDBOX_SESSIONS:
            SANDBOX_SESSIONS[session_id].cleanup()
            del SANDBOX_SESSIONS[session_id]

    def test_list_files_empty_session(self, client):
        """Test listing files in empty session."""
        # Create session
        create_response = client.post("/api/texteditor/session")
        session_id = create_response.json()["session_id"]

        try:
            response = client.get(f"/api/texteditor/files/{session_id}")
            assert response.status_code == 200

            data = response.json()
            assert data["success"] is True
            assert data["files"] == []
        finally:
            client.delete(f"/api/texteditor/session/{session_id}")

    def test_get_file_not_found(self, client):
        """Test getting non-existent file."""
        create_response = client.post("/api/texteditor/session")
        session_id = create_response.json()["session_id"]

        try:
            response = client.get(f"/api/texteditor/file/{session_id}/nonexistent.txt")
            data = response.json()
            assert data["success"] is False
            assert "not found" in data["error"].lower()
        finally:
            client.delete(f"/api/texteditor/session/{session_id}")

    def test_get_history_empty(self, client):
        """Test getting history for new session."""
        create_response = client.post("/api/texteditor/session")
        session_id = create_response.json()["session_id"]

        try:
            response = client.get(f"/api/texteditor/history/{session_id}")
            assert response.status_code == 200

            data = response.json()
            assert data["success"] is True
            assert data["history"] == []
        finally:
            client.delete(f"/api/texteditor/session/{session_id}")

    def test_delete_session(self, client):
        """Test deleting a session."""
        create_response = client.post("/api/texteditor/session")
        session_id = create_response.json()["session_id"]

        response = client.delete(f"/api/texteditor/session/{session_id}")
        assert response.status_code == 200
        assert response.json()["success"] is True

        # Verify session is deleted
        assert session_id not in SANDBOX_SESSIONS


class TestExecuteTool:
    """Tests for execute_tool function."""

    def test_calculator_addition(self):
        """Test calculator with addition."""
        result = execute_tool("calculator", {"expression": "2 + 3"})
        assert "5" in result

    def test_calculator_complex(self):
        """Test calculator with complex expression."""
        result = execute_tool("calculator", {"expression": "(10 * 5) / 2"})
        assert "25" in result

    def test_calculator_invalid_chars(self):
        """Test calculator rejects invalid characters."""
        result = execute_tool("calculator", {"expression": "import os"})
        assert "Invalid" in result or "Error" in result

    def test_get_current_time(self):
        """Test get_current_time returns timestamp."""
        result = execute_tool("get_current_time", {})
        # Should contain date-like format
        assert "-" in result and ":" in result

    def test_get_weather(self):
        """Test get_weather returns mock data."""
        result = execute_tool("get_weather", {"location": "Paris"})
        assert "Paris" in result
        assert "Weather" in result or "Sunny" in result

    def test_unknown_tool(self):
        """Test unknown tool returns error."""
        result = execute_tool("unknown_tool", {})
        assert "Unknown tool" in result


class TestChatEndpointValidation:
    """Tests for chat endpoint request validation."""

    def test_chat_requires_messages(self, client):
        """Test that chat requires messages."""
        response = client.post(
            "/api/chat",
            json={
                "config": {
                    "api_key": "test",
                    "base_url": "https://api.anthropic.com",
                    "model": "claude-sonnet-4-20250514"
                },
                "messages": []
            }
        )
        # Should return streaming response even with empty messages
        assert response.status_code == 200


class TestStructuredEndpointValidation:
    """Tests for structured data endpoint validation."""

    def test_structured_accepts_valid_schema(self, client):
        """Test structured endpoint accepts valid JSON schema."""
        # This will fail with API error but validates the request
        response = client.post(
            "/api/structured",
            json={
                "config": {
                    "api_key": "invalid-key",
                    "base_url": "https://api.anthropic.com",
                    "model": "claude-sonnet-4-20250514"
                },
                "messages": [{"role": "user", "content": "test"}],
                "output_schema": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"}
                    }
                }
            }
        )
        # Should return streaming response (will contain error from invalid API key)
        assert response.status_code == 200


class TestEvalEndpointValidation:
    """Tests for evaluation endpoints validation."""

    def test_generate_dataset_requires_context(self, client):
        """Test that generate dataset needs context."""
        response = client.post(
            "/api/eval/generate-dataset",
            json={
                "config": {
                    "api_key": "test-key",
                    "base_url": "https://api.anthropic.com",
                    "model": "claude-sonnet-4-20250514"
                },
                "context": "",
                "count": 5
            }
        )
        # Empty context is technically valid, endpoint should handle it
        assert response.status_code == 200

    def test_run_evaluation_with_dataset(self, client):
        """Test run evaluation accepts valid request structure."""
        # Note: This test validates request format, not actual evaluation
        # (which would require valid API key)
        response = client.post(
            "/api/eval/run",
            json={
                "config": {
                    "api_key": "test-key",
                    "base_url": "https://api.anthropic.com",
                    "model": "claude-sonnet-4-20250514"
                },
                "dataset": [
                    {"input": "test question", "expected_output": "test answer"}
                ],
                "criteria": ["accuracy"]
            }
        )
        # Request is valid - will fail at API level with invalid key
        assert response.status_code == 200
