# nodes.py
import os
from dotenv import load_dotenv
load_dotenv()

from langchain_aws import ChatBedrockConverse
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage
from langgraph.prebuilt import ToolNode
from langgraph.types import interrupt
from agent.state import AgentState
from agent.tools import search_grants, check_organization_eligibility

llm = ChatBedrockConverse(
    model="us.anthropic.claude-3-5-haiku-20241022-v1:0",
    region_name="us-east-1",
    temperature=0,
)

research_tools = [search_grants]
compliance_tools = [check_organization_eligibility]

research_tool_node = ToolNode(research_tools)
compliance_tool_node = ToolNode(compliance_tools)

llm_with_research_tools = llm.bind_tools(research_tools)
llm_with_compliance_tools = llm.bind_tools(compliance_tools)


def _last_tool_result(messages: list) -> str:
    """
    Returns the content of the most recent ToolMessage in the history.
    Synthesizers call this to read only the data they need rather than
    the full conversation, which prevents the LLM from getting confused
    about its role when the message history grows long.
    """
    for msg in reversed(messages):
        if isinstance(msg, ToolMessage):
            return msg.content
    return "No tool result found."


def supervisor(state: AgentState) -> dict:
    """
    Pure Python routing — no LLM call.
    The decision is 100% deterministic based on which state fields are
    filled, so involving an LLM just introduces ambiguity and cost.
    Rule of thumb: use LLMs for judgment, use code for logic.
    """
    if not state.get("research_results"):
        next_node = "research_agent"
    elif not state.get("compliance_results"):
        next_node = "compliance_agent"
    elif not state.get("human_decision"):
        next_node = "human_review"
    elif not state.get("final_report"):
        next_node = "report_agent"
    else:
        next_node = "FINISH"
    return {"next_agent": next_node}


def research_agent(state: AgentState) -> dict:
    """
    Calls search_grants once based on the user request.
    Strict prompt prevents Haiku from narrating instead of calling the tool.
    """
    response = llm_with_research_tools.invoke(
        [
            SystemMessage(content="Call the search_grants tool exactly once with a keyword query from the user request. Do not narrate. Just call the tool."),
            HumanMessage(content=state["user_request"])
        ],
        config={"run_name": "research_agent", "tags": ["research", "tool-calling"], "metadata": {"agent": "research", "step": 1}},
    )
    return {"messages": [response]}


def research_synthesizer(state: AgentState) -> dict:
    """
    Extracts the raw tool result and writes a structured brief to
    state['research_results']. Passes ONLY the tool result text —
    not the full message history — so the LLM stays focused on
    data extraction rather than the broader conversation context.
    The output must include numeric Grant IDs verbatim because the
    compliance agent depends on finding a real ID in this field.
    """
    tool_result = _last_tool_result(state["messages"])
    response = llm.invoke(
        [
            SystemMessage(content="""You are a data extraction assistant.
Report exactly what the grant search tool returned. Do not editorialize.
Do not say results were unsatisfactory. Never ask for clarification.

For each grant output EXACTLY this format:
Grant ID: [numeric ID]
Title: [title]
Agency: [agency]
Close Date: [date or Not specified]
Award Ceiling: [amount or Not specified]
Fit: [one sentence on relevance]

Include ALL grants returned."""),
            HumanMessage(content=f"Summarize these grant search results:\n\n{tool_result}")
        ],
        config={"run_name": "research_synthesizer", "tags": ["research", "synthesis"], "metadata": {"agent": "research_synthesizer", "step": 2}},
    )
    return {
        "research_results": response.content,
        "messages": [response]
    }


def compliance_agent(state: AgentState) -> dict:
    """
    Calls check_organization_eligibility with a real grant ID extracted
    from research_results. Never asks for clarification — always calls
    the tool. The org name comes from user_request, not hardcoded.
    Also passes the original search keywords so the compliance tool
    can cross-reference grants using the same terms.
    """
    response = llm_with_compliance_tools.invoke(
        [
            SystemMessage(content="""You are a federal grant compliance specialist.
Call check_organization_eligibility exactly once right now.
Do not ask questions. Do not explain. Just call the tool.
Use the organization name from the user request.
Use the first numeric Grant ID you find in the research results.
If no ID is found, use 347329 as the default.
For search_keywords, extract the core topic from the user request (e.g., 'renewable energy', 'healthcare research')."""),
            HumanMessage(content=f"User request: {state['user_request']}\n\nResearch results:\n{state['research_results']}")
        ],
        config={"run_name": "compliance_agent", "tags": ["compliance", "tool-calling"], "metadata": {"agent": "compliance", "step": 3}},
    )
    return {"messages": [response]}


def compliance_synthesizer(state: AgentState) -> dict:
    """
    Extracts the eligibility tool result and writes a structured summary
    to state['compliance_results']. Same pattern as research_synthesizer:
    passes ONLY the tool result, not full message history. This prevents
    the LLM from seeing the demo UEI note and asking the user for their
    real credentials.
    """
    tool_result = _last_tool_result(state["messages"])
    response = llm.invoke(
        [
            SystemMessage(content="""You are a compliance analysis assistant.
Summarize the eligibility check results into a clear compliance brief.
Report only what the tool returned. Do not ask for more information.
Do not request a UEI or any additional credentials.
State the eligibility status, SAM.gov registration findings, and concrete next steps."""),
            HumanMessage(content=f"Summarize these eligibility check results:\n\n{tool_result}")
        ],
        config={"run_name": "compliance_synthesizer", "tags": ["compliance", "synthesis"], "metadata": {"agent": "compliance_synthesizer", "step": 4}},
    )
    return {
        "compliance_results": response.content,
        "messages": [response]
    }


