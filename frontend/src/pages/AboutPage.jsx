import { Link } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:2024";

export default function AboutPage() {
  return (
    <div className="about-page">
      {/* Hero */}
      <section className="about-hero">
        <h1>About This Project</h1>
        <p className="hero-sub">
          A production-grade multi-agent system built for the LangChain PS Solutions Architect take-home exercise.
          This page maps every architectural decision back to the requirements.
        </p>
      </section>

      {/* The Scenario */}
      <section className="about-section">
        <h2>The Scenario</h2>
        <div className="card">
          <p>
            InnovateCorp is an enterprise client preparing to deploy the LangSmith Platform (self-hosted) and build
            AI agent systems to automate critical business workflows. The engagement has two components:
          </p>
          <div className="two-col" style={{ marginTop: "16px" }}>
            <div className="card card-inner">
              <h3>Part 1: Infrastructure Architecture</h3>
              <p>Design a conceptual self-hosted LangSmith Platform deployment architecture on AWS/EKS,
                covering all core services, storage externalization, and scaling strategies.</p>
              <span className="badge badge-blue">Architecture & Documentation</span>
            </div>
            <div className="card card-inner">
              <h3>Part 2: Agent Development</h3>
              <p>Build and evaluate a multi-agent system with human-in-the-loop, external API integration,
                and a comprehensive LangSmith evaluation framework.</p>
              <span className="badge badge-teal">Code & Evaluation</span>
            </div>
          </div>
        </div>
      </section>

      {/* What I Built */}
      <section className="about-section">
        <h2>What I Built</h2>
        <p className="section-intro">
          A federal grant research agent that automates the workflow of finding relevant grants, verifying
          organizational compliance, and generating structured reports -- with mandatory human oversight.
        </p>
        <div className="feature-grid">
          <FeatureCard
            icon="route"
            title="Supervisor Router"
            desc="Deterministic Python router (not LLM-based) that directs workflow based on which state fields are populated. No wasted tokens on routing decisions."
            tag="LangGraph StateGraph"
          />
          <FeatureCard
            icon="search"
            title="Research Agent"
            desc="Calls grants.gov search API via Claude Haiku tool-calling. Synthesizer extracts structured findings from raw API responses."
            tag="LangChain @tool + ToolNode"
          />
          <FeatureCard
            icon="shield"
            title="Compliance Agent"
            desc="Checks SAM.gov entity registration using UEI lookup. Verifies the organization is eligible to receive federal funding."
            tag="LangChain @tool + ToolNode"
          />
          <FeatureCard
            icon="user"
            title="Human-in-the-Loop"
            desc="LangGraph interrupt() pauses execution after research and compliance phases. Human reviews findings before report generation."
            tag="LangGraph interrupt()"
          />
          <FeatureCard
            icon="doc"
            title="Report Generator"
            desc="Synthesizes research findings, compliance analysis, and human decisions into a structured final report."
            tag="ChatBedrockConverse"
          />
          <FeatureCard
            icon="chart"
            title="Evaluation Framework"
            desc="4 custom evaluators run through LangSmith: grant relevance (LLM-as-judge), compliance completeness, report structure, and factual grounding."
            tag="LangSmith evaluate()"
          />
        </div>
      </section>

      {/* Architecture */}
      <section className="about-section">
        <h2>Agent Architecture</h2>
        <p className="section-intro">
          A 9-node LangGraph StateGraph with a supervisor pattern. Each agent follows a three-step flow:
          Agent (LLM with tools bound) &#8594; ToolNode (executes API call) &#8594; Synthesizer (structures results).
        </p>
        <div className="arch-diagram">
          <div className="arch-flow">
            <ArchNode label="User Request" type="input" />
            <ArchArrow />
            <ArchNode label="Supervisor" type="router" sub="Pure Python if/else" />
            <ArchArrow />
            <div className="arch-branch">
              <div className="arch-path">
                <ArchNode label="Research Agent" type="agent" sub="Claude Haiku + grants.gov tool" />
                <ArchArrow />
                <ArchNode label="Research Tools" type="tool" sub="ToolNode → grants.gov API" />
                <ArchArrow />
                <ArchNode label="Research Synthesizer" type="synth" sub="Extract & structure findings" />
              </div>
              <ArchArrow label="back to supervisor" />
              <div className="arch-path">
                <ArchNode label="Compliance Agent" type="agent" sub="Claude Haiku + SAM.gov tool" />
                <ArchArrow />
                <ArchNode label="Compliance Tools" type="tool" sub="ToolNode → SAM.gov API" />
                <ArchArrow />
                <ArchNode label="Compliance Synthesizer" type="synth" sub="Extract & structure findings" />
              </div>
            </div>
            <ArchArrow label="back to supervisor" />
            <ArchNode label="Human Review" type="human" sub="interrupt() → approve/revise" />
            <ArchArrow />
            <ArchNode label="Report Agent" type="agent" sub="Generate final report" />
            <ArchArrow />
            <ArchNode label="Final Report" type="output" />
          </div>
        </div>
      </section>

      {/* Requirement Compliance Matrix */}
      <section className="about-section">
        <h2>Requirement Compliance</h2>
        <p className="section-intro">
          How each task requirement maps to the implementation.
        </p>
        <div className="compliance-table-wrap">
          <table className="compliance-table">
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Implementation</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <ComplianceRow
                req="Multi-agent architecture with specialized agents"
                impl="9-node StateGraph: supervisor, 2 research nodes, 2 compliance nodes, 2 synthesizers, human review, report agent"
                done
              />
              <ComplianceRow
                req="LangChain and LangGraph implementation"
                impl="LangGraph StateGraph, ToolNode, conditional_edges, interrupt(), ChatBedrockConverse, @tool decorator, bind_tools()"
                done
              />
              <ComplianceRow
                req="External API integration"
                impl="grants.gov search API (POST) and SAM.gov entity API (GET) with lru_cache for response caching"
                done
              />
              <ComplianceRow
                req="Human-in-the-loop component"
                impl="LangGraph interrupt() pauses at human_review node. Resume with Command(resume=decision) via frontend or API."
                done
              />
              <ComplianceRow
                req="Test dataset covering diverse scenarios"
                impl="5 test scenarios uploaded to LangSmith as dataset 'innovatecorp-grant-research' covering energy, healthcare, education, agriculture, cybersecurity"
                done
              />
              <ComplianceRow
                req="Custom evaluation metrics via LangSmith"
                impl="4 evaluators: grant_relevance (LLM-as-judge), compliance_completeness, report_structure, factual_grounding"
                done
              />
              <ComplianceRow
                req="LangSmith tracing and observability"
                impl="Zero-config auto-tracing with per-agent run_name, tags, and metadata for filtering"
                done
              />
              <ComplianceRow
                req="LangSmith Platform self-hosted architecture (Part 1)"
                impl="Full architecture document: 6 services, 4 storage backends, AWS/EKS deployment with scaling strategy"
                done
              />
              <ComplianceRow
                req="Architecture diagrams"
                impl="3 programmatic diagrams: LangSmith components, AWS deployment, agent system architecture"
                done
              />
              <ComplianceRow
                req="Friction log"
                impl="10 findings (F-01 to F-10) covering LangGraph, LangSmith, and LangChain friction points with severity ratings"
                done
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* LangChain Platform Usage */}
      <section className="about-section">
        <h2>LangChain Platform Services Used</h2>
        <p className="section-intro">
          20 distinct features across the LangChain ecosystem, demonstrating deep platform adoption.
        </p>
        <div className="services-grid">
          <ServiceGroup
            title="LangGraph"
            color="blue"
            items={[
              "StateGraph (agent orchestration)",
              "ToolNode (prebuilt tool execution)",
              "interrupt() (human-in-the-loop)",
              "conditional_edges (supervisor routing)",
              "MemorySaver (dev checkpointing)",
              "PostgresSaver (documented for prod)",
              "API Server (langgraph build)",
              "Studio (development & demo)",
            ]}
          />
          <ServiceGroup
            title="LangChain"
            color="green"
            items={[
              "ChatBedrockConverse (AWS Bedrock LLM)",
              "@tool decorator (custom tools)",
              "SystemMessage / HumanMessage",
              "bind_tools() (tool calling)",
              "add_messages reducer",
            ]}
          />
          <ServiceGroup
            title="LangSmith"
            color="amber"
            items={[
              "Auto-tracing (zero-config)",
              "Run metadata & tags",
              "Datasets (test scenarios)",
              "Custom evaluators",
              "evaluate() (evaluation runner)",
              "UI (traces, eval results)",
            ]}
          />
          <ServiceGroup
            title="Frontend SDK"
            color="teal"
            items={[
              "@langchain/langgraph-sdk (Client)",
              "Streaming via runs.stream()",
              "Thread management",
              "Interrupt detection & resume",
            ]}
          />
        </div>
      </section>

      {/* Key Design Decisions */}
      <section className="about-section">
        <h2>Key Design Decisions</h2>
        <div className="decisions-list">
          <Decision
            title="AWS Bedrock over direct Anthropic API"
            what="ChatBedrockConverse via langchain-aws"
            why="Enterprise clients have existing AWS infrastructure. Bedrock gives IAM-based access control, VPC endpoints, CloudWatch integration, and eliminates API key management at the application level."
          />
          <Decision
            title="Deterministic supervisor over LLM-based routing"
            what="Pure Python if/else based on state field presence"
            why="Routing is a solved problem here -- the exact sequence is known. Using an LLM for routing would add latency, cost, and unpredictability with zero benefit."
          />
          <Decision
            title="Linear agent flow over ReAct loops"
            what="Agent → ToolNode → Synthesizer (no retry loops)"
            why="Each agent makes exactly one API call. ReAct loops add complexity without value when the tool call is deterministic. The synthesizer layer decouples raw API output from downstream state."
          />
          <Decision
            title="interrupt() over webhook-based HITL"
            what="LangGraph native interrupt/resume"
            why="interrupt() persists graph state at the exact pause point. Resuming with Command(resume=value) continues from that exact state. No external queue or callback infrastructure needed."
          />
          <Decision
            title="Fly.io backend + CloudFront frontend"
            what="Scale-to-zero compute + CDN static hosting"
            why="Zero cost at idle. The backend needs a running process (LangGraph API Server), so it lives on Fly.io with auto-stop. The frontend is static HTML/JS/CSS, so it lives on CloudFront+S3 -- the AWS free tier covers it."
          />
        </div>
      </section>

      {/* Infrastructure */}
      <section className="about-section">
        <h2>Deployment Architecture</h2>
        <div className="infra-grid">
          <div className="card infra-card">
            <div className="infra-label">Frontend</div>
            <h3>CloudFront + S3</h3>
            <ul>
              <li>React SPA built with Vite</li>
              <li>S3 bucket with Origin Access Control</li>
              <li>CloudFront CDN (400+ edge locations)</li>
              <li>SPA routing via 403 → index.html</li>
              <li>AWS free tier: $0/month</li>
            </ul>
          </div>
          <div className="card infra-card">
            <div className="infra-label">Backend</div>
            <h3>Fly.io + LangGraph API Server</h3>
            <ul>
              <li>Docker container running langgraph dev</li>
              <li>Auto-stop after idle (scale to zero)</li>
              <li>Auto-start on incoming request (~5s)</li>
              <li>In-memory checkpointer</li>
              <li>AWS Bedrock for LLM inference</li>
            </ul>
          </div>
          <div className="card infra-card">
            <div className="infra-label">Observability</div>
            <h3>LangSmith Cloud</h3>
            <ul>
              <li>Auto-tracing with LANGSMITH_TRACING=true</li>
              <li>Per-agent metadata and tags</li>
              <li>Evaluation datasets and custom metrics</li>
              <li>Trace visualization and debugging</li>
              <li>Free tier: sufficient for this project</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Links */}
      <section className="about-section">
        <h2>Resources</h2>
        <div className="resources-grid">
          <a href="https://github.com/realmwell/innovatecorp-agent" target="_blank" rel="noopener noreferrer" className="resource-card">
            <h3>GitHub Repository</h3>
            <p>Full source code: agent, evaluation framework, frontend, deployment configs</p>
          </a>
          <Link to="/traces" className="resource-card">
            <h3>Agent Traces</h3>
            <p>View agent traces, execution timelines, and observability data</p>
          </Link>
          <Link to="/api" className="resource-card">
            <h3>API Documentation</h3>
            <p>LangGraph API Server endpoints: threads, runs, streaming, state</p>
          </Link>
          <Link to="/" className="resource-card">
            <h3>Try the Agent</h3>
            <p>Run a live grant research query and see the multi-agent system in action</p>
          </Link>
        </div>
      </section>
    </div>
  );
}

