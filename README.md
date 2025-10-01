# AI Agent System

An AI Agent system that functions as a "digital twin" for team leaders within an organization, providing intelligent assistance, cross-team impact analysis, and automated artifact verification.

## Project Structure

```
ai-agent-system/
├── frontend/          # React SPA application
├── backend/           # Serverless backend services
├── infrastructure/    # AWS infrastructure as code
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

## Development Guidelines

- Follow TypeScript strict mode
- Maintain 80% test coverage minimum
- Use Prettier for code formatting
- Follow ESLint rules for code quality
- Write meaningful commit messages
# AIAgentSample
