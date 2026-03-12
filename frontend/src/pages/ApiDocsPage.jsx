const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:2024";

export default function ApiDocsPage() {
  return (
    <div className="api-docs-page">
      <div className="page-hero">
        <h1>API Documentation</h1>
        <p className="hero-sub">
          The InnovateCorp Grant Research Agent runs on a LangGraph API Server.
          These endpoints let you create threads, start agent runs, stream progress, and resume after human review.
        </p>
      </div>

      <div className="api-base">
        <span className="api-base-label">Base URL</span>
        <code className="api-base-url">{API_URL}</code>
      </div>

      <div className="api-endpoints">
        <Endpoint
          method="POST"
          path="/threads"
          desc="Create a new conversation thread. Each thread maintains its own state and message history."
          request={{
            body: null,
            example: `curl -X POST ${API_URL}/threads`
          }}
          response={`{
  "thread_id": "abc-123-def-456",
  "created_at": "2026-03-12T10:00:00Z",
  "metadata": {}
}`}
        />

        <Endpoint
          method="POST"
          path="/threads/{thread_id}/runs"
          desc="Start an agent run on a thread. The agent processes the user request through the full multi-agent pipeline: supervisor routing, research, compliance check, human review pause, and report generation."
          request={{
            body: `{
  "assistant_id": "innovatecorp_agent",
  "input": {
    "user_request": "Find renewable energy grants for a Pennsylvania nonprofit"
  }
}`,
            example: `curl -X POST ${API_URL}/threads/abc-123/runs \\
  -H "Content-Type: application/json" \\
  -d '{"assistant_id": "innovatecorp_agent", "input": {"user_request": "Find renewable energy grants"}}'`
          }}
          response={`{
  "run_id": "run-789",
  "thread_id": "abc-123",
  "status": "pending"
}`}
        />

        <Endpoint
          method="POST"
          path="/threads/{thread_id}/runs/stream"
          desc="Start a run with server-sent event streaming. Returns real-time updates as each agent node completes. Use streamMode 'updates' to receive node-level progress."
          request={{
            body: `{
  "assistant_id": "innovatecorp_agent",
  "input": {
    "user_request": "Find healthcare grants for Johns Hopkins"
  },
  "stream_mode": "updates"
}`,
            example: `curl -X POST ${API_URL}/threads/abc-123/runs/stream \\
  -H "Content-Type: application/json" \\
  -d '{"assistant_id": "innovatecorp_agent", "input": {"user_request": "..."}, "stream_mode": "updates"}'`
          }}
          response={`event: updates
data: {"supervisor": {"next_agent": "research_agent"}}

event: updates
data: {"research_agent": {"messages": [...]}}

event: updates
data: {"research_tools": {"messages": [...]}}

...`}
        />

        <Endpoint
          method="GET"
          path="/threads/{thread_id}/state"
          desc="Get the current state of a thread, including all accumulated values (research results, compliance results, final report) and any pending interrupt tasks."
          request={{
            body: null,
            example: `curl ${API_URL}/threads/abc-123/state`
          }}
          response={`{
  "values": {
    "user_request": "...",
    "research_results": "...",
    "compliance_results": "...",
    "human_decision": null,
    "final_report": null
  },
  "tasks": [
    {
      "id": "task-1",
      "interrupts": [{
        "value": {
          "type": "structured_review",
          "grants": [...],
          "compliance": {...}
        }
      }]
    }
  ]
}`}
        />

        <Endpoint
          method="POST"
          path="/threads/{thread_id}/runs (resume)"
          desc="Resume execution after human review. Send a Command with the resume value containing the human's structured decision (selected grants, guidance notes, compliance notes)."
          request={{
            body: `{
  "assistant_id": "innovatecorp_agent",
  "command": {
    "resume": "{\\"selected_grants\\": [\\"350952\\"], \\"guidance\\": \\"Focus on DOE grants\\", \\"compliance_notes\\": \\"SAM renewal pending\\"}"
  }
}`,
            example: `curl -X POST ${API_URL}/threads/abc-123/runs \\
  -H "Content-Type: application/json" \\
  -d '{"assistant_id": "innovatecorp_agent", "command": {"resume": "approve"}}'`
          }}
          response={`{
  "run_id": "run-790",
  "thread_id": "abc-123",
  "status": "pending"
}`}
        />

        <Endpoint
          method="GET"
          path="/api/traces"
          desc="List recent agent traces from LangSmith. Returns the 20 most recent root-level runs with status, latency, and timestamps. Proxied through the backend so no LangSmith credentials are needed."
          request={{
            body: null,
            example: `curl ${API_URL}/api/traces`
          }}
          response={`{
  "traces": [
    {
      "run_id": "abc-123",
      "name": "LangGraph",
      "status": "success",
      "latency_ms": 12450,
      "start_time": "2026-03-12T10:00:00Z",
      "end_time": "2026-03-12T10:00:12Z"
    }
  ]
}`}
        />

        <Endpoint
          method="GET"
          path="/api/traces/{run_id}"
          desc="Get the full trace tree for a specific run, including all child runs (agent nodes, tool calls, synthesizers). Shows input/output at each step."
          request={{
            body: null,
            example: `curl ${API_URL}/api/traces/abc-123`
          }}
          response={`{
  "run_id": "abc-123",
  "name": "LangGraph",
  "status": "success",
  "latency_ms": 12450,
  "children": [
    {
      "name": "supervisor",
      "run_type": "chain",
      "latency_ms": 5,
      "input": {...},
      "output": {...}
    },
    {
      "name": "research_agent",
      "run_type": "llm",
      "latency_ms": 3200,
      ...
    }
  ]
}`}
        />
      </div>

      {/* State schema */}
      <div className="api-section">
        <h2>Agent State Schema</h2>
        <p className="section-intro">
          The LangGraph StateGraph maintains this typed state throughout execution. Each agent node reads from and writes to specific fields.
        </p>
        <div className="state-schema">
          <SchemaField name="user_request" type="str" desc="The original natural language query from the user" />
          <SchemaField name="messages" type="list[BaseMessage]" desc="Full message history (uses add_messages reducer for append-only)" />
          <SchemaField name="next_agent" type="str" desc="Set by supervisor to route to the next node" />
          <SchemaField name="research_results" type="str" desc="Structured grant findings from the research synthesizer" />
          <SchemaField name="compliance_results" type="str" desc="SAM.gov eligibility analysis from the compliance synthesizer" />
          <SchemaField name="human_decision" type="str" desc="JSON string with selected grants, guidance, and compliance notes" />
          <SchemaField name="final_report" type="str" desc="Markdown executive briefing generated by the report agent" />
        </div>
      </div>
    </div>
  );
}

function Endpoint({ method, path, desc, request, response }) {
  const methodClass = method === "GET" ? "method-get" : "method-post";
  return (
    <div className="api-endpoint">
      <div className="api-endpoint-header">
        <span className={"api-method " + methodClass}>{method}</span>
        <code className="api-path">{path}</code>
      </div>
      <p className="api-desc">{desc}</p>

      {request.body && (
        <div className="api-block">
          <span className="api-block-label">Request Body</span>
          <pre>{request.body}</pre>
        </div>
      )}

      <div className="api-block">
        <span className="api-block-label">Example</span>
        <pre>{request.example}</pre>
      </div>

      <div className="api-block api-block-response">
        <span className="api-block-label">Response</span>
        <pre>{response}</pre>
      </div>
    </div>
  );
}

function SchemaField({ name, type, desc }) {
  return (
    <div className="schema-field">
      <code className="schema-name">{name}</code>
      <span className="schema-type">{type}</span>
      <span className="schema-desc">{desc}</span>
    </div>
  );
}
