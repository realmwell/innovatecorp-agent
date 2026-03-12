FROM python:3.11-slim

WORKDIR /app

# System deps: gcc for building packages, nginx for reverse proxy
RUN apt-get update && apt-get install -y --no-install-recommends gcc nginx && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir . "langgraph-cli[inmem]" fastapi uvicorn langsmith

# Copy application code
COPY agent/ agent/
COPY proxy/ proxy/
COPY langgraph.json .
COPY nginx.conf .
COPY entrypoint.sh .

RUN chmod +x entrypoint.sh

EXPOSE 80

CMD ["./entrypoint.sh"]
