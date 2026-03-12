import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:2024";

export default function TracesPage() {
  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [traceDetail, setTraceDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetchTraces();
  }, []);

  async function fetchTraces() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/traces`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTraces(data.traces || []);
    } catch (err) {
      setError(
        err.message.includes("Failed to fetch")
          ? "Cannot reach the traces API. The server may be waking up from idle."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  }

  async function fetchTraceDetail(runId) {
    setSelectedTrace(runId);
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/traces/${runId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTraceDetail(data);
    } catch (err) {
      setTraceDetail({ error: err.message });
    } finally {
      setDetailLoading(false);
    }
  }

  function formatDuration(ms) {
    if (!ms) return "-";
    if (ms < 1000) return ms + "ms";
    return (ms / 1000).toFixed(1) + "s";
  }

  function formatTime(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString([], {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  }

  function statusBadge(status) {
    const cls = status === "success" ? "badge-success" :
                status === "error" ? "badge-danger" : "badge-warn";
    return <span className={"badge " + cls}>{status || "unknown"}</span>;
  }

  return (
    <div className="traces-page">
      <div className="page-hero">
        <h1>Agent Traces</h1>
        <p className="hero-sub">
          Real-time observability data from LangSmith. Each trace shows the full execution path
          of a grant research request through the multi-agent system.
        </p>
      </div>

      {loading && (
        <div className="traces-loading">
          <span className="spinner" /> Loading traces from LangSmith...
        </div>
      )}

      {error && (
        <div className="traces-error">
          <p>{error}</p>
          <button className="btn btn-primary" onClick={fetchTraces}>Retry</button>
        </div>
      )}

      {!loading && !error && traces.length === 0 && (
        <div className="traces-empty">
          <p>No traces found. Run a grant search to generate trace data.</p>
        </div>
      )}

      {!loading && traces.length > 0 && (
        <div className="traces-layout">
          {/* Trace list */}
          <div className="traces-list">
            <div className="traces-list-header">
              <span className="th-name">Trace</span>
              <span className="th-status">Status</span>
              <span className="th-latency">Latency</span>
              <span className="th-time">Time</span>
            </div>
            {traces.map((trace) => (
              <div
                key={trace.run_id}
                className={"trace-row" + (selectedTrace === trace.run_id ? " selected" : "")}
                onClick={() => fetchTraceDetail(trace.run_id)}
              >
                <span className="trace-name">
                  <span className="trace-name-text">{trace.name || "agent run"}</span>
                  <span className="trace-id">{trace.run_id?.slice(0, 8)}</span>
                </span>
                <span className="trace-status">{statusBadge(trace.status)}</span>
                <span className="trace-latency">{formatDuration(trace.latency_ms)}</span>
                <span className="trace-time">{formatTime(trace.start_time)}</span>
              </div>
            ))}
          </div>

          {/* Trace detail */}
          {selectedTrace && (
            <div className="trace-detail">
              {detailLoading && (
                <div className="traces-loading">
                  <span className="spinner" /> Loading trace detail...
                </div>
              )}

              {!detailLoading && traceDetail && traceDetail.error && (
                <div className="traces-error"><p>{traceDetail.error}</p></div>
              )}

              {!detailLoading && traceDetail && !traceDetail.error && (
                <>
                  <div className="trace-detail-header">
                    <h3>{traceDetail.name || "Trace"}</h3>
                    {statusBadge(traceDetail.status)}
                    <span className="trace-detail-latency">
                      {formatDuration(traceDetail.latency_ms)}
                    </span>
                  </div>

                  {/* Trace tree */}
                  {traceDetail.children && traceDetail.children.length > 0 && (
                    <div className="trace-tree">
                      {traceDetail.children.map((child, i) => (
                        <TraceNode key={i} node={child} depth={0} formatDuration={formatDuration} />
                      ))}
                    </div>
                  )}

                  {/* Input/Output */}
                  {traceDetail.input && (
                    <div className="trace-io">
                      <h4>Input</h4>
                      <pre>{typeof traceDetail.input === "string" ? traceDetail.input : JSON.stringify(traceDetail.input, null, 2)}</pre>
                    </div>
                  )}
                  {traceDetail.output && (
                    <div className="trace-io">
                      <h4>Output</h4>
                      <pre>{typeof traceDetail.output === "string" ? traceDetail.output : JSON.stringify(traceDetail.output, null, 2)}</pre>
                    </div>
                  )}
                </>
              )}

              {!detailLoading && !traceDetail && (
                <div className="traces-empty"><p>Select a trace to view details.</p></div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TraceNode({ node, depth, formatDuration }) {
  const [expanded, setExpanded] = useState(depth < 2);

  const statusColor =
    node.status === "success" ? "var(--green)" :
    node.status === "error" ? "var(--red)" : "var(--amber)";

  return (
    <div className="trace-node" style={{ marginLeft: depth * 20 + "px" }}>
      <div className="trace-node-header" onClick={() => setExpanded(!expanded)}>
        <span className="trace-node-expand">{expanded ? "\u25BC" : "\u25B6"}</span>
        <span className="trace-node-dot" style={{ background: statusColor }} />
        <span className="trace-node-name">{node.name || "step"}</span>
        <span className="trace-node-type">{node.run_type || ""}</span>
        <span className="trace-node-latency">{formatDuration(node.latency_ms)}</span>
      </div>
      {expanded && (
        <div className="trace-node-body">
          {node.input && (
            <div className="trace-node-io">
              <span className="trace-io-label">Input</span>
              <pre>{typeof node.input === "string" ? node.input.slice(0, 500) : JSON.stringify(node.input, null, 2)?.slice(0, 500)}</pre>
            </div>
          )}
          {node.output && (
            <div className="trace-node-io">
              <span className="trace-io-label">Output</span>
              <pre>{typeof node.output === "string" ? node.output.slice(0, 500) : JSON.stringify(node.output, null, 2)?.slice(0, 500)}</pre>
            </div>
          )}
          {node.children && node.children.map((child, i) => (
            <TraceNode key={i} node={child} depth={depth + 1} formatDuration={formatDuration} />
          ))}
        </div>
      )}
    </div>
  );
}
