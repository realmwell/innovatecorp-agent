# evaluation/evaluators.py
#
# Four custom evaluators for LangSmith's evaluate() framework.
# Two deterministic (fast, cheap) + two LLM-as-judge (nuanced).
#
# Each evaluator receives:
#   run   - the LangSmith Run object (has outputs from the target function)
#   example - the dataset Example object (has inputs + reference outputs)
#
# Each returns a dict with "key" (metric name) and "score" (0.0 to 1.0).

import re
from langsmith.schemas import Run, Example
from langchain_aws import ChatBedrockConverse
from langchain_core.messages import HumanMessage, SystemMessage


def _get_judge_llm():
    """Lazy-init judge LLM. Separate from agent LLM to avoid import cycles."""
    return ChatBedrockConverse(
        model="us.anthropic.claude-3-5-haiku-20241022-v1:0",
        region_name="us-east-1",
        temperature=0,
    )


# ---------------------------------------------------------------------------
# 1. Grant Relevance (LLM-as-judge)
#    Asks an LLM whether the research results contain grants relevant to
#    the user's original request domain.
# ---------------------------------------------------------------------------

def grant_relevance(run: Run, example: Example) -> dict:
    """Score whether returned grants are relevant to the user's request."""
    outputs = run.outputs or {}
    research = outputs.get("research_results", "")
    user_request = example.inputs.get("user_request", "")
    domains = example.outputs.get("domains", [])

    if not research:
        return {"key": "grant_relevance", "score": 0.0, "comment": "No research results produced"}

    llm = _get_judge_llm()
    response = llm.invoke([
        SystemMessage(content="""You are evaluating whether grant search results are relevant.
Score from 0.0 to 1.0:
- 1.0: All grants are clearly relevant to the user's domain
- 0.7: Most grants are relevant, some tangential
- 0.4: Mixed relevance, some relevant some not
- 0.1: Mostly irrelevant grants
- 0.0: No grants found or completely off-topic

Respond with ONLY a JSON object: {"score": X.X, "reason": "brief explanation"}"""),
        HumanMessage(content=f"""User request: {user_request}
Expected domains: {', '.join(domains)}

Research results:
{research[:2000]}""")
    ])

    try:
        import json
        result = json.loads(response.content)
        return {
            "key": "grant_relevance",
            "score": float(result["score"]),
            "comment": result.get("reason", ""),
        }
    except (json.JSONDecodeError, KeyError, ValueError):
        # If the LLM didn't return valid JSON, give partial credit
        # if the response mentions relevance positively
        content = response.content.lower()
        score = 0.5 if "relevant" in content else 0.2
        return {"key": "grant_relevance", "score": score, "comment": f"Parse error: {response.content[:200]}"}


# ---------------------------------------------------------------------------
# 2. Compliance Completeness (deterministic)
#    Checks that the compliance report mentions required fields:
#    SAM.gov status, registration details, and eligibility determination.
# ---------------------------------------------------------------------------

def compliance_completeness(run: Run, example: Example) -> dict:
    """Score whether compliance results contain all required fields."""
    outputs = run.outputs or {}
    compliance = outputs.get("compliance_results", "")

    if not compliance:
        return {"key": "compliance_completeness", "score": 0.0, "comment": "No compliance results produced"}

    required_fields = example.outputs.get("compliance_fields", ["SAM.gov", "registration", "eligibility"])
    compliance_lower = compliance.lower()

    found = []
    missing = []
    for field in required_fields:
        if field.lower() in compliance_lower:
            found.append(field)
        else:
            missing.append(field)

    score = len(found) / len(required_fields) if required_fields else 0.0
    comment = f"Found: {found}" + (f" | Missing: {missing}" if missing else "")

    return {"key": "compliance_completeness", "score": score, "comment": comment}


# ---------------------------------------------------------------------------
# 3. Report Structure (deterministic)
#    Checks that the final report contains all 5 required sections.
#    Flexible matching: looks for keywords rather than exact headers.
# ---------------------------------------------------------------------------

def report_structure(run: Run, example: Example) -> dict:
    """Score whether the final report has all required sections."""
    outputs = run.outputs or {}
    report = outputs.get("final_report", "")

    if not report:
        return {"key": "report_structure", "score": 0.0, "comment": "No final report produced"}

    expected_sections = example.outputs.get("report_sections", [])
    report_lower = report.lower()

    # Map each expected section to flexible keyword patterns
    section_patterns = {
        "Executive Summary": ["executive summary", "overview", "summary"],
        "Recommended Grant Opportunities": ["recommended", "grant opportunit", "opportunities"],
        "Eligibility Status": ["eligibility", "eligible", "compliance status"],
        "Required Next Steps": ["next steps", "action items", "requirements"],
        "Timeline": ["timeline", "schedule", "deadline", "application timeline"],
    }

    found = []
    missing = []
    for section in expected_sections:
        patterns = section_patterns.get(section, [section.lower()])
        if any(p in report_lower for p in patterns):
            found.append(section)
        else:
            missing.append(section)

    score = len(found) / len(expected_sections) if expected_sections else 0.0
    comment = f"Found: {found}" + (f" | Missing: {missing}" if missing else "")

    return {"key": "report_structure", "score": score, "comment": comment}


# ---------------------------------------------------------------------------
# 4. Factual Grounding (deterministic)
#    Checks that grant IDs and agency names appear in the output,
#    confirming the agent used real data rather than hallucinating.
# ---------------------------------------------------------------------------

def factual_grounding(run: Run, example: Example) -> dict:
    """Score whether outputs contain verifiable facts (grant IDs, agencies)."""
    outputs = run.outputs or {}
    research = outputs.get("research_results", "")
    report = outputs.get("final_report", "")
    combined = research + "\n" + report

    if not combined.strip():
        return {"key": "factual_grounding", "score": 0.0, "comment": "No outputs to check"}

    checks = {
        "has_grant_ids": bool(re.search(r'\b\d{5,7}\b', combined)),
        "has_agency_names": any(
            agency in combined
            for agency in ["Department of", "Agency", "DOE", "NSF", "NIH", "USDA", "EPA", "DOD", "NOAA", "NASA"]
        ),
        "has_dollar_amounts": bool(re.search(r'\$[\d,]+', combined)),
        "has_dates": bool(re.search(r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\w+ \d{1,2},? \d{4}', combined)),
    }

    passed = sum(checks.values())
    total = len(checks)
    score = passed / total

    detail = " | ".join(f"{k}: {'yes' if v else 'no'}" for k, v in checks.items())
    return {"key": "factual_grounding", "score": score, "comment": detail}
