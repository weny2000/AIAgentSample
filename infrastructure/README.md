# AI Agent System - Infrastructure

This directory contains the Infrastructure as Code (IaC) for the AI Agent System using AWS CDK.

## Prerequisites

- Node.js 18+
- AWS CLI configured
- AWS CDK CLI installed globally: `npm install -g aws-cdk`

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Bootstrap CDK (first time only):

   ```bash
   cdk bootstrap
   ```

3. Deploy the stack:
   ```bash
   npm run deploy
   ```

## Available Scripts

- `npm run build` - Compile TypeScript
- `npm run deploy` - Deploy the stack
- `npm run destroy` - Destroy the stack
- `npm run diff` - Show differences between deployed and local stack
- `npm run synth` - Synthesize CloudFormation template
- `npm run test` - Run tests
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript compiler check

## Architecture

The infrastructure will include:

- VPC with private subnets
- Lambda functions for API operations
- DynamoDB tables for metadata storage
- RDS PostgreSQL for relational data
- S3 buckets for document storage
- API Gateway for REST API
- IAM roles and policies
- KMS keys for encryption

_Note: Infrastructure components will be implemented in subsequent tasks._
