#!/usr/bin/env python3
"""Test script to verify MCP server tool registration."""

import asyncio
from main import mcp

async def test_mcp_tools():
    """Verify that all expected tools are registered."""
    print("Testing MCP Server Configuration...")
    print(f"Server name: {mcp.name}")
    print(f"\nRegistered tools:")

    # Get list of registered tools
    tools = await mcp.list_tools()

    if not tools:
        print("  No tools found!")
        return False

    for tool in tools:
        print(f"  - {tool.name}")
        if hasattr(tool, 'description') and tool.description:
            print(f"    Description: {tool.description}")
        if hasattr(tool, 'inputSchema'):
            print(f"    Parameters: {list(tool.inputSchema.get('properties', {}).keys())}")

    # Verify expected tools are present
    tool_names = [tool.name for tool in tools]
    expected_tools = ['add', 'document_to_markdown']

    print(f"\nExpected tools: {expected_tools}")
    print(f"Found tools: {tool_names}")

    missing = set(expected_tools) - set(tool_names)
    if missing:
        print(f"\n❌ FAIL: Missing tools: {missing}")
        return False

    print(f"\n✅ SUCCESS: All expected tools are registered!")
    return True

if __name__ == "__main__":
    success = asyncio.run(test_mcp_tools())
    exit(0 if success else 1)
