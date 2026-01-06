from pydantic import Field
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("DocumentMCP", log_level="ERROR")


docs = {
    "deposition.md": "This deposition covers the testimony of Angela Smith, P.E.",
    "report.pdf": "The report details the state of a 20m condenser tower.",
    "financials.docx": "These financials outline the project's budget and expenditures.",
    "outlook.pdf": "This document presents the projected future performance of the system.",
    "plan.md": "The plan outlines the steps for the project's implementation.",
    "spec.txt": "These specifications define the technical requirements for the equipment.",
}

# TODO: Write a tool to read a doc
@mcp.tool(
    name="read_doc",
    description="Read the contents of a document.")
def read_doc(doc_id: str = Field(description="The ID of the document to read")):
    if doc_id not in docs:
        raise ValueError(f"Document with ID {doc_id} not found")
    return docs.get(doc_id, f"Document with ID {doc_id} not found")

# TODO: Write a tool to edit a doc
@mcp.tool(
    name="edit_doc",
    description="Edit the contents of a document.")
def edit_doc(
    doc_id: str = Field(description="The ID of the document to edit"),
    old_str: str = Field(description="The text to replace. Must match exactly, including whitespace."),
    new_content: str = Field(description="The new content for the document"),
):
    if doc_id not in docs:
        raise ValueError(f"Document with ID {doc_id} not found")
    docs[doc_id] = docs[doc_id].replace(old_str, new_content)
    return f"Document {doc_id} updated successfully"

# TODO: Write a resource to return all doc id's
@mcp.tool(
    name="list_docs",
    description="List all document IDs.")
def list_docs():
    return docs.keys()

# TODO: Write a resource to return the contents of a particular doc
@mcp.tool(
    name="read_doc",
    description="Read the contents of a document.")
def read_doc(doc_id: str = Field(description="The ID of the document to read")):
    if doc_id not in docs:
        raise ValueError(f"Document with ID {doc_id} not found")
    return docs.get(doc_id, f"Document with ID {doc_id} not found")

# TODO: Write a prompt to rewrite a doc in markdown format
# TODO: Write a prompt to summarize a doc


if __name__ == "__main__":
    mcp.run(transport="stdio")