/* Sub-components */

function FeatureCard({ icon, title, desc, tag }) {
  return (
    <div className="feature-card">
      <div className={"feature-icon icon-" + icon} />
      <h3>{title}</h3>
      <p>{desc}</p>
      <span className="badge badge-subtle">{tag}</span>
    </div>
  );
}

function ArchNode({ label, type, sub }) {
  return (
    <div className={"arch-node arch-" + type}>
      <span className="arch-label">{label}</span>
      {sub && <span className="arch-sub">{sub}</span>}
    </div>
  );
}

function ArchArrow({ label }) {
  return (
    <div className="arch-arrow">
      <div className="arrow-line" />
      {label && <span className="arrow-label">{label}</span>}
    </div>
  );
}

function ComplianceRow({ req, impl, done }) {
  return (
    <tr>
      <td>{req}</td>
      <td>{impl}</td>
      <td><span className={"badge " + (done ? "badge-success" : "badge-warn")}>
        {done ? "Complete" : "Partial"}
      </span></td>
    </tr>
  );
}

function ServiceGroup({ title, color, items }) {
  return (
    <div className={"service-group service-" + color}>
      <h3>{title}</h3>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Decision({ title, what, why }) {
  return (
    <div className="decision-card">
      <h3>{title}</h3>
      <div className="decision-detail">
        <span className="decision-label">What:</span> {what}
      </div>
      <div className="decision-detail">
        <span className="decision-label">Why:</span> {why}
      </div>
    </div>
  );
}
