import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface AiAgentStackProps extends cdk.StackProps {
  stage: string;
}

export class AiAgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AiAgentStackProps) {
    super(scope, id, props);

    // TODO: Infrastructure components will be implemented in later tasks
    // This is a placeholder stack for the initial project setup
    
    // Add tags to all resources in this stack
    cdk.Tags.of(this).add('Project', 'AiAgentSystem');
    cdk.Tags.of(this).add('Stage', props.stage);
  }
}