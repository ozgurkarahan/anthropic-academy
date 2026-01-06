import os
import pytest
import tempfile
from pathlib import Path
from tools.document import document_to_markdown


class TestDocumentToMarkdown:
    """Tests for the document_to_markdown function that takes a file path."""

    # Define fixture paths
    FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
    DOCX_FIXTURE = os.path.join(FIXTURES_DIR, "mcp_docs.docx")
    PDF_FIXTURE = os.path.join(FIXTURES_DIR, "mcp_docs.pdf")

    @pytest.fixture
    def empty_pdf(self, tmp_path):
        """Create a minimal empty PDF file for testing."""
        # Minimal valid PDF structure
        pdf_content = b"""%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids []
/Count 0
>>
endobj
xref
0 3
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
trailer
<<
/Size 3
/Root 1 0 R
>>
startxref
110
%%EOF
"""
        empty_pdf_path = tmp_path / "empty.pdf"
        empty_pdf_path.write_bytes(pdf_content)
        return str(empty_pdf_path)

    @pytest.fixture
    def empty_docx(self, tmp_path):
        """Create a minimal empty DOCX file for testing."""
        import zipfile
        from io import BytesIO

        # Create a minimal valid DOCX structure
        empty_docx_path = tmp_path / "empty.docx"

        # DOCX is a ZIP file with specific structure
        with zipfile.ZipFile(empty_docx_path, 'w', zipfile.ZIP_DEFLATED) as docx:
            # Add minimal required files for a valid DOCX

            # [Content_Types].xml
            content_types = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""
            docx.writestr('[Content_Types].xml', content_types)

            # _rels/.rels
            rels = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
            docx.writestr('_rels/.rels', rels)

            # word/document.xml (empty document)
            document = b"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body/>
</w:document>"""
            docx.writestr('word/document.xml', document)

        return str(empty_docx_path)

    def test_valid_pdf_conversion(self):
        """Test 1: Valid PDF conversion - Test with a simple PDF containing plain text."""
        result = document_to_markdown(self.PDF_FIXTURE)

        # Assertions
        assert isinstance(result, str), "Result should be a string"
        assert len(result) > 0, "Result should not be empty"
        # Check for typical markdown or text content
        assert any(char.isalnum() for char in result), "Result should contain alphanumeric content"

    def test_valid_docx_conversion(self):
        """Test 2: Valid DOCX conversion - Test with a simple DOCX containing plain text."""
        result = document_to_markdown(self.DOCX_FIXTURE)

        # Assertions
        assert isinstance(result, str), "Result should be a string"
        assert len(result) > 0, "Result should not be empty"
        # Check for typical markdown or text content
        assert any(char.isalnum() for char in result), "Result should contain alphanumeric content"

    def test_empty_pdf(self, empty_pdf):
        """Test 8: Empty PDF - File exists but has no content."""
        result = document_to_markdown(empty_pdf)

        # Assertions
        assert isinstance(result, str), "Result should be a string"
        # Empty PDF should still return a string (might be empty or whitespace)
        # markitdown might return empty string or minimal content

    def test_empty_docx(self, empty_docx):
        """Test 9: Empty DOCX - File exists but has no content."""
        result = document_to_markdown(empty_docx)

        # Assertions
        assert isinstance(result, str), "Result should be a string"
        # Empty DOCX should still return a string (might be empty or whitespace)

    def test_non_existent_file(self):
        """Test 14: Non-existent file path - Should raise FileNotFoundError."""
        non_existent_path = "/path/to/non/existent/file.pdf"

        with pytest.raises(FileNotFoundError) as exc_info:
            document_to_markdown(non_existent_path)

        # Check that the error message contains the file path
        assert non_existent_path in str(exc_info.value)
