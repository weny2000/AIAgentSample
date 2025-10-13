# AgentCore Runtime Edition of Strands Agents

This directory adds an Amazon Bedrock AgentCore compatible entrypoint that wraps the existing
multi-agent orchestration implemented in `../service/agents/*` so it can be deployed using the
[AgentCore Starter Toolkit](https://aws.github.io/bedrock-agentcore-starter-toolkit/user-guide/runtime/quickstart.html).

## Contents

- `strands_agent_entrypoint.py` – The BedrockAgentCoreApp entrypoint (annotated with `@app.entrypoint`).
- `requirements-agentcore.txt` – Minimal incremental dependencies for the runtime deployment.
- `__init__.py` – Package marker.

## Local Test (no AgentCore CLI)

From repository root (or this folder):

```
python -m venv .venv
source .venv/bin/activate
pip install -r service/requirements.txt -r agentcore_runtime/requirements-agentcore.txt
python agentcore_runtime/strands_agent_entrypoint.py
```

You should see a sample invocation result printed.

## Run with AgentCore Local Runtime

The AgentCore CLI can run the entrypoint locally on port 8080:

```
agentcore configure -e strands_agents/agentcore_runtime/strands_agent_entrypoint.py
agentcore launch --local   # or just `agentcore launch` to use CodeBuild for cloud deploy directly
```

Invoke locally:

```
curl -X POST http://localhost:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello from AgentCore"}'
```

## Deployment

1. Ensure you have Bedrock model access (e.g., Claude Sonnet 4.0) and AWS credentials configured.
2. Run configuration (creates `.bedrock_agentcore.yaml` in repo root or current directory):
   ```
   agentcore configure -e strands_agents/agentcore_runtime/strands_agent_entrypoint.py -r us-west-2
   ```
3. Deploy:
   ```
   agentcore launch
   ```
4. Test cloud deployment:
   ```
   agentcore invoke '{"prompt": "give me a short summary of internal expertise routing"}'
   ```

The response will include the `result` field plus debug metadata.

## Environment Variables

The same variables defined for the FastAPI version apply (see `service/config/env.example`). Set them in your shell or add to the environment before launching.

Common examples:

- `STRANDS_LLM_PROVIDER=aws` (or `ollama`, `openai_compat`)
- `STRANDS_AWS_MODEL=us.amazon.nova-pro-v1:0`
- `STRANDS_AWS_REGION=us-west-2`

## Notes

- This edition eliminates the HTTP FastAPI layer; AgentCore sends JSON payloads directly to the entrypoint.
- Async agent components are executed synchronously via `asyncio.run` for simplicity; for higher throughput, migrate to a fully async entrypoint implementation.
- Future enhancements could add memory, tools gateway, or authentication via the Starter Toolkit features.

## Next Steps

- Add automated tests calling `invoke()` with mock data.
- Introduce memory gateway for multi-turn context.
- Register custom tools (search, people graph introspection) via AgentCore Gateway integration.