def _parse_grants(research_text: str) -> list:
    """
    Extracts structured grant data from the research_synthesizer's text output.
    Returns a list of dicts with id, title, agency, close_date, award_ceiling, fit.
    """
    grants = []
    current = {}
    for line in research_text.split("\n"):
        line = line.strip()
        if line.startswith("Grant ID:"):
            if current.get("id"):
                grants.append(current)
            current = {"id": line.split(":", 1)[1].strip(), "selected": True}
        elif line.startswith("Title:"):
            current["title"] = line.split(":", 1)[1].strip()
        elif line.startswith("Agency:"):
            current["agency"] = line.split(":", 1)[1].strip()
        elif line.startswith("Close Date:"):
            current["close_date"] = line.split(":", 1)[1].strip()
        elif line.startswith("Award Ceiling:"):
            current["award_ceiling"] = line.split(":", 1)[1].strip()
        elif line.startswith("Fit:"):
            current["fit"] = line.split(":", 1)[1].strip()
    if current.get("id"):
        grants.append(current)
    return grants


def _parse_compliance(compliance_text: str) -> dict:
    """
    Extracts structured compliance data from the compliance_synthesizer's text.
    """
    info = {
        "raw": compliance_text,
        "sam_status": "Unknown",
        "legal_name": "",
        "uei": "",
        "expiry": "",
    }
    for line in compliance_text.split("\n"):
        line = line.strip()
        if "Registration Status:" in line:
            info["sam_status"] = line.split(":", 1)[1].strip()
        elif "Legal Name" in line and ":" in line:
            info["legal_name"] = line.split(":", 1)[1].strip()
        elif "UEI" in line and ":" in line:
            info["uei"] = line.split(":", 1)[1].strip()
        elif "Expir" in line and ":" in line:
            info["expiry"] = line.split(":", 1)[1].strip()
        elif "ELIGIBLE" in line:
            if "NOT ELIGIBLE" in line:
                info["sam_status"] = "Inactive"
            else:
                info["sam_status"] = "Active"
    return info


def human_review(state: AgentState) -> dict:
    """
    Pauses execution with structured data for the human to make real decisions.
    The frontend renders grant cards with checkboxes, compliance status,
    and a guidance notes field. The human's structured response shapes the report.
    """
    grants = _parse_grants(state["research_results"])
    compliance = _parse_compliance(state["compliance_results"])

    decision = interrupt({
        "type": "structured_review",
        "grants": grants,
        "compliance": compliance,
        "research_raw": state["research_results"],
        "compliance_raw": state["compliance_results"],
        "instructions": "Select which grants to include in the final report, review compliance status, and add any guidance notes."
    })
    return {"human_decision": decision}


def report_agent(state: AgentState) -> dict:
    """
    Generates a professional executive briefing from all accumulated state.
    The report includes hyperlinks, compliance analysis, and is structured
    as a real deliverable an executive would review.
    """
    from datetime import date
    today = date.today().strftime("%B %d, %Y")

    prompt = f"""Generate a professional Federal Grant Opportunity Briefing in markdown format.

Original Request: {state['user_request']}

Research Findings:
{state['research_results']}

Compliance & Eligibility Analysis:
{state['compliance_results']}

Human Reviewer Input: {state['human_decision']}

Format the report EXACTLY as follows using markdown. Include real hyperlinks to grants.gov for each grant ID using the format: [Grant Title](https://www.grants.gov/search-results-detail/GRANT_ID)

---

# Federal Grant Opportunity Briefing

**Prepared for:** [extract org name from user request]
**Date:** {today}
**Classification:** For Internal Use Only

---

## Executive Summary

[2-3 sentences summarizing the findings, number of opportunities identified, and compliance status]

## Recommended Grant Opportunities

For EACH grant found, create a subsection:

### [Grant Title]

- **Grant ID:** [ID] — [View on grants.gov](https://www.grants.gov/search-results-detail/GRANT_ID)
- **Agency:** [agency name]
- **Award Ceiling:** [amount]
- **Close Date:** [date]
- **Relevance:** [one sentence on why this matches the request]

If the human reviewer deselected any grants or provided priority notes, reflect that here. Only include grants the reviewer selected. Note any priority guidance.

## Compliance & Eligibility Analysis

- **SAM.gov Registration:** [status — Active/Inactive/Not Found]
- **UEI:** [UEI if found]
- **Legal Entity Name:** [name from SAM.gov]
- **Registration Expiry:** [date]
- **Eligibility Determination:** [eligible or not, with explanation]
- **Compliance Notes from Reviewer:** [any notes the human provided]

## Risk Assessment

Identify 2-3 specific risks based on the actual data:
- Compliance risks (registration gaps, expiring status)
- Timeline risks (close dates vs preparation time)
- Capacity considerations

## Recommended Next Steps

Numbered action items with specific deadlines relative to grant close dates:
1. [Action] — by [date]
2. [Action] — by [date]
3. [Action] — by [date]

## Data Sources

- grants.gov Search API (live data, queried {today})
- SAM.gov Entity API (live registration check, queried {today})
- Human review and prioritization input

---

IMPORTANT: Use ONLY data from the research and compliance findings above. Do not fabricate grant IDs, amounts, or dates. Every fact must trace back to the API results provided."""

    response = llm.invoke(
        [HumanMessage(content=prompt)],
        config={"run_name": "report_agent", "tags": ["report", "synthesis"], "metadata": {"agent": "report", "step": 5}},
    )
    return {
        "final_report": response.content,
        "messages": [AIMessage(content="FINAL REPORT\n" + "=" * 50 + "\n\n" + response.content)]
    }
