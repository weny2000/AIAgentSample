#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AiAgentStack } from './stacks/ai-agent-stack';

const app = new cdk.App();

// Development environment
new AiAgentStack(app, 'AiAgentDev', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  stage: 'dev',
});

// Production environment (commented out for now)
// new AiAgentStack(app, 'AiAgentProd', {
//   env: {
//     account: process.env.CDK_DEFAULT_ACCOUNT,
//     region: process.env.CDK_DEFAULT_REGION,
//   },
//   stage: 'prod',
// });