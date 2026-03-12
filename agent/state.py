# state.py
# This file defines the "shared memory" of your agent system.
# Think of AgentState as a whiteboard that every agent in your graph
# can read from and write to. Each node receives the full state,
# does its work, and returns only the fields it changed.

from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    # The original request from the user — set once at the start, never changed
    user_request: str
    
    # Full conversation history across all agents.
    # add_messages is a special reducer that APPENDS new messages
    # rather than overwriting — so the history accumulates as agents work
    messages: Annotated[list, add_messages]
    
    # The supervisor writes this field to tell the graph which agent to run next
    next_agent: str
    
    # Each specialist agent writes its findings into its own field
    # so other agents can read them later
    research_results: str
    compliance_results: str
    
    # The human reviewer's response at the approval checkpoint
    human_decision: str
    
    # The final client-ready report, written by the report agent at the end
    final_report: str