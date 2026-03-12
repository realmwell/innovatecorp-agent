import { useState, useRef } from "react";
import { Client } from "@langchain/langgraph-sdk";
import "./App.css";

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

export default function App() {
  const [request, setRequest] = useState("");
  const [status, setStatus] = useState("idle");
  const [currentAgent, setCurrentAgent] = useState("");
  const [agentLog, setAgentLog] = useState([]);
  const [reviewData, setReviewData] = useState(null);
  const [report, setReport] = useState("");
  const [error, setError] = useState("");
  const threadRef = useRef(null);

  const addLog = (msg) => setAgentLog((prev) => [...prev, msg]);

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
      addLog("Thread created");

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
              addLog(AGENT_LABELS[node]);
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
        addLog("Paused for human review");
      } else {
        const vals = state.values || {};
        if (vals.final_report) {
          setReport(vals.final_report);
          setStatus("done");
          addLog("Report complete");
        }
      }
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  async function handleReview(decision) {
    setStatus("running");
    setCurrentAgent("report_agent");
    addLog("Human decision: " + decision);

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
              addLog(AGENT_LABELS[node]);
            }
          }
        }
      }

      const state = await client.threads.getState(threadRef.current);
      const vals = state.values || {};

      if (vals.final_report) {
        setReport(vals.final_report);
        setStatus("done");
        addLog("Report complete");
      }
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>InnovateCorp Grant Research Agent</h1>
        <p className="subtitle">
          Multi-agent system powered by LangGraph + AWS Bedrock
        </p>
      </header>

      <form onSubmit={handleSubmit} className="input-section">
        <input
          type="text"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="e.g., Find renewable energy grants for InnovateCorp"
          disabled={status === "running" || status === "review"}
        />
        <button
          type="submit"
          disabled={
            status === "running" || status === "review" || !request.trim()
          }
        >
          {status === "running" ? "Running..." : "Search Grants"}
        </button>
      </form>

      {agentLog.length > 0 && (
        <div className="progress-section">
          <h2>Agent Progress</h2>
          <div className="agent-log">
            {agentLog.map((msg, i) => (
              <div
                key={i}
                className={"log-entry" + (i === agentLog.length - 1 ? " active" : "")}
              >
                <span className="dot" />
                {msg}
              </div>
            ))}
            {status === "running" && (
              <div className="log-entry active">
                <span className="dot pulse" />
                {AGENT_LABELS[currentAgent] || "Processing..."}
              </div>
            )}
          </div>
        </div>
      )}

      {status === "review" && reviewData && (
        <div className="review-section">
          <h2>Human Review Required</h2>
          <p className="review-instructions">{reviewData.instructions}</p>

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
            <button
              className="approve-btn"
              onClick={() => handleReview("approve")}
            >
              Approve and Generate Report
            </button>
            <button
              className="revise-btn"
              onClick={() =>
                handleReview(
                  "Please broaden the search to include more agencies"
                )
              }
            >
              Request Revision
            </button>
          </div>
        </div>
      )}

      {status === "done" && report && (
        <div className="report-section">
          <h2>Final Report</h2>
          <pre className="report-content">{report}</pre>
        </div>
      )}

      {status === "error" && (
        <div className="error-section">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={() => setStatus("idle")}>Try Again</button>
        </div>
      )}

      <footer className="app-footer">
        <a
          href="https://smith.langchain.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          View Traces in LangSmith
        </a>
        <span className="separator"> | </span>
        <a
          href={API_URL + "/docs"}
          target="_blank"
          rel="noopener noreferrer"
        >
          API Docs
        </a>
      </footer>
    </div>
  );
}
