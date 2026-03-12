# InnovateCorp Grant Research Agent

A multi-agent system for federal grant research and compliance checking, built with LangGraph and AWS Bedrock.

## Architecture

**Supervisor pattern** with specialized agents:

```
User Request → Supervisor → Research Agent → grants.gov API
                         → Compliance Agent → SAM.gov API
                         → Human Review (interrupt/resume)
                         → Report Generator → Final Report
```

### Components

| Component | Purpose |
|-----------|---------|
| **Supervisor** | Deterministic Python router (no LLM) — routes based on which state fields are filled |
| **Research Agent** | Calls grants.gov search API via Claude Haiku tool-calling |
| **Compliance Agent** | Checks SAM.gov entity registration via Claude Haiku tool-calling |
| **Synthesizers** | Extract and structure raw tool results into readable briefs |
| **Human Review** | LangGraph `interrupt()` — pauses execution for human approval |
| **Report Agent** | Generates structured final report from all accumulated state |

### Tech Stack

- **LangGraph** — Agent orchestration, state management, human-in-the-loop
- **AWS Bedrock (Claude 3.5 Haiku)** — LLM inference
- **LangSmith** — Tracing and observability
- **grants.gov API** — Live federal grant search
- **SAM.gov API** — Entity eligibility verification
- **React + Vite** — Frontend with streaming agent progress

## Setup

```bash
# Backend
python -m venv venv && source venv/bin/activate
pip install -e .

# Configure environment
cp .env.example .env
# Add: AWS credentials, SAM_API_KEY, LANGSMITH_API_KEY

# Run locally
langgraph dev

# Frontend
cd frontend && npm install && npm run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AWS_ACCESS_KEY_ID` | Yes | AWS credentials for Bedrock |
| `AWS_SECRET_ACCESS_KEY` | Yes | AWS credentials for Bedrock |
| `AWS_DEFAULT_REGION` | Yes | `us-east-1` |
| `SAM_API_KEY` | Yes | SAM.gov API key |
| `LANGSMITH_API_KEY` | Yes | LangSmith tracing |
| `LANGSMITH_TRACING` | No | `true` to enable tracing |
| `LANGSMITH_PROJECT` | No | Project name in LangSmith |

## Deployment

- **Backend**: Fly.io (Docker, scale-to-zero)
- **Frontend**: Vercel (static CDN)

## Evaluation

The `evaluation/` directory contains a LangSmith-based evaluation framework with custom evaluators for response quality, tool usage, and compliance accuracy.

## License

MIT
