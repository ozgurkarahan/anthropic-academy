"""Tests for TextEditorTool class."""

import os
import pytest
import tempfile
import shutil

# Import from main
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from main import TextEditorTool, get_or_create_sandbox, run_text_editor_tool, SANDBOX_SESSIONS


class TestTextEditorTool:
    """Unit tests for TextEditorTool."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test sandbox."""
        self.session_id = "test-session-001"
        self.tool = TextEditorTool(self.session_id)
        yield
        # Cleanup
        self.tool.cleanup()
        if self.session_id in SANDBOX_SESSIONS:
            del SANDBOX_SESSIONS[self.session_id]

    def test_init_creates_directories(self):
        """Test that init creates sandbox and backup directories."""
        assert os.path.exists(self.tool.base_dir)
        assert os.path.exists(self.tool.backup_dir)

    def test_create_file(self):
        """Test creating a new file."""
        result = self.tool.create("test.py", "print('hello')")
        assert "Successfully created" in result

        # Verify file exists
        file_path = os.path.join(self.tool.base_dir, "test.py")
        assert os.path.exists(file_path)

        with open(file_path) as f:
            assert f.read() == "print('hello')"

    def test_create_file_in_subdirectory(self):
        """Test creating a file in a nested directory."""
        result = self.tool.create("src/utils/helper.py", "# helper")
        assert "Successfully created" in result

        file_path = os.path.join(self.tool.base_dir, "src/utils/helper.py")
        assert os.path.exists(file_path)

    def test_create_file_already_exists(self):
        """Test that creating existing file raises error."""
        self.tool.create("test.py", "content1")

        with pytest.raises(FileExistsError):
            self.tool.create("test.py", "content2")

    def test_view_file(self):
        """Test viewing file contents."""
        self.tool.create("view_test.txt", "line1\nline2\nline3")

        result = self.tool.view("view_test.txt")
        assert "1: line1" in result
        assert "2: line2" in result
        assert "3: line3" in result

    def test_view_file_with_range(self):
        """Test viewing specific lines."""
        self.tool.create("range_test.txt", "a\nb\nc\nd\ne")

        result = self.tool.view("range_test.txt", view_range=[2, 4])
        assert "2: b" in result
        assert "3: c" in result
        assert "4: d" in result
        assert "1: a" not in result

    def test_view_nonexistent_file(self):
        """Test viewing non-existent file raises error."""
        with pytest.raises(FileNotFoundError):
            self.tool.view("nonexistent.txt")

    def test_view_directory(self):
        """Test viewing directory listing."""
        self.tool.create("file1.txt", "a")
        self.tool.create("file2.txt", "b")

        result = self.tool.view(".")
        assert "file1.txt" in result
        assert "file2.txt" in result

    def test_str_replace(self):
        """Test string replacement."""
        self.tool.create("replace.txt", "hello world")

        result = self.tool.str_replace("replace.txt", "world", "universe")
        assert "Successfully replaced" in result

        content = self.tool.get_file_content("replace.txt")
        assert content == "hello universe"

    def test_str_replace_creates_backup(self):
        """Test that str_replace creates backup."""
        self.tool.create("backup_test.txt", "original")
        self.tool.str_replace("backup_test.txt", "original", "modified")

        # Check backup exists
        backups = os.listdir(self.tool.backup_dir)
        assert len(backups) >= 1
        assert any("backup_test.txt" in b for b in backups)

    def test_str_replace_no_match(self):
        """Test str_replace with no match raises error."""
        self.tool.create("nomatch.txt", "hello")

        with pytest.raises(ValueError, match="No match found"):
            self.tool.str_replace("nomatch.txt", "xyz", "abc")

    def test_str_replace_multiple_matches(self):
        """Test str_replace with multiple matches raises error."""
        self.tool.create("multi.txt", "aaa")

        with pytest.raises(ValueError, match="Found .* matches"):
            self.tool.str_replace("multi.txt", "a", "b")

    def test_insert(self):
        """Test inserting text at line."""
        self.tool.create("insert.txt", "line1\nline3")

        result = self.tool.insert("insert.txt", 1, "line2")
        assert "Successfully inserted" in result

        content = self.tool.get_file_content("insert.txt")
        assert "line2" in content

    def test_insert_at_beginning(self):
        """Test inserting at line 0."""
        self.tool.create("begin.txt", "second")

        self.tool.insert("begin.txt", 0, "first")
        content = self.tool.get_file_content("begin.txt")
        lines = content.strip().split("\n")
        assert lines[0] == "first"

    def test_undo_edit(self):
        """Test undoing an edit."""
        self.tool.create("undo.txt", "original")
        self.tool.str_replace("undo.txt", "original", "modified")

        # Verify modified
        assert self.tool.get_file_content("undo.txt") == "modified"

        # Undo
        result = self.tool.undo_edit("undo.txt")
        assert "Successfully restored" in result

        # Verify restored
        assert self.tool.get_file_content("undo.txt") == "original"

    def test_undo_no_backup(self):
        """Test undo with no backup raises error."""
        self.tool.create("nobackup.txt", "content")

        with pytest.raises(FileNotFoundError, match="No backups found"):
            self.tool.undo_edit("nobackup.txt")

    def test_list_files(self):
        """Test listing all files."""
        self.tool.create("a.txt", "a")
        self.tool.create("b.py", "b")
        self.tool.create("sub/c.js", "c")

        files = self.tool.list_files()
        paths = [f["path"] for f in files]

        assert "a.txt" in paths
        assert "b.py" in paths
        assert "sub/c.js" in paths or "sub\\c.js" in paths

    def test_list_files_excludes_backups(self):
        """Test that list_files excludes backup directory."""
        self.tool.create("file.txt", "content")
        self.tool.str_replace("file.txt", "content", "modified")

        files = self.tool.list_files()
        paths = [f["path"] for f in files]

        # Should not include .backups
        assert not any(".backups" in p for p in paths)

    def test_get_history(self):
        """Test operation history tracking."""
        self.tool.create("hist.txt", "v1")
        self.tool.str_replace("hist.txt", "v1", "v2")

        history = self.tool.get_history()

        assert len(history) == 2
        assert history[0]["command"] == "create"
        assert history[1]["command"] == "str_replace"

    def test_validate_path_prevents_escape(self):
        """Test that path validation prevents directory traversal."""
        with pytest.raises(ValueError, match="outside the sandbox"):
            self.tool._validate_path("../../../etc/passwd")

    def test_cleanup(self):
        """Test sandbox cleanup."""
        self.tool.create("cleanup.txt", "temp")
        base_dir = self.tool.base_dir

        assert os.path.exists(base_dir)
        self.tool.cleanup()
        assert not os.path.exists(base_dir)


