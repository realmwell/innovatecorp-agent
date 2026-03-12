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

const EXAMPLE_QUERIES = [
  "Find renewable energy grants for a Pennsylvania nonprofit",
  "Search for healthcare research grants for Johns Hopkins University",
  "Find STEM education grants for a California community college",
  "Search for cybersecurity grants for a small defense contractor",
];

export default function AgentPage() {
  const [request, setRequest] = useState("");
  const [status, setStatus] = useState("idle");
  const [currentAgent, setCurrentAgent] = useState("");
  const [agentLog, setAgentLog] = useState([]);
  const [reviewData, setReviewData] = useState(null);
  const [grantSelections, setGrantSelections] = useState({});
  const [guidanceNotes, setGuidanceNotes] = useState("");
  const [complianceNotes, setComplianceNotes] = useState("");
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
    setGrantSelections({});
    setGuidanceNotes("");
    setComplianceNotes("");
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
        // Initialize grant selections — all selected by default
        if (interruptData.grants) {
          const selections = {};
          interruptData.grants.forEach((g) => {
            selections[g.id] = g.selected !== false;
          });
          setGrantSelections(selections);
        }
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

  async function handleStructuredReview() {
    const selectedGrants = Object.entries(grantSelections)
      .filter(([, selected]) => selected)
      .map(([id]) => id);

    const decision = JSON.stringify({
      selected_grants: selectedGrants,
      guidance: guidanceNotes || "No additional guidance.",
      compliance_notes: complianceNotes || "No compliance notes.",
    });

    setStatus("running");
    setCurrentAgent("report_agent");
    addLog("Human review submitted (" + selectedGrants.length + " grants selected)", "human_review");

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
    setGrantSelections({});
    setGuidanceNotes("");
    setComplianceNotes("");
    setReport("");
    threadRef.current = null;
  }

  function toggleGrant(id) {
    setGrantSelections((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="agent-page">
      <div className="page-hero">
        <h1>Federal Grant Research Agent</h1>
        <p className="hero-sub">
          Describe what you need in plain language. This multi-agent system searches grants.gov for matching opportunities,
          verifies organizational eligibility through SAM.gov, then generates a professional briefing after your review.
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

      {/* Landing content — shown when idle */}
      {status === "idle" && agentLog.length === 0 && (
        <>
          {/* Example queries */}
          <div className="examples-section">
            <p className="examples-label">Try an example:</p>
            <div className="examples-grid">
              {EXAMPLE_QUERIES.map((q, i) => (
                <button key={i} className="example-chip" onClick={() => setRequest(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* How It Works */}
          <div className="how-it-works">
            <h2>How It Works</h2>
            <div className="steps-grid">
              <div className="step-card">
                <div className="step-num">1</div>
                <h3>Describe Your Need</h3>
                <p>Enter a grant research request in plain language. Include the organization name and topic area.</p>
              </div>
              <div className="step-card">
                <div className="step-num">2</div>
                <h3>Automated Research</h3>
                <p>The research agent queries grants.gov for matching opportunities. The compliance agent checks SAM.gov registration.</p>
              </div>
              <div className="step-card">
                <div className="step-num">3</div>
                <h3>Human Review</h3>
                <p>Select which grants to include, review compliance findings, and add any guidance notes before the report is generated.</p>
              </div>
              <div className="step-card">
                <div className="step-num">4</div>
                <h3>Executive Briefing</h3>
                <p>A professional report with grant details, compliance analysis, risk assessment, and recommended next steps.</p>
              </div>
            </div>
          </div>

          {/* Architecture mini-diagram */}
          <div className="landing-arch">
            <h2>Agent Architecture</h2>
            <p className="section-intro">
              A 9-node LangGraph StateGraph with deterministic routing. Each agent follows a three-step pattern:
              LLM with tools bound, ToolNode executes the API call, then a synthesizer structures the results.
            </p>
            <div className="arch-mini">
              <div className="arch-mini-row">
                <span className="arch-mini-node arch-mini-input">User Request</span>
                <span className="arch-mini-arrow" />
                <span className="arch-mini-node arch-mini-router">Supervisor</span>
              </div>
              <div className="arch-mini-row">
                <span className="arch-mini-arrow arch-mini-arrow-down" />
              </div>
              <div className="arch-mini-row">
                <span className="arch-mini-node arch-mini-agent">Research Agent</span>
                <span className="arch-mini-arrow" />
                <span className="arch-mini-node arch-mini-tool">grants.gov API</span>
                <span className="arch-mini-arrow" />
                <span className="arch-mini-node arch-mini-synth">Synthesizer</span>
              </div>
              <div className="arch-mini-row">
                <span className="arch-mini-arrow arch-mini-arrow-down" />
              </div>
              <div className="arch-mini-row">
                <span className="arch-mini-node arch-mini-agent">Compliance Agent</span>
                <span className="arch-mini-arrow" />
                <span className="arch-mini-node arch-mini-tool">SAM.gov API</span>
                <span className="arch-mini-arrow" />
                <span className="arch-mini-node arch-mini-synth">Synthesizer</span>
              </div>
              <div className="arch-mini-row">
                <span className="arch-mini-arrow arch-mini-arrow-down" />
              </div>
              <div className="arch-mini-row">
                <span className="arch-mini-node arch-mini-human">Human Review</span>
                <span className="arch-mini-arrow" />
                <span className="arch-mini-node arch-mini-agent">Report Agent</span>
                <span className="arch-mini-arrow" />
                <span className="arch-mini-node arch-mini-output">Final Report</span>
              </div>
            </div>
          </div>

          {/* Tech badges */}
          <div className="tech-badges">
            <span className="tech-badge tech-langgraph">LangGraph</span>
            <span className="tech-badge tech-langchain">LangChain</span>
            <span className="tech-badge tech-langsmith">LangSmith</span>
            <span className="tech-badge tech-bedrock">AWS Bedrock</span>
            <span className="tech-badge tech-grants">grants.gov API</span>
            <span className="tech-badge tech-sam">SAM.gov API</span>
          </div>
        </>
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

      {/* Structured Human Review */}
      {status === "review" && reviewData && (
        <div className="review-section">
          <div className="review-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="review-icon">
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <div>
              <h2>Human Review Required</h2>
              <p>{reviewData.instructions || "Review the findings below. Select grants, review compliance, and add any notes."}</p>
            </div>
          </div>

          {/* Grant Selection Cards */}
          {reviewData.grants && reviewData.grants.length > 0 && (
            <div className="review-grants">
              <h3 className="review-section-title">Grant Opportunities</h3>
              <p className="review-section-desc">Select which grants to include in the final report.</p>
              <div className="grant-cards">
                {reviewData.grants.map((grant) => (
                  <div
                    key={grant.id}
                    className={"grant-card" + (grantSelections[grant.id] ? " selected" : "")}
                    onClick={() => toggleGrant(grant.id)}
                  >
                    <div className="grant-card-header">
                      <label className="grant-checkbox">
                        <input
                          type="checkbox"
                          checked={!!grantSelections[grant.id]}
                          onChange={() => toggleGrant(grant.id)}
                        />
                        <span className="checkmark" />
                      </label>
                      <div className="grant-card-title">
                        <span className="grant-id">Grant #{grant.id}</span>
                        <h4>{grant.title || "Untitled Grant"}</h4>
                      </div>
                    </div>
                    <div className="grant-card-details">
                      {grant.agency && (
                        <div className="grant-detail">
                          <span className="grant-detail-label">Agency</span>
                          <span className="grant-detail-value">{grant.agency}</span>
                        </div>
                      )}
                      {grant.award_ceiling && (
                        <div className="grant-detail">
                          <span className="grant-detail-label">Award Ceiling</span>
                          <span className="grant-detail-value">{grant.award_ceiling}</span>
                        </div>
                      )}
                      {grant.close_date && (
                        <div className="grant-detail">
                          <span className="grant-detail-label">Close Date</span>
                          <span className="grant-detail-value">{grant.close_date}</span>
                        </div>
                      )}
                      {grant.fit && (
                        <div className="grant-detail grant-detail-full">
                          <span className="grant-detail-label">Fit</span>
                          <span className="grant-detail-value">{grant.fit}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compliance Status */}
          {reviewData.compliance && (
            <div className="review-compliance">
              <h3 className="review-section-title">Compliance Status</h3>
              <div className="compliance-status-card">
                <div className="compliance-status-row">
                  <span className="compliance-label">SAM.gov Status</span>
                  <span className={"compliance-value " + (
                    reviewData.compliance.sam_status === "Active" ? "status-active" :
                    reviewData.compliance.sam_status === "Inactive" ? "status-inactive" : "status-unknown"
                  )}>
                    {reviewData.compliance.sam_status || "Unknown"}
                  </span>
                </div>
                {reviewData.compliance.legal_name && (
                  <div className="compliance-status-row">
                    <span className="compliance-label">Legal Name</span>
                    <span className="compliance-value">{reviewData.compliance.legal_name}</span>
                  </div>
                )}
                {reviewData.compliance.uei && (
                  <div className="compliance-status-row">
                    <span className="compliance-label">UEI</span>
                    <span className="compliance-value compliance-mono">{reviewData.compliance.uei}</span>
                  </div>
                )}
                {reviewData.compliance.expiry && (
                  <div className="compliance-status-row">
                    <span className="compliance-label">Registration Expiry</span>
                    <span className="compliance-value">{reviewData.compliance.expiry}</span>
                  </div>
                )}
              </div>
              <textarea
                className="review-textarea"
                placeholder="Add any compliance notes or concerns..."
                value={complianceNotes}
                onChange={(e) => setComplianceNotes(e.target.value)}
                rows={2}
              />
            </div>
          )}

          {/* Raw data (collapsed) */}
          {(reviewData.research_raw || reviewData.compliance_raw) && (
            <details className="review-raw-details">
              <summary className="review-raw-summary">View raw agent output</summary>
              <div className="review-panels">
                {reviewData.research_raw && (
                  <div className="review-panel">
                    <h3>Research (Raw)</h3>
                    <pre>{reviewData.research_raw}</pre>
                  </div>
                )}
                {reviewData.compliance_raw && (
                  <div className="review-panel">
                    <h3>Compliance (Raw)</h3>
                    <pre>{reviewData.compliance_raw}</pre>
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Guidance */}
          <div className="review-guidance">
            <h3 className="review-section-title">Guidance Notes</h3>
            <textarea
              className="review-textarea"
              placeholder="Any additional direction for the report? e.g., 'Focus on grants under $500K' or 'Prioritize DOE opportunities'"
              value={guidanceNotes}
              onChange={(e) => setGuidanceNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Submit */}
          <div className="review-actions">
            <button className="btn btn-success" onClick={handleStructuredReview}>
              Generate Report ({Object.values(grantSelections).filter(Boolean).length} grants selected)
            </button>
            <button className="btn btn-outline-warn" onClick={handleReset}>
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Final Report — rendered as markdown */}
      {status === "done" && report && (
        <div className="report-section">
          <div className="report-header">
            <h2>Final Report</h2>
            <div className="report-actions">
              <button className="btn btn-sm btn-outline" onClick={() => {
                navigator.clipboard.writeText(report);
              }}>
                Copy
              </button>
              <button className="btn btn-sm btn-outline" onClick={handleReset}>
                New Search
              </button>
            </div>
          </div>
          <div className="report-content">
            <MarkdownReport text={report} />
          </div>
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

/**
 * Lightweight markdown renderer for the report.
 * Handles headings, bold, links, lists, and horizontal rules.
 * No dependencies — just regex transforms.
 */
function MarkdownReport({ text }) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements = [];
  let inList = false;
  let listItems = [];

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={"list-" + elements.length} className="md-list">
          {listItems.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushList();
      elements.push(<hr key={"hr-" + i} className="md-hr" />);
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const Tag = "h" + level;
      elements.push(<Tag key={"h-" + i} className={"md-h" + level}>{renderInline(headingMatch[2])}</Tag>);
      continue;
    }

    // List items
    const listMatch = line.match(/^\s*[-*]\s+(.+)$/);
    const numListMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (listMatch || numListMatch) {
      inList = true;
      listItems.push((listMatch || numListMatch)[1]);
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      flushList();
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(<p key={"p-" + i} className="md-p">{renderInline(line)}</p>);
  }
  flushList();

  return <div className="md-report">{elements}</div>;
}

function renderInline(text) {
  // Split by markdown patterns and render inline elements
  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Link
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    // Find earliest match
    let earliest = null;
    let earliestIdx = remaining.length;

    if (boldMatch && boldMatch.index < earliestIdx) {
      earliest = "bold";
      earliestIdx = boldMatch.index;
    }
    if (linkMatch && linkMatch.index < earliestIdx) {
      earliest = "link";
      earliestIdx = linkMatch.index;
    }

    if (!earliest) {
      parts.push(remaining);
      break;
    }

    // Add text before match
    if (earliestIdx > 0) {
      parts.push(remaining.slice(0, earliestIdx));
    }

    if (earliest === "bold") {
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(earliestIdx + boldMatch[0].length);
    } else if (earliest === "link") {
      parts.push(
        <a key={key++} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="md-link">
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(earliestIdx + linkMatch[0].length);
    }
  }

  return parts;
}
