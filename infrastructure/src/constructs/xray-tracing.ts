import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as xray from 'aws-cdk-lib/aws-xray';
import { Construct } from 'constructs';

export interface XRayTracingProps {
  stage: string;
  lambdaFunctions: lambda.Function[];
  serviceName: string;
}

export class XRayTracing extends Construct {
  public readonly samplingRule: xray.CfnSamplingRule;

  constructor(scope: Construct, id: string, props: XRayTracingProps) {
    super(scope, id);

    // Create X-Ray sampling rule for cost optimization
    this.samplingRule = new xray.CfnSamplingRule(this, 'SamplingRule', {
      samplingRule: {
        ruleName: `ai-agent-${props.stage}-sampling`,
        priority: 9000,
        fixedRate: props.stage === 'prod' ? 0.1 : 0.5, // 10% in prod, 50% in dev
        reservoirSize: props.stage === 'prod' ? 1 : 2,
        serviceName: props.serviceName,
        serviceType: '*',
        host: '*',
        httpMethod: '*',
        urlPath: '*',
        version: 1,
      },
    });

    // Enable X-Ray tracing for all Lambda functions
    props.lambdaFunctions.forEach(func => {
      // X-Ray tracing is already enabled in the Lambda function configuration
      // Add additional X-Ray permissions if needed
      func.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'xray:PutTraceSegments',
          'xray:PutTelemetryRecords',
          'xray:GetSamplingRules',
          'xray:GetSamplingTargets',
        ],
        resources: ['*'],
      }));
    });

    // Create service map annotations for better visualization
    this.createServiceMapAnnotations(props.stage);

    // Output X-Ray configuration
    new cdk.CfnOutput(this, 'XRayServiceMapUrl', {
      value: `https://${cdk.Stack.of(this).region}.console.aws.amazon.com/xray/home?region=${cdk.Stack.of(this).region}#/service-map`,
      exportName: `${cdk.Stack.of(this).stackName}-XRayServiceMapUrl`,
    });

    new cdk.CfnOutput(this, 'XRayTracesUrl', {
      value: `https://${cdk.Stack.of(this).region}.console.aws.amazon.com/xray/home?region=${cdk.Stack.of(this).region}#/traces`,
      exportName: `${cdk.Stack.of(this).stackName}-XRayTracesUrl`,
    });
  }

  private createServiceMapAnnotations(stage: string): void {
    // Create a Lambda function to add custom annotations to X-Ray traces
    const annotationFunction = new lambda.Function(this, 'XRayAnnotationFunction', {
      functionName: `ai-agent-xray-annotation-${stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'xray-annotation.handler',
      code: lambda.Code.fromInline(`
        const AWSXRay = require('aws-xray-sdk-core');

        exports.handler = async (event) => {
          const segment = AWSXRay.getSegment();
          
          if (segment) {
            // Add service annotations
            segment.addAnnotation('service', 'ai-agent-system');
            segment.addAnnotation('stage', process.env.STAGE);
            segment.addAnnotation('version', process.env.VERSION || '1.0.0');
            
            // Add business context annotations
            if (event.userId) {
              segment.addAnnotation('userId', event.userId);
            }
            if (event.teamId) {
              segment.addAnnotation('teamId', event.teamId);
            }
            if (event.operation) {
              segment.addAnnotation('operation', event.operation);
            }
            if (event.artifactType) {
              segment.addAnnotation('artifactType', event.artifactType);
            }
            
            // Add metadata for detailed analysis
            segment.addMetadata('request', {
              timestamp: new Date().toISOString(),
              correlationId: event.correlationId,
              requestId: event.requestId,
            });
            
            // Add subsegment for business logic
            const subsegment = segment.addNewSubsegment('business-logic');
            subsegment.addAnnotation('component', 'core-processing');
            subsegment.close();
          }
          
          return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Annotations added successfully' }),
          };
        };
      `),
      environment: {
        STAGE: stage,
        VERSION: '1.0.0',
        _X_AMZN_TRACE_ID: '', // This will be set by X-Ray
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      tracing: lambda.Tracing.ACTIVE,
    });

    // Grant X-Ray permissions
    annotationFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords',
        'xray:GetSamplingRules',
        'xray:GetSamplingTargets',
      ],
      resources: ['*'],
    }));
  }
}