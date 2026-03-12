# graph.py
# Simplified architecture — no ReAct loops.
# Each agent node calls the LLM to get a tool call decision,
# the tool executes once, then we go straight to synthesis.
# This prevents infinite loops by making tool execution linear.

from langgraph.graph import StateGraph, START, END
from agent.state import AgentState
from agent.nodes import (
    supervisor,
    research_agent,
    research_tool_node,
    research_synthesizer,
    compliance_agent,
    compliance_tool_node,
    compliance_synthesizer,
    human_review,
    report_agent
)


def route_supervisor(state: AgentState) -> str:
    """Routes based on the supervisor's decision."""
    return state["next_agent"]


# Build the graph
builder = StateGraph(AgentState)

# Register all nodes
builder.add_node("supervisor", supervisor)
builder.add_node("research_agent", research_agent)
builder.add_node("research_tools", research_tool_node)
builder.add_node("research_synthesizer", research_synthesizer)
builder.add_node("compliance_agent", compliance_agent)
builder.add_node("compliance_tools", compliance_tool_node)
builder.add_node("compliance_synthesizer", compliance_synthesizer)
builder.add_node("human_review", human_review)
builder.add_node("report_agent", report_agent)

# Entry point
builder.add_edge(START, "supervisor")

# Supervisor routes to the right specialist
builder.add_conditional_edges(
    "supervisor",
    route_supervisor,
    {
        "research_agent": "research_agent",
        "compliance_agent": "compliance_agent",
        "human_review": "human_review",
        "report_agent": "report_agent",
        "FINISH": END
    }
)

# Research flow: agent → tools → synthesizer → supervisor
# LINEAR, no loop. The agent generates ONE tool call,
# the tool executes it ONCE, then we move straight to synthesis.
builder.add_edge("research_agent", "research_tools")
builder.add_edge("research_tools", "research_synthesizer")
builder.add_edge("research_synthesizer", "supervisor")

# Compliance flow: same linear pattern
builder.add_edge("compliance_agent", "compliance_tools")
builder.add_edge("compliance_tools", "compliance_synthesizer")
builder.add_edge("compliance_synthesizer", "supervisor")

# After human review and report, return to supervisor
builder.add_edge("human_review", "supervisor")
builder.add_edge("report_agent", "supervisor")

# Compile WITHOUT a checkpointer. The LangGraph API Server (langgraph dev /
# langgraph build) provides its own PostgreSQL-backed checkpointer automatically.
# For standalone use (tests, evaluations), compile with MemorySaver:
#
#   from langgraph.checkpoint.memory import MemorySaver
#   standalone = builder.compile(checkpointer=MemorySaver())
#
graph = builder.compile()