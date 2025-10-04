# StrandsAgents Integration

This directory contains a Python FastAPI microservice built using strands-agents (sdk-python) that powers a three-agent pipeline:

- InfoCollector: extracts search keywords from user input
- PeopleFinder: enriches mock search results with the best person to consult based on an editable people influence graph and preferred contact method
- ResponseBuilder: tailors the final answer to the user's role and skills profile

The Next.js app calls this service via the API route `/api/strands`. For demo fallback, `/api/openai` remains available; the frontend can switch which endpoint to call via an env flag.

## Structure

- config/env.example: Environment variables for LLM providers and service URL
- data/
  - people_graph.yaml: Editable people influence graph with preferred contact and expertise (YAML format)
  - search_results.json: Mock searchable documents with authors and snippets
- service/
  - app.py: FastAPI app exposing `/agents/run` and `/search`
  - agents/: Implementations and utilities
  - requirements.txt: Python dependencies

## Run locally

1) Start the Python service

```
cd StrandsAgents/service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8001
```

2) Configure the frontend

Create `.env.local` in the repo root (Next.js) and add:

```
STRANDS_SERVICE_URL=http://localhost:8001
# Choose which chat API the frontend calls: 'strands' (default) or 'openai'
NEXT_PUBLIC_CHAT_API=strands
```

3) Start the Next.js app

```
npm install
npm run dev
```

Open http://localhost:3000/chat and ask a question.

## LLM providers

Select provider via `STRANDS_LLM_PROVIDER`:

- ollama: local Ollama server
- aws: Amazon Bedrock (requires AWS creds in your environment)
- openai_compat: OpenAI-compatible API with configurable base URL

The service automatically loads configuration from `config/.env`. Copy `config/env.example` to `config/.env` and set the variables accordingly, or export them in your shell to override.

## API

- POST /agents/run

Request:

```
{
  "chatId": "abc",
  "prompt": "社内のLLM導入のベストプラクティスは？",
  "profile": { "role": "PM", "skills": "LLM, Next.js" }
}
```

Response:

```
{
  "content": "markdown...",
  "debug": {
    "keywords": ["LLM", "導入", "ベストプラクティス"],
    "selected_person": {
      "name": "Alice Tanaka",
      "department": "R&amp;D",
      "contact": { "type": "email", "value": "alice.tanaka@example.com" }
    },
    "search_summary": [{ "title": "...", "snippet": "..." }]
  }
}
```

All generated code, data, and configs are confined within `StrandsAgents/` for easy migration.
