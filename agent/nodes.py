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
    """
    response = llm_with_compliance_tools.invoke(
        [
            SystemMessage(content="""You are a federal grant compliance specialist.
Call check_organization_eligibility exactly once right now.
Do not ask questions. Do not explain. Just call the tool.
Use the organization name from the user request.
Use the first numeric Grant ID you find in the research results.
If no ID is found, use 347329 as the default."""),
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


def human_review(state: AgentState) -> dict:
    """
    Pauses execution and waits for human input via LangGraph interrupt().
    The graph resumes when a human sends Command(resume=...) with their decision.
    """
    decision = interrupt({
        "message": "Please review the grant research and compliance findings below.",
        "research_summary": state["research_results"],
        "compliance_summary": state["compliance_results"],
        "instructions": "Respond with approve to generate the final report, or provide feedback to revise."
    })
    return {"human_decision": decision}


def report_agent(state: AgentState) -> dict:
    """
    Generates the final report from all accumulated state.
    No hardcoded org names or grant IDs — everything derives from state.
    Writes to final_report (signals completion to supervisor) and to
    messages (keeps output visible in LangGraph Studio after the run ends).
    """
    prompt = (
        f"Generate a professional federal grant opportunity report.\n\n"
        f"Original Request: {state['user_request']}\n\n"
        f"Research Findings:\n{state['research_results']}\n\n"
        f"Compliance Analysis:\n{state['compliance_results']}\n\n"
        f"Reviewer Notes: {state['human_decision']}\n\n"
        f"Structure the report with:\n"
        f"1. Executive Summary\n"
        f"2. Recommended Grant Opportunities (with IDs, amounts, deadlines)\n"
        f"3. Eligibility Status for Each Grant\n"
        f"4. Required Next Steps\n"
        f"5. Timeline to Application"
    )
    response = llm.invoke(
        [HumanMessage(content=prompt)],
        config={"run_name": "report_agent", "tags": ["report", "synthesis"], "metadata": {"agent": "report", "step": 5}},
    )
    return {
        "final_report": response.content,
        "messages": [AIMessage(content="FINAL REPORT\n" + "=" * 50 + "\n\n" + response.content)]
    }
