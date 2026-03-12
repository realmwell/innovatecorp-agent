import { useState, useRef } from "react";
import { Client } from "@langchain/langgraph-sdk";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:2024";
const ASSISTANT_ID = "innovatecorp_agent";

const client = new Client({ apiUrl: API_URL });

const AGENT_LABELS = {
  supervisor: "Routing request...",
  research_agent: "Searching grants.gov...",
  research_tools: "Executing grant search...",
  research_synthesizer: "Analyzing research results...",
  compliance_agent: "Checking compliance...",
  compliance_tools: "Querying SAM.gov...",
  compliance_synthesizer: "Analyzing compliance results...",
  human_review: "Awaiting human review",
  report_agent: "Generating final report...",
};

const AGENT_ICONS = {
  supervisor: "route",
  research_agent: "search",
  research_tools: "api",
  research_synthesizer: "analyze",
  compliance_agent: "shield",
  compliance_tools: "api",
  compliance_synthesizer: "analyze",
  human_review: "user",
  report_agent: "doc",
};

export default function AgentPage() {
  const [request, setRequest] = useState("");
  const [status, setStatus] = useState("idle");
  const [currentAgent, setCurrentAgent] = useState("");
  const [agentLog, setAgentLog] = useState([]);
  const [reviewData, setReviewData] = useState(null);
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const threadRef = useRef(null);

  const addLog = (msg, node) =>
    setAgentLog((prev) => [...prev, { msg, node, time: new Date() }]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!request.trim()) return;

    setStatus("running");
    setAgentLog([]);
    setCurrentAgent("supervisor");
    setReviewData(null);
    setReport("");
    setError("");

    try {
      const thread = await client.threads.create();
      threadRef.current = thread.thread_id;
      addLog("Thread created", "system");

      const stream = client.runs.stream(thread.thread_id, ASSISTANT_ID, {
        input: { user_request: request },
        streamMode: "updates",
      });

      for await (const event of stream) {
        if (event.event === "updates" && event.data) {
          const nodeNames = Object.keys(event.data);
          for (const node of nodeNames) {
            if (AGENT_LABELS[node]) {
              setCurrentAgent(node);
              addLog(AGENT_LABELS[node], node);
            }
          }
        }
      }

      const state = await client.threads.getState(thread.thread_id);
      const tasks = state.tasks || [];
      const interrupt = tasks.find(
        (t) => t.interrupts && t.interrupts.length > 0
      );

      if (interrupt) {
        const interruptData = interrupt.interrupts[0].value;
        setReviewData(interruptData);
        setStatus("review");
        addLog("Paused for human review", "human_review");
      } else {
        const vals = state.values || {};
        if (vals.final_report) {
          setReport(vals.final_report);
          setStatus("done");
          addLog("Report complete", "report_agent");
        }
      }
    } catch (err) {
      handleError(err);
    }
  }

  async function handleReview(decision) {
    setStatus("running");
    setCurrentAgent("report_agent");
    addLog("Human decision: " + decision, "human_review");

    try {
      const stream = client.runs.stream(threadRef.current, ASSISTANT_ID, {
        command: { resume: decision },
        streamMode: "updates",
      });

      for await (const event of stream) {
        if (event.event === "updates" && event.data) {
          const nodeNames = Object.keys(event.data);
          for (const node of nodeNames) {
            if (AGENT_LABELS[node]) {
              setCurrentAgent(node);
              addLog(AGENT_LABELS[node], node);
            }
          }
        }
      }

      const state = await client.threads.getState(threadRef.current);
      const vals = state.values || {};

      if (vals.final_report) {
        setReport(vals.final_report);
        setStatus("done");
        addLog("Report complete", "report_agent");
      }
    } catch (err) {
      handleError(err);
    }
  }

  function handleError(err) {
    const msg = err.message || String(err);
    if (msg.includes("not found") || msg.includes("404")) {
      setError(
        "The backend server restarted and lost the in-memory thread. This is expected with scale-to-zero infrastructure. Click 'Try Again' to start a new search."
      );
    } else if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
      setError(
        "Cannot reach the backend API. The server may be waking up from idle (takes ~5s). Please wait a moment and try again."
      );
    } else {
      setError(msg);
    }
    setStatus("error");
  }

  function handleReset() {
    setStatus("idle");
    setError("");
    setAgentLog([]);
    setReviewData(null);
    setReport("");
    threadRef.current = null;
  }

  return (
    <div className="agent-page">
      <div className="page-hero">
        <h1>Grant Research Agent</h1>
        <p className="hero-sub">
          Multi-agent system that searches grants.gov, checks SAM.gov compliance,
          and generates structured reports with human-in-the-loop review.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="search-form">
        <div className="search-input-wrap">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="e.g., Find renewable energy grants for a Pennsylvania nonprofit"
            disabled={status === "running" || status === "review"}
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={status === "running" || status === "review" || !request.trim()}
        >
          {status === "running" ? (
            <><span className="spinner" /> Running...</>
          ) : (
            "Search Grants"
          )}
        </button>
      </form>

      {/* How It Works - shown when idle */}
      {status === "idle" && agentLog.length === 0 && (
        <div className="how-it-works">
          <h2>How It Works</h2>
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-num">1</div>
              <h3>Describe Your Need</h3>
              <p>Enter a grant research request in plain language. The supervisor routes it to specialized agents.</p>
            </div>
            <div className="step-card">
              <div className="step-num">2</div>
              <h3>Automated Research</h3>
              <p>The research agent queries grants.gov and the compliance agent checks SAM.gov registration.</p>
            </div>
            <div className="step-card">
              <div className="step-num">3</div>
              <h3>Human Review</h3>
              <p>The system pauses for your approval before generating the final report. You can request revisions.</p>
            </div>
            <div className="step-card">
              <div className="step-num">4</div>
              <h3>Structured Report</h3>
              <p>A comprehensive report combining grant opportunities, eligibility analysis, and compliance findings.</p>
            </div>
          </div>
        </div>
      )}

      {/* Agent Progress */}
      {agentLog.length > 0 && (
        <div className="progress-section">
          <h2>Agent Progress</h2>
          <div className="agent-log">
            {agentLog.map((entry, i) => (
              <div
                key={i}
                className={
                  "log-entry" + (i === agentLog.length - 1 && status === "running" ? " active" : "")
                }
              >
                <span className={"log-icon " + (AGENT_ICONS[entry.node] || "system")} />
                <span className="log-msg">{entry.msg}</span>
                <span className="log-time">
                  {entry.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            ))}
            {status === "running" && (
              <div className="log-entry active">
                <span className="log-icon pulse" />
                <span className="log-msg">{AGENT_LABELS[currentAgent] || "Processing..."}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Human Review */}
      {status === "review" && reviewData && (
        <div className="review-section">
          <div className="review-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="review-icon">
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <div>
              <h2>Human Review Required</h2>
              <p>{reviewData.instructions || "Review the findings below and approve or request revisions."}</p>
            </div>
          </div>

          <div className="review-panels">
            <div className="review-panel">
              <h3>Research Findings</h3>
              <pre>{reviewData.research_summary}</pre>
            </div>
            <div className="review-panel">
              <h3>Compliance Analysis</h3>
              <pre>{reviewData.compliance_summary}</pre>
            </div>
          </div>

          <div className="review-actions">
            <button className="btn btn-success" onClick={() => handleReview("approve")}>
              Approve & Generate Report
            </button>
            <button
              className="btn btn-outline-warn"
              onClick={() => handleReview("Please broaden the search to include more agencies")}
            >
              Request Revision
            </button>
          </div>
        </div>
      )}

      {/* Final Report */}
      {status === "done" && report && (
        <div className="report-section">
          <div className="report-header">
            <h2>Final Report</h2>
            <span className="badge badge-success">Complete</span>
          </div>
          <div className="report-content">{report}</div>
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="error-section">
          <h2>Something went wrong</h2>
          <p>{error}</p>
          <button className="btn btn-danger" onClick={handleReset}>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
