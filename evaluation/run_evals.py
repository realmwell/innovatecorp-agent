# evaluation/run_evals.py
#
# Runs the full evaluation suite against the LangSmith dataset.
# The target function invokes the agent graph end-to-end for each
# test scenario, then extracts the state fields evaluators need.
#
# Usage:
#   python -m evaluation.run_evals
#
# Results appear in LangSmith under Datasets > innovatecorp-grant-research

import uuid
from dotenv import load_dotenv
load_dotenv()

from langsmith import Client, evaluate
from langgraph.types import Command
from langgraph.checkpoint.memory import MemorySaver

from agent.graph import builder
from evaluation.dataset import DATASET_NAME

# Compile with MemorySaver for standalone evaluation.
# The main graph.py compiles without a checkpointer (for LangGraph API Server),
# but we need one here so interrupt() can persist state between stream calls.
graph = builder.compile(checkpointer=MemorySaver())
from evaluation.evaluators import (
    grant_relevance,
    compliance_completeness,
    report_structure,
    factual_grounding,
)


def target(inputs: dict) -> dict:
    """
    Run the full agent graph for one evaluation example.

    This is the function LangSmith calls for each dataset row.
    It must accept a dict of inputs and return a dict of outputs
    that the evaluators can inspect.

    The human_review node uses interrupt(), which pauses execution.
    For evaluation we auto-approve by resuming with Command(resume=...).
    Each run gets a unique thread_id so checkpoint states don't collide.
    """
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    # First invocation: runs until interrupt() at human_review
    state = None
    for state in graph.stream(
        {"user_request": inputs["user_request"]},
        config=config,
        stream_mode="values",
    ):
        pass  # consume the stream to advance the graph

    # Resume past the human review with auto-approval
    for state in graph.stream(
        Command(resume="approve"),
        config=config,
        stream_mode="values",
    ):
        pass

    # Extract the final state fields that evaluators need
    if state is None:
        return {"error": "Graph produced no output"}

    return {
        "research_results": state.get("research_results", ""),
        "compliance_results": state.get("compliance_results", ""),
        "final_report": state.get("final_report", ""),
        "human_decision": state.get("human_decision", ""),
    }


def run():
    """Execute the evaluation suite and print results."""
    client = Client()

    # Verify dataset exists
    try:
        client.read_dataset(dataset_name=DATASET_NAME)
    except Exception:
        print(f"Dataset '{DATASET_NAME}' not found. Run 'python -m evaluation.dataset' first.")
        return

    print(f"Running evaluation against dataset '{DATASET_NAME}'...")
    print("This will invoke the full agent graph for each test scenario.")
    print("Each run takes ~30-60 seconds (live API calls to grants.gov + SAM.gov + Bedrock).\n")

    results = evaluate(
        target,
        data=DATASET_NAME,
        evaluators=[
            grant_relevance,
            compliance_completeness,
            report_structure,
            factual_grounding,
        ],
        experiment_prefix="innovatecorp-eval",
        max_concurrency=1,  # Serial to respect API rate limits
    )

    print("\nEvaluation complete.")
    print(f"View results at: https://smith.langchain.com")
    print(f"Navigate to: Datasets > {DATASET_NAME} > Experiments")


if __name__ == "__main__":
    run()
