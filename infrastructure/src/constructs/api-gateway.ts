import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface ApiGatewayProps {
  stage: string;
  vpc: ec2.Vpc;
  lambdaSecurityGroup: ec2.SecurityGroup;
  lambdaExecutionRole: iam.Role;
  authorizerFunction: lambda.Function;
  artifactCheckHandler: lambda.Function;
  statusCheckHandler: lambda.Function;
  agentQueryHandler: lambda.Function;
  kendraSearchHandler: lambda.Function;
}

export class ApiGateway extends Construct {
  public readonly restApi: apigateway.RestApi;
  public readonly vpcEndpoint: ec2.InterfaceVpcEndpoint;

  constructor(scope: Construct, id: string, props: ApiGatewayProps) {
    super(scope, id);

    // Create VPC endpoint for API Gateway
    this.vpcEndpoint = props.vpc.addInterfaceEndpoint('ApiGatewayVpcEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.APIGATEWAY,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
      securityGroups: [props.lambdaSecurityGroup],
    });

    // Create CloudWatch log group for API Gateway access logs
    const accessLogGroup = new logs.LogGroup(this, 'ApiGatewayAccessLogs', {
      logGroupName: `/aws/apigateway/ai-agent-${props.stage}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create the REST API
    this.restApi = new apigateway.RestApi(this, 'AiAgentApi', {
      restApiName: `ai-agent-api-${props.stage}`,
      description: `AI Agent System API for ${props.stage}`,
      
      // API Gateway configuration
      endpointConfiguration: {
        types: [apigateway.EndpointType.PRIVATE],
        vpcEndpoints: [this.vpcEndpoint],
      },
      
      // Security and CORS
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS, // Will be restricted in production
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Correlation-ID',
        ],
        maxAge: cdk.Duration.hours(1),
      },

      // Request validation
      requestValidatorOptions: {
        requestValidatorName: 'DefaultValidator',
        validateRequestBody: true,
        validateRequestParameters: true,
      },

      // Access logging
      deployOptions: {
        stageName: props.stage,
        accessLogDestination: new apigateway.LogGroupLogDestination(accessLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
      },

      // Binary media types for file uploads
      binaryMediaTypes: [
        'application/pdf',
        'application/zip',
        'application/octet-stream',
        'image/*',
        'text/plain',
      ],
    });

    // Create custom authorizer
    const authorizer = new apigateway.TokenAuthorizer(this, 'JwtAuthorizer', {
      handler: props.authorizerFunction,
      identitySource: 'method.request.header.Authorization',
      authorizerName: 'JwtAuthorizer',
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // Create request/response models
    const models = this.createApiModels();

    // Create API resources and methods
    this.createApiResources(authorizer, models, props);

    // Add resource policy to restrict access to VPC
    this.addResourcePolicy();

    // Output API Gateway URL
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.restApi.url,
      description: 'API Gateway URL',
      exportName: `${cdk.Stack.of(this).stackName}-ApiGatewayUrl`,
    });

    new cdk.CfnOutput(this, 'ApiGatewayId', {
      value: this.restApi.restApiId,
      description: 'API Gateway ID',
      exportName: `${cdk.Stack.of(this).stackName}-ApiGatewayId`,
    });
  }

  private createApiModels(): Record<string, apigateway.Model> {
    // Artifact Check Request Model
    const artifactCheckRequestModel = this.restApi.addModel('ArtifactCheckRequest', {
      contentType: 'application/json',
      modelName: 'ArtifactCheckRequest',
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT4,
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          artifactType: { type: apigateway.JsonSchemaType.STRING },
          artifactContent: { type: apigateway.JsonSchemaType.STRING },
          artifactUrl: { type: apigateway.JsonSchemaType.STRING },
          templateId: { type: apigateway.JsonSchemaType.STRING },
          userId: { type: apigateway.JsonSchemaType.STRING },
          teamId: { type: apigateway.JsonSchemaType.STRING },
        },
        required: ['artifactType', 'userId', 'teamId'],
      },
    });

    // Agent Query Request Model
    const agentQueryRequestModel = this.restApi.addModel('AgentQueryRequest', {
      contentType: 'application/json',
      modelName: 'AgentQueryRequest',
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT4,
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          query: { type: apigateway.JsonSchemaType.STRING },
          userId: { type: apigateway.JsonSchemaType.STRING },
          teamId: { type: apigateway.JsonSchemaType.STRING },
          personaId: { type: apigateway.JsonSchemaType.STRING },
          context: { type: apigateway.JsonSchemaType.OBJECT },
        },
        required: ['query', 'userId', 'teamId'],
      },
    });

    // Search Request Model
    const searchRequestModel = this.restApi.addModel('SearchRequest', {
      contentType: 'application/json',
      modelName: 'SearchRequest',
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT4,
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          query: { type: apigateway.JsonSchemaType.STRING },
          pageSize: { type: apigateway.JsonSchemaType.INTEGER },
          pageNumber: { type: apigateway.JsonSchemaType.INTEGER },
          filters: { type: apigateway.JsonSchemaType.OBJECT },
        },
        required: ['query'],
      },
    });

    // Feedback Request Model
    const feedbackRequestModel = this.restApi.addModel('FeedbackRequest', {
      contentType: 'application/json',
      modelName: 'FeedbackRequest',
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT4,
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          queryId: { type: apigateway.JsonSchemaType.STRING },
          resultId: { type: apigateway.JsonSchemaType.STRING },
          relevance: { 
            type: apigateway.JsonSchemaType.STRING,
            enum: ['RELEVANT', 'NOT_RELEVANT'],
          },
        },
        required: ['queryId', 'resultId', 'relevance'],
      },
    });

    // Error Response Model
    const errorResponseModel = this.restApi.addModel('ErrorResponse', {
      contentType: 'application/json',
      modelName: 'ErrorResponse',
      schema: {
        schema: apigateway.JsonSchemaVersion.DRAFT4,
        type: apigateway.JsonSchemaType.OBJECT,
        properties: {
          errorCode: { type: apigateway.JsonSchemaType.STRING },
          message: { type: apigateway.JsonSchemaType.STRING },
          details: { type: apigateway.JsonSchemaType.OBJECT },
          correlationId: { type: apigateway.JsonSchemaType.STRING },
        },
        required: ['errorCode', 'message', 'correlationId'],
      },
    });

    return {
      artifactCheckRequest: artifactCheckRequestModel,
      agentQueryRequest: agentQueryRequestModel,
      searchRequest: searchRequestModel,
      feedbackRequest: feedbackRequestModel,
      errorResponse: errorResponseModel,
    };
  }

  private createApiResources(
    authorizer: apigateway.TokenAuthorizer,
    models: Record<string, apigateway.Model>,
    props: ApiGatewayProps
  ): void {
    // Create /agent resource
    const agentResource = this.restApi.root.addResource('agent');

    // POST /agent/check - Submit artifact for checking
    const checkResource = agentResource.addResource('check');
    checkResource.addMethod('POST', new apigateway.LambdaIntegration(props.artifactCheckHandler), {
      authorizer,
      requestModels: {
        'application/json': models.artifactCheckRequest,
      },
      requestValidator: this.restApi.requestValidator,
      methodResponses: [
        {
          statusCode: '202',
          responseModels: {
            'application/json': apigateway.Model.GENERIC_MODEL,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
        {
          statusCode: '401',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
        {
          statusCode: '403',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
      ],
    });

    // GET /agent/status/{jobId} - Check status of artifact check
    const statusResource = agentResource.addResource('status');
    const statusJobResource = statusResource.addResource('{jobId}');
    statusJobResource.addMethod('GET', new apigateway.LambdaIntegration(props.statusCheckHandler), {
      authorizer,
      requestParameters: {
        'method.request.path.jobId': true,
      },
      requestValidator: this.restApi.requestValidator,
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': apigateway.Model.GENERIC_MODEL,
          },
        },
        {
          statusCode: '404',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
        {
          statusCode: '403',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
      ],
    });

    // POST /agent/query - Query the AI agent
    const queryResource = agentResource.addResource('query');
    queryResource.addMethod('POST', new apigateway.LambdaIntegration(props.agentQueryHandler), {
      authorizer,
      requestModels: {
        'application/json': models.agentQueryRequest,
      },
      requestValidator: this.restApi.requestValidator,
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': apigateway.Model.GENERIC_MODEL,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
        {
          statusCode: '401',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
        {
          statusCode: '403',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
      ],
    });

    // Create /kendra resource for search functionality
    const kendraResource = this.restApi.root.addResource('kendra');

    // POST /kendra/search - Search the knowledge base
    const searchResource = kendraResource.addResource('search');
    searchResource.addMethod('POST', new apigateway.LambdaIntegration(props.kendraSearchHandler), {
      authorizer,
      requestModels: {
        'application/json': models.searchRequest,
      },
      requestValidator: this.restApi.requestValidator,
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': apigateway.Model.GENERIC_MODEL,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
        {
          statusCode: '401',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
        {
          statusCode: '403',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
      ],
    });

    // POST /kendra/feedback - Submit search result feedback
    const feedbackResource = kendraResource.addResource('feedback');
    feedbackResource.addMethod('POST', new apigateway.LambdaIntegration(props.kendraSearchHandler), {
      authorizer,
      requestModels: {
        'application/json': models.feedbackRequest,
      },
      requestValidator: this.restApi.requestValidator,
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': apigateway.Model.GENERIC_MODEL,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
        {
          statusCode: '401',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': models.errorResponse,
          },
        },
      ],
    });

    // Add health check endpoint (no auth required)
    const healthResource = this.restApi.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.MockIntegration({
      integrationResponses: [
        {
          statusCode: '200',
          responseTemplates: {
            'application/json': JSON.stringify({
              status: 'healthy',
              timestamp: '$context.requestTime',
              version: '1.0.0',
            }),
          },
        },
      ],
      requestTemplates: {
        'application/json': '{"statusCode": 200}',
      },
    }), {
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': apigateway.Model.GENERIC_MODEL,
          },
        },
      ],
    });
  }

  private addResourcePolicy(): void {
    // Restrict API access to VPC endpoints only
    const resourcePolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          principals: [new iam.AnyPrincipal()],
          actions: ['execute-api:Invoke'],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'aws:sourceVpce': this.vpcEndpoint.vpcEndpointId,
            },
          },
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.DENY,
          principals: [new iam.AnyPrincipal()],
          actions: ['execute-api:Invoke'],
          resources: ['*'],
          conditions: {
            StringNotEquals: {
              'aws:sourceVpce': this.vpcEndpoint.vpcEndpointId,
            },
          },
        }),
      ],
    });

    // Apply the resource policy
    const cfnRestApi = this.restApi.node.defaultChild as apigateway.CfnRestApi;
    cfnRestApi.policy = resourcePolicy;
  }
}