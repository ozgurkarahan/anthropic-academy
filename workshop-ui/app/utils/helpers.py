"""Helper utilities."""

from datetime import datetime


def truncate_base64(obj, max_length=100):
    """Recursively truncate base64 data in nested structures for debug display."""
    if isinstance(obj, dict):
        result = {}
        for key, value in obj.items():
            if key in ('data', 'base64') and isinstance(value, str) and len(value) > max_length:
                result[key] = f"{value[:max_length]}... [truncated, {len(value)} chars total]"
            else:
                result[key] = truncate_base64(value, max_length)
        return result
    elif isinstance(obj, list):
        return [truncate_base64(item, max_length) for item in obj]
    else:
        return obj


def format_request_for_debug(endpoint: str, params: dict) -> dict:
    """Format the request parameters for debug display."""
    debug_params = params.copy()
    if "api_key" in debug_params.get("config", {}):
        debug_params["config"] = debug_params["config"].copy()
        debug_params["config"]["api_key"] = "sk-...hidden..."
    debug_params = truncate_base64(debug_params)
    return {
        "endpoint": endpoint,
        "timestamp": datetime.now().isoformat(),
        "parameters": debug_params
    }
