"""Text editor tool for sandboxed file operations."""

import os
import shutil
import tempfile
from datetime import datetime
from typing import Dict, List, Optional

# Store active sandbox sessions
SANDBOX_SESSIONS: Dict[str, "TextEditorTool"] = {}
SANDBOX_BASE_DIR = os.path.join(tempfile.gettempdir(), "workshop-sandbox")
os.makedirs(SANDBOX_BASE_DIR, exist_ok=True)


class TextEditorTool:
    """Text editor tool for file manipulation in a sandboxed environment."""

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.base_dir = os.path.join(SANDBOX_BASE_DIR, session_id)
        self.backup_dir = os.path.join(self.base_dir, ".backups")
        self.history: List[Dict] = []
        os.makedirs(self.base_dir, exist_ok=True)
        os.makedirs(self.backup_dir, exist_ok=True)

    def _validate_path(self, file_path: str) -> str:
        """Validate and resolve file path within sandbox."""
        if file_path.startswith("/"):
            file_path = file_path[1:]
        abs_path = os.path.normpath(os.path.join(self.base_dir, file_path))
        if not abs_path.startswith(self.base_dir):
            raise ValueError(f"Access denied: Path '{file_path}' is outside the sandbox")
        return abs_path

    def _backup_file(self, file_path: str) -> str:
        """Create a backup of a file before modification."""
        if not os.path.exists(file_path):
            return ""
        file_name = os.path.basename(file_path)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        backup_path = os.path.join(self.backup_dir, f"{file_name}.{timestamp}")
        shutil.copy2(file_path, backup_path)
        return backup_path

    def _get_relative_path(self, abs_path: str) -> str:
        """Get relative path from absolute path."""
        return os.path.relpath(abs_path, self.base_dir)

    def _add_history(self, command: str, path: str, details: dict,
                     old_content: str = None, new_content: str = None):
        """Add an operation to the history timeline."""
        self.history.append({
            "timestamp": datetime.now().isoformat(),
            "command": command,
            "path": path,
            "details": details,
            "old_content": old_content,
            "new_content": new_content
        })

    def view(self, file_path: str, view_range: Optional[List[int]] = None) -> str:
        """View file contents or directory listing."""
        abs_path = self._validate_path(file_path)

        if os.path.isdir(abs_path):
            entries = os.listdir(abs_path)
            return "\n".join(entries) if entries else "(empty directory)"

        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        with open(abs_path, "r", encoding="utf-8") as f:
            content = f.read()

        lines = content.split("\n")
        if view_range:
            start, end = view_range
            if end == -1:
                end = len(lines)
            selected_lines = lines[start - 1:end]
            result = [f"{i}: {line}" for i, line in enumerate(selected_lines, start)]
        else:
            result = [f"{i}: {line}" for i, line in enumerate(lines, 1)]

        return "\n".join(result)

    def str_replace(self, file_path: str, old_str: str, new_str: str) -> str:
        """Replace a unique string in a file."""
        abs_path = self._validate_path(file_path)

        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        with open(abs_path, "r", encoding="utf-8") as f:
            content = f.read()

        match_count = content.count(old_str)
        if match_count == 0:
            raise ValueError("No match found for replacement text")
        elif match_count > 1:
            raise ValueError(f"Found {match_count} matches. Please provide more context.")

        old_content = content
        self._backup_file(abs_path)
        new_content = content.replace(old_str, new_str)

        with open(abs_path, "w", encoding="utf-8") as f:
            f.write(new_content)

        self._add_history("str_replace", file_path,
                         {"old_str": old_str, "new_str": new_str},
                         old_content, new_content)
        return "Successfully replaced text"

    def create(self, file_path: str, file_text: str) -> str:
        """Create a new file."""
        abs_path = self._validate_path(file_path)

        if os.path.exists(abs_path):
            raise FileExistsError(f"File already exists: {file_path}")

        os.makedirs(os.path.dirname(abs_path), exist_ok=True)

        with open(abs_path, "w", encoding="utf-8") as f:
            f.write(file_text)

        self._add_history("create", file_path, {"size": len(file_text)}, None, file_text)
        return f"Successfully created {file_path}"

    def insert(self, file_path: str, insert_line: int, new_str: str) -> str:
        """Insert text at a specific line."""
        abs_path = self._validate_path(file_path)

        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        with open(abs_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        old_content = "".join(lines)
        self._backup_file(abs_path)

        if lines and not lines[-1].endswith("\n"):
            new_str = "\n" + new_str

        if insert_line == 0:
            lines.insert(0, new_str + "\n")
        elif 0 < insert_line <= len(lines):
            lines.insert(insert_line, new_str + "\n")
        else:
            raise IndexError(f"Line {insert_line} out of range (file has {len(lines)} lines)")

        with open(abs_path, "w", encoding="utf-8") as f:
            f.writelines(lines)

        new_content = "".join(lines)
        self._add_history("insert", file_path,
                         {"line": insert_line, "text": new_str},
                         old_content, new_content)
        return f"Successfully inserted text after line {insert_line}"

    def undo_edit(self, file_path: str) -> str:
        """Undo the last edit to a file."""
        abs_path = self._validate_path(file_path)
        file_name = os.path.basename(abs_path)

        backups = [f for f in os.listdir(self.backup_dir) if f.startswith(file_name + ".")]
        if not backups:
            raise FileNotFoundError(f"No backups found for {file_path}")

        latest_backup = sorted(backups, reverse=True)[0]
        backup_path = os.path.join(self.backup_dir, latest_backup)
        shutil.copy2(backup_path, abs_path)
        os.remove(backup_path)

        with open(abs_path, "r", encoding="utf-8") as f:
            restored_content = f.read()

        self._add_history("undo_edit", file_path, {"restored_from": latest_backup}, None, restored_content)
        return f"Successfully restored {file_path} from backup"

    def list_files(self) -> List[Dict]:
        """List all files in the sandbox."""
        files = []
        for root, dirs, filenames in os.walk(self.base_dir):
            if ".backups" in root:
                continue
            for filename in filenames:
                abs_path = os.path.join(root, filename)
                rel_path = self._get_relative_path(abs_path)
                stat = os.stat(abs_path)
                files.append({
                    "path": rel_path,
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
        return files

    def get_file_content(self, file_path: str) -> str:
        """Get raw file content (no line numbers)."""
        abs_path = self._validate_path(file_path)
        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        with open(abs_path, "r", encoding="utf-8") as f:
            return f.read()

    def get_history(self) -> List[Dict]:
        """Get the operation history."""
        return self.history

    def cleanup(self):
        """Clean up the sandbox directory."""
        if os.path.exists(self.base_dir):
            shutil.rmtree(self.base_dir)


def get_or_create_sandbox(session_id: str) -> TextEditorTool:
    """Get or create a sandbox session."""
    if session_id not in SANDBOX_SESSIONS:
        SANDBOX_SESSIONS[session_id] = TextEditorTool(session_id)
    return SANDBOX_SESSIONS[session_id]


def run_text_editor_tool(sandbox: TextEditorTool, tool_input: dict) -> str:
    """Execute a text editor tool command."""
    command = tool_input.get("command")
    path = tool_input.get("path", "")

    if command == "view":
        return sandbox.view(path, tool_input.get("view_range"))
    elif command == "str_replace":
        return sandbox.str_replace(path, tool_input["old_str"], tool_input["new_str"])
    elif command == "create":
        return sandbox.create(path, tool_input["file_text"])
    elif command == "insert":
        return sandbox.insert(path, tool_input["insert_line"], tool_input["new_str"])
    elif command == "undo_edit":
        return sandbox.undo_edit(path)
    else:
        raise ValueError(f"Unknown command: {command}")
