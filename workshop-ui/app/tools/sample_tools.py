"""Sample tools for demonstration."""

from datetime import datetime

SAMPLE_TOOLS = [
    {
        "name": "calculator",
        "description": "Perform basic math calculations. Supports +, -, *, /, and parentheses.",
        "input_schema": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "The mathematical expression to evaluate"
                }
            },
            "required": ["expression"]
        }
    },
    {
        "name": "get_current_time",
        "description": "Get the current date and time.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "get_weather",
        "description": "Get the current weather for a location (mock data).",
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "The city name"
                }
            },
            "required": ["location"]
        }
    }
]


def execute_tool(tool_name: str, tool_input: dict) -> str:
    """Execute a sample tool and return the result."""
    if tool_name == "calculator":
        try:
            expression = tool_input.get("expression", "")
            allowed = set("0123456789+-*/(). ")
            if not all(c in allowed for c in expression):
                return "Error: Invalid characters in expression"
            result = eval(expression)
            return f"Result: {result}"
        except Exception as e:
            return f"Error: {str(e)}"

    elif tool_name == "get_current_time":
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    elif tool_name == "get_weather":
        location = tool_input.get("location", "Unknown")
        return f"Weather in {location}: Sunny, 22°C (72°F), Humidity: 45%"

    else:
        return f"Unknown tool: {tool_name}"
