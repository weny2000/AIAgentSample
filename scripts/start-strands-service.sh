#!/bin/bash

# Navigate to the project root directory
cd "$(dirname "$0")/.."

# Activate the virtual environment
source /Users/qingjie.du/HDD/aws-hackathon/myenv/bin/activate

# Start the uvicorn server with the correct module path
echo "Starting Strands Agents Service on http://127.0.0.1:8001"
uvicorn strands_agents.service.app:app --reload --port 8001