class TestRunTextEditorTool:
    """Tests for run_text_editor_tool function."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test sandbox."""
        self.session_id = "test-run-session"
        self.sandbox = get_or_create_sandbox(self.session_id)
        yield
        self.sandbox.cleanup()
        if self.session_id in SANDBOX_SESSIONS:
            del SANDBOX_SESSIONS[self.session_id]

    def test_run_view_command(self):
        """Test running view command."""
        self.sandbox.create("test.txt", "hello")

        result = run_text_editor_tool(self.sandbox, {
            "command": "view",
            "path": "test.txt"
        })

        assert "hello" in result

    def test_run_create_command(self):
        """Test running create command."""
        result = run_text_editor_tool(self.sandbox, {
            "command": "create",
            "path": "new.py",
            "file_text": "print('new')"
        })

        assert "Successfully created" in result

    def test_run_str_replace_command(self):
        """Test running str_replace command."""
        self.sandbox.create("rep.txt", "old text")

        result = run_text_editor_tool(self.sandbox, {
            "command": "str_replace",
            "path": "rep.txt",
            "old_str": "old",
            "new_str": "new"
        })

        assert "Successfully replaced" in result

    def test_run_insert_command(self):
        """Test running insert command."""
        self.sandbox.create("ins.txt", "line1")

        result = run_text_editor_tool(self.sandbox, {
            "command": "insert",
            "path": "ins.txt",
            "insert_line": 1,
            "new_str": "line2"
        })

        assert "Successfully inserted" in result

    def test_run_undo_command(self):
        """Test running undo command."""
        self.sandbox.create("undo.txt", "original")
        self.sandbox.str_replace("undo.txt", "original", "changed")

        result = run_text_editor_tool(self.sandbox, {
            "command": "undo_edit",
            "path": "undo.txt"
        })

        assert "Successfully restored" in result

    def test_run_unknown_command(self):
        """Test running unknown command raises error."""
        with pytest.raises(ValueError, match="Unknown command"):
            run_text_editor_tool(self.sandbox, {
                "command": "delete",
                "path": "file.txt"
            })


class TestGetOrCreateSandbox:
    """Tests for sandbox session management."""

    def test_creates_new_session(self):
        """Test creating a new sandbox session."""
        session_id = "new-test-session"

        try:
            sandbox = get_or_create_sandbox(session_id)
            assert sandbox is not None
            assert sandbox.session_id == session_id
            assert session_id in SANDBOX_SESSIONS
        finally:
            if session_id in SANDBOX_SESSIONS:
                SANDBOX_SESSIONS[session_id].cleanup()
                del SANDBOX_SESSIONS[session_id]

    def test_returns_existing_session(self):
        """Test that existing session is returned."""
        session_id = "existing-session"

        try:
            sandbox1 = get_or_create_sandbox(session_id)
            sandbox2 = get_or_create_sandbox(session_id)

            assert sandbox1 is sandbox2
        finally:
            if session_id in SANDBOX_SESSIONS:
                SANDBOX_SESSIONS[session_id].cleanup()
                del SANDBOX_SESSIONS[session_id]
