from markitdown import MarkItDown, StreamInfo
from io import BytesIO
from pathlib import Path


def binary_document_to_markdown(binary_data: bytes, file_type: str) -> str:
    """Converts binary document data to markdown-formatted text."""
    md = MarkItDown()
    file_obj = BytesIO(binary_data)
    stream_info = StreamInfo(extension=file_type)
    result = md.convert(file_obj, stream_info=stream_info)
    return result.text_content


def document_to_markdown(file_path: str) -> str:
    """Converts a document file (PDF or DOCX) to markdown-formatted text.

    Args:
        file_path: Path to the PDF or DOCX file

    Returns:
        Markdown-formatted text content

    Raises:
        FileNotFoundError: If the file does not exist
        ValueError: If the file extension is not supported (must be .pdf or .docx)
    """
    path = Path(file_path)

    # Check if file exists
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    # Check if it's a file (not a directory)
    if not path.is_file():
        raise ValueError(f"Path is not a file: {file_path}")

    # Get file extension
    extension = path.suffix.lower()
    if extension not in ['.pdf', '.docx']:
        raise ValueError(f"Unsupported file type: {extension}. Must be .pdf or .docx")

    # Read file and convert
    with open(file_path, 'rb') as f:
        binary_data = f.read()

    # Remove the dot from extension for the conversion function
    file_type = extension[1:]
    return binary_document_to_markdown(binary_data, file_type)
