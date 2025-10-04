# AI Agent System

An AI Agent system that functions as a "digital twin" for team leaders within an organization, providing intelligent assistance, cross-team impact analysis, and automated artifact verification.

## Project Structure

```
ai-agent-system/
├── frontend/          # React SPA application
├── frontend_mock/     # Next.js chat application with strands integration
├── backend/           # Serverless backend services
├── infrastructure/    # AWS infrastructure as code
├── strands_agents/    # StrandsAgents Python service
├── .kiro/            # Kiro specifications and configuration
└── package.json      # Root package configuration
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Installation

```bash
# Install dependencies for all workspaces
npm install

# Install frontend dependencies
npm install --workspace=frontend

# Install backend dependencies
npm install --workspace=backend
```

### Development

```bash
# Start frontend development server
npm run dev

# Run tests across all workspaces
npm test

# Lint code across all workspaces
npm run lint

# Format code
npm run format
```

### Build

```bash
# Build all workspaces
npm run build

# Type check all workspaces
npm run type-check
```

## Architecture

The system follows a serverless architecture on AWS with:

- **Frontend**: React 18 + Vite SPA with Tailwind CSS
- **Backend**: AWS Lambda functions with API Gateway
- **Database**: DynamoDB + RDS PostgreSQL
- **Search**: Amazon Kendra
- **Storage**: S3 for documents and artifacts
- **Authentication**: IAM Identity Center/SAML
- **AI Agents**: StrandsAgents Python service for intelligent chat

## StrandsAgents Integration

The system includes a Python FastAPI microservice built using strands-agents (sdk-python) that powers a three-agent pipeline:

- **InfoCollector**: extracts search keywords from user input
- **PeopleFinder**: enriches mock search results with the best person to consult based on an editable people influence graph and preferred contact method
- **ResponseBuilder**: tailors the final answer to the user's role and skills profile

### Running StrandsAgents Service

1. Start the Python service:
```bash
cd strands_agents/service
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8001
```

2. Configure the frontend_mock:
```bash
cd frontend_mock
cp .env.local.example .env.local
# Edit .env.local and set STRANDS_SERVICE_URL=http://localhost:8001
```

3. Start the Next.js chat application:
```bash
cd frontend_mock
npm install
npm run dev
```

Open http://localhost:3000/chat and interact with the AI agents.

### API Endpoints

- `POST /api/strands` - Chat with strands agents
- `POST /agents/run` - Direct strands service endpoint
- `POST /search` - Search functionality

## Development Guidelines

- Follow TypeScript strict mode
- Maintain 80% test coverage minimum
- Use Prettier for code formatting
- Follow ESLint rules for code quality
- Write meaningful commit messages

# AIAgentSample
