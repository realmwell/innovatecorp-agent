# proxy/main.py
#
# Lightweight FastAPI proxy that serves LangSmith trace data
# to the frontend without exposing the API key.
# Runs alongside the LangGraph API Server on port 8080.

import os
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langsmith import Client

app = FastAPI(title="InnovateCorp Traces Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

PROJECT_NAME = os.getenv("LANGSMITH_PROJECT", "innovatecorp-agent")


def _get_client():
    """Lazy client initialization — fails fast if key is missing."""
    return Client()


def _run_to_dict(run) -> dict:
    """Convert a LangSmith Run object to a JSON-serializable dict."""
    latency_ms = None
    if run.end_time and run.start_time:
        latency_ms = int((run.end_time - run.start_time).total_seconds() * 1000)

    return {
        "run_id": str(run.id),
        "name": run.name,
        "run_type": run.run_type,
        "status": run.status,
        "latency_ms": latency_ms,
        "start_time": run.start_time.isoformat() if run.start_time else None,
        "end_time": run.end_time.isoformat() if run.end_time else None,
    }


def _run_to_detail(run) -> dict:
    """Convert a Run to a detailed dict including truncated input/output."""
    d = _run_to_dict(run)

    # Truncate large inputs/outputs to keep response size reasonable
    if run.inputs:
        d["input"] = _truncate(run.inputs)
    if run.outputs:
        d["output"] = _truncate(run.outputs)

    return d


def _truncate(obj, max_len=2000):
    """Truncate large values in dicts/strings for display."""
    if isinstance(obj, str):
        return obj[:max_len] + ("..." if len(obj) > max_len else "")
    if isinstance(obj, dict):
        return {k: _truncate(v, max_len) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_truncate(v, max_len) for v in obj[:10]]
    return obj


@app.get("/api/health")
def health():
    return {"status": "ok", "project": PROJECT_NAME}


@app.get("/api/traces")
def list_traces():
    """List recent root-level traces from the project."""
    try:
        client = _get_client()
        runs = list(client.list_runs(
            project_name=PROJECT_NAME,
            is_root=True,
            limit=20,
        ))
        return {"traces": [_run_to_dict(r) for r in runs]}
    except Exception as e:
        return {"traces": [], "error": str(e)}


@app.get("/api/traces/{run_id}")
def get_trace(run_id: str):
    """Get a trace with its full child run tree."""
    try:
        client = _get_client()

        # Get the root run
        root = client.read_run(run_id)
        result = _run_to_detail(root)

        # Get child runs
        children = list(client.list_runs(
            project_name=PROJECT_NAME,
            trace_id=run_id,
        ))

        # Build tree: map parent_run_id to children
        children_by_parent = {}
        child_details = {}
        for child in children:
            if str(child.id) == run_id:
                continue  # skip root
            detail = _run_to_detail(child)
            child_details[str(child.id)] = detail
            parent = str(child.parent_run_id) if child.parent_run_id else run_id
            children_by_parent.setdefault(parent, []).append(detail)

        # Recursively attach children
        def attach_children(node):
            node_id = node["run_id"]
            node["children"] = children_by_parent.get(node_id, [])
            # Sort by start time
            node["children"].sort(key=lambda x: x.get("start_time") or "")
            for child in node["children"]:
                attach_children(child)

        attach_children(result)
        return result

    except Exception as e:
        return {"error": str(e)}
