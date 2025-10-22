# syntax=docker/dockerfile:1

# Lightweight Python base image
FROM python:3.11-slim AS runtime

# Environment configuration
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TOKENIZERS_PARALLELISM=false

# System dependencies:
# - git: required for pip install from GitHub (strands-agents sdk)
RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first to leverage Docker layer caching
# service/requirements.txt contains heavy libs (torch, sentence-transformers, scikit-learn, etc.)
COPY service/requirements.txt /tmp/requirements.txt
RUN python -m pip install --upgrade pip \
 && pip install --no-cache-dir -r /tmp/requirements.txt

# Copy application source. We copy the build context (the strands_agents folder)
# into /app/strands_agents so Python can import `strands_agents.*`
COPY . /app/strands_agents

# Create non-root user for security
RUN useradd -m -u 10001 appuser \
 && chown -R appuser:appuser /app
USER appuser

# Default runtime configuration
ENV APP_HOST=0.0.0.0 \
    APP_PORT=80 \
    UVICORN_WORKERS=1 \
    LOG_LEVEL=info

EXPOSE 80

# Start FastAPI app via uvicorn (module path: strands_agents.service.app:app)
CMD ["sh", "-c", "uvicorn strands_agents.service.app:app --host ${APP_HOST:-0.0.0.0} --port ${APP_PORT:-80} --workers ${UVICORN_WORKERS:-1} --log-level ${LOG_LEVEL:-info}"]
