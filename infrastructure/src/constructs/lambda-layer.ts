import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface LambdaLayerProps {
  stage: string;
}

export class LambdaLayer extends Construct {
  public readonly authLayer: lambda.LayerVersion;

  constructor(scope: Construct, id: string, props: LambdaLayerProps) {
    super(scope, id);

    // Create Lambda layer for authentication dependencies
    this.authLayer = new lambda.LayerVersion(this, 'AuthLayer', {
      layerVersionName: `ai-agent-auth-layer-${props.stage}`,
      code: lambda.Code.fromInline(`
// This layer contains the authentication dependencies
// In a real deployment, this would be built from a separate package.json
// with aws-jwt-verify and AWS SDK dependencies
`),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      description: 'Authentication dependencies for AI Agent system',
    });

    // Add tags
    cdk.Tags.of(this).add('Component', 'LambdaLayer');
    cdk.Tags.of(this).add('Stage', props.stage);
  }
}