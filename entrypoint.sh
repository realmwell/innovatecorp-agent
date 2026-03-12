#!/bin/bash
# Start both services + nginx reverse proxy
# nginx routes /api/* to traces proxy, everything else to LangGraph

set -e

echo "Starting traces proxy on port 8080..."
uvicorn proxy.main:app --host 0.0.0.0 --port 8080 --log-level warning &

echo "Starting LangGraph API Server on port 8000..."
langgraph dev --host 0.0.0.0 --port 8000 --no-browser --no-reload &

echo "Starting nginx on port 80..."
nginx -g 'daemon off;' -c /app/nginx.conf
