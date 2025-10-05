#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/.."

# Activate the virtual environment
source /Users/qingjie.du/HDD/aws-hackathon/myenv/bin/activate

# Ensure project root is on PYTHONPATH for module resolution
export PYTHONPATH="$(pwd):${PYTHONPATH}"

# Start the uvicorn server with the correct module path
echo "Starting Strands Agents Service on http://127.0.0.1:${PORT:-8001}"
uvicorn --app-dir . strands_agents.service.app:app --reload --host 127.0.0.1 --port "${PORT:-8001}"
