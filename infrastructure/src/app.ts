#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AiAgentStack } from './stacks/ai-agent-stack';

const app = new cdk.App();

// Get stage from context or default to 'dev'
const stage = app.node.tryGetContext('stage') || 'dev';

new AiAgentStack(app, `AiAgentStack-${stage}`, {
  stage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: `AI Agent System infrastructure for ${stage} environment`,
  tags: {
    Project: 'AiAgentSystem',
    Stage: stage,
    ManagedBy: 'CDK',
  },
});