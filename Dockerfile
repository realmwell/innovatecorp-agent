FROM python:3.11-slim

WORKDIR /app

# System deps for building packages
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir . "langgraph-cli[inmem]"

# Copy application code
COPY agent/ agent/
COPY langgraph.json .

EXPOSE 8000

# langgraph dev with in-memory checkpointer, no browser, no reload
CMD ["langgraph", "dev", "--host", "0.0.0.0", "--port", "8000", "--no-browser", "--no-reload"]
