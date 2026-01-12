"""Prompt evaluation endpoints."""

import json
import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter
import anthropic

from ..models.eval import GenerateDatasetRequest, EvalRunRequest, TestCase
from ..utils.client import get_client

router = APIRouter()


@router.post("/eval/generate-dataset")
async def generate_dataset(request: GenerateDatasetRequest):
    """Generate test cases using Claude."""
    client = get_client(request.config)

    prompt = f"""Generate an evaluation dataset with {request.count} test cases for the following context/domain:

<context>
{request.context}
</context>

Generate exactly {request.count} test cases. Each test case should have:
- "input": A realistic user question or input for this context
- "expected_output": The ideal expected response

Return a JSON array of objects with "input" and "expected_output" fields.
Example format:
```json
[
    {{"input": "Question 1", "expected_output": "Expected answer 1"}},
    {{"input": "Question 2", "expected_output": "Expected answer 2"}}
]
```

Generate diverse and realistic test cases that cover different aspects of the context.
Respond with ONLY the JSON array, no other text."""

    try:
        response = client.messages.create(
            model=request.config.model,
            max_tokens=4096,
            messages=[
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": "```json\n["}
            ],
            stop_sequences=["```"]
        )

        response_text = "[" + response.content[0].text
        cases = json.loads(response_text)

        validated_cases = []
        for case in cases:
            if isinstance(case, dict) and "input" in case and "expected_output" in case:
                validated_cases.append({
                    "input": str(case["input"]),
                    "expected_output": str(case["expected_output"])
                })

        return {
            "success": True,
            "cases": validated_cases,
            "debug": {
                "model": request.config.model,
                "context": request.context,
                "requested_count": request.count,
                "generated_count": len(validated_cases)
            }
        }

    except json.JSONDecodeError as e:
        return {"success": False, "error": f"Failed to parse generated JSON: {str(e)}"}
    except anthropic.APIError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": f"Error: {type(e).__name__}: {str(e)}"}


@router.post("/eval/run")
async def run_evaluation(request: EvalRunRequest):
    """Run prompt evaluation on a dataset using LLM-as-Judge."""
    client = get_client(request.config)

    criteria_descriptions = {
        "accuracy": "Accuracy: The response is factually correct and matches the expected output",
        "relevance": "Relevance: The response directly addresses the input question",
        "tone": "Tone: The response uses an appropriate tone for the context",
        "completeness": "Completeness: The response covers all aspects of the question",
        "conciseness": "Conciseness: The response is clear and not unnecessarily verbose"
    }

    criteria_text = []
    for c in request.criteria:
        if c.startswith("custom:"):
            criteria_text.append(f"- {c[7:]}")
        elif c in criteria_descriptions:
            criteria_text.append(f"- {criteria_descriptions[c]}")
    criteria_str = "\n".join(criteria_text)

    results = []

    async def evaluate_single_case(test_case: TestCase, idx: int):
        """Evaluate a single test case."""
        try:
            gen_messages = [{"role": "user", "content": test_case.input}]
            gen_params = {
                "model": request.config.model,
                "max_tokens": 2048,
                "messages": gen_messages
            }
            if request.system_prompt:
                gen_params["system"] = request.system_prompt

            gen_response = client.messages.create(**gen_params)
            actual_output = gen_response.content[0].text

            judge_prompt = f"""You are an expert evaluator. Evaluate the AI response against the expected output.

INPUT:
<input>
{test_case.input}
</input>

EXPECTED OUTPUT:
<expected>
{test_case.expected_output}
</expected>

ACTUAL OUTPUT:
<actual>
{actual_output}
</actual>

EVALUATION CRITERIA:
{criteria_str}

Evaluate the actual output and provide:
1. A score from 1 to 5 (1=very poor, 2=poor, 3=acceptable, 4=good, 5=excellent)
2. A brief justification
3. 1-3 strengths
4. 1-3 weaknesses

Respond with a JSON object in this exact format:
{{
    "score": <number 1-5>,
    "justification": "<brief explanation>",
    "strengths": ["<strength1>", "<strength2>"],
    "weaknesses": ["<weakness1>", "<weakness2>"]
}}"""

            judge_response = client.messages.create(
                model=request.config.model,
                max_tokens=1024,
                messages=[
                    {"role": "user", "content": judge_prompt},
                    {"role": "assistant", "content": "```json\n{"}
                ],
                stop_sequences=["```"]
            )

            judge_text = "{" + judge_response.content[0].text
            judge_result = json.loads(judge_text)

            return {
                "index": idx,
                "input": test_case.input,
                "expected_output": test_case.expected_output,
                "actual_output": actual_output,
                "score": int(judge_result.get("score", 3)),
                "justification": judge_result.get("justification", ""),
                "strengths": judge_result.get("strengths", []),
                "weaknesses": judge_result.get("weaknesses", [])
            }

        except json.JSONDecodeError:
            return {
                "index": idx,
                "input": test_case.input,
                "expected_output": test_case.expected_output,
                "actual_output": actual_output if 'actual_output' in dir() else "Error generating response",
                "score": 1,
                "justification": "Failed to parse judge response",
                "strengths": [],
                "weaknesses": ["Evaluation error"]
            }
        except Exception as e:
            return {
                "index": idx,
                "input": test_case.input,
                "expected_output": test_case.expected_output,
                "actual_output": f"Error: {str(e)}",
                "score": 1,
                "justification": f"Error during evaluation: {str(e)}",
                "strengths": [],
                "weaknesses": ["Error during evaluation"]
            }

    def run_eval(args):
        tc, idx = args
        return asyncio.run(evaluate_single_case(tc, idx))

    with ThreadPoolExecutor(max_workers=min(10, len(request.dataset))) as executor:
        futures = {executor.submit(run_eval, (tc, idx)): idx for idx, tc in enumerate(request.dataset)}
        for future in as_completed(futures):
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                idx = futures[future]
                results.append({
                    "index": idx,
                    "input": request.dataset[idx].input,
                    "expected_output": request.dataset[idx].expected_output,
                    "actual_output": "Error",
                    "score": 1,
                    "justification": f"Error: {str(e)}",
                    "strengths": [],
                    "weaknesses": ["Execution error"]
                })

    results.sort(key=lambda x: x["index"])

    scores = [r["score"] for r in results]
    avg_score = sum(scores) / len(scores) if scores else 0
    pass_count = sum(1 for s in scores if s >= 4)
    pass_rate = (pass_count / len(scores) * 100) if scores else 0

    return {
        "success": True,
        "results": results,
        "stats": {
            "avg_score": avg_score,
            "pass_rate": pass_rate,
            "total": len(results),
            "passed": pass_count
        },
        "debug": {
            "model": request.config.model,
            "criteria": request.criteria,
            "system_prompt_length": len(request.system_prompt) if request.system_prompt else 0
        }
    }
