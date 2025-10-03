import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface AuthMiddlewareProps {
  stage: string;
  lambdaExecutionRole: iam.Role;
  userPoolId: string;
  userPoolClientId: string;
  authLayer?: lambda.LayerVersion;
}

export class AuthMiddleware extends Construct {
  public readonly authMiddlewareFunction: lambda.Function;
  public readonly preTokenGenerationFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: AuthMiddlewareProps) {
    super(scope, id);

    // Create authentication middleware function
    this.authMiddlewareFunction = this.createAuthMiddlewareFunction(props);

    // Create pre-token generation trigger for custom claims
    this.preTokenGenerationFunction =
      this.createPreTokenGenerationFunction(props);

    // Add tags
    cdk.Tags.of(this).add('Component', 'AuthMiddleware');
    cdk.Tags.of(this).add('Stage', props.stage);
  }

  private createAuthMiddlewareFunction(
    props: AuthMiddlewareProps
  ): lambda.Function {
    // Create log group with retention
    const logGroup = new logs.LogGroup(this, 'AuthMiddlewareLogGroup', {
      logGroupName: `/aws/lambda/ai-agent-auth-middleware-${props.stage}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    return new lambda.Function(this, 'AuthMiddlewareFunction', {
      functionName: `ai-agent-auth-middleware-${props.stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      role: props.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      logGroup,
      environment: {
        USER_POOL_ID: props.userPoolId,
        USER_POOL_CLIENT_ID: props.userPoolClientId,
        REGION: cdk.Stack.of(this).region,
        STAGE: props.stage,
        LOG_LEVEL: 'INFO',
      },
      layers: props.authLayer ? [props.authLayer] : [],
      code: lambda.Code.fromInline(`
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const { DynamoDBClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

// Initialize clients outside handler for reuse
const dynamoClient = new DynamoDBClient({ region: process.env.REGION });

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID,
  tokenUse: 'access',
  clientId: process.env.USER_POOL_CLIENT_ID,
});

exports.handler = async (event) => {
  const correlationId = event.requestContext?.requestId || 'unknown';
  console.log(\`[\${correlationId}] Auth middleware invoked\`, {
    path: event.path,
    method: event.httpMethod,
    headers: Object.keys(event.headers || {}),
  });

  try {
    // Extract and verify JWT token
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse(401, 'Missing or invalid authorization header', correlationId);
    }

    const token = authHeader.replace('Bearer ', '');
    const payload = await verifier.verify(token);
    
    console.log(\`[\${correlationId}] Token verified for user: \${payload.username}\`);

    // Extract user attributes
    const userContext = {
      userId: payload.sub,
      username: payload.username,
      email: payload.email,
      department: payload['custom:department'],
      teamId: payload['custom:team_id'],
      role: payload['custom:role'],
      clearance: payload['custom:clearance'],
      tokenExp: payload.exp,
    };

    // Validate required attributes
    if (!userContext.teamId || !userContext.role || !userContext.clearance) {
      console.error(\`[\${correlationId}] Missing required user attributes\`, userContext);
      return createErrorResponse(403, 'User profile incomplete', correlationId);
    }

    // Check team membership and permissions
    const teamAccess = await validateTeamAccess(userContext, correlationId);
    if (!teamAccess.valid) {
      return createErrorResponse(403, teamAccess.reason, correlationId);
    }

    // Check resource-level permissions
    const resourceAccess = await validateResourceAccess(event, userContext, correlationId);
    if (!resourceAccess.valid) {
      return createErrorResponse(403, resourceAccess.reason, correlationId);
    }

    // Add user context to event for downstream processing
    const enrichedEvent = {
      ...event,
      requestContext: {
        ...event.requestContext,
        authorizer: {
          ...userContext,
          permissions: resourceAccess.permissions,
        },
      },
    };

    // Log successful authentication for audit
    await logSecurityEvent({
      eventType: 'AUTHENTICATION_SUCCESS',
      userId: userContext.userId,
      username: userContext.username,
      teamId: userContext.teamId,
      resource: \`\${event.httpMethod} \${event.path}\`,
      correlationId,
    });

    console.log(\`[\${correlationId}] Authorization successful for \${userContext.username}\`);
    return {
      statusCode: 200,
      body: JSON.stringify(enrichedEvent),
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-ID': correlationId,
      },
    };

  } catch (error) {
    console.error(\`[\${correlationId}] Authorization failed:\`, error);
    
    // Log security event for failed authentication
    await logSecurityEvent({
      eventType: 'AUTHENTICATION_FAILURE',
      userId: 'unknown',
      username: 'unknown',
      teamId: 'unknown',
      resource: \`\${event.httpMethod} \${event.path}\`,
      error: error.message,
      correlationId,
    });
    
    if (error.name === 'JwtExpiredError') {
      return createErrorResponse(401, 'Token expired', correlationId);
    }
    
    if (error.name === 'JwtInvalidSignatureError') {
      return createErrorResponse(401, 'Invalid token signature', correlationId);
    }
    
    return createErrorResponse(500, 'Internal authentication error', correlationId);
  }
};

async function validateTeamAccess(userContext, correlationId) {
  try {
    // Query team roster to validate membership
    const command = new GetItemCommand({
      TableName: \`ai-agent-team-roster-\${process.env.STAGE}\`,
      Key: marshall({
        team_id: userContext.teamId,
      }),
    });

    const result = await dynamoClient.send(command);
    
    if (!result.Item) {
      console.warn(\`[\${correlationId}] Team not found: \${userContext.teamId}\`);
      return { valid: false, reason: 'Team not found' };
    }

    const teamData = unmarshall(result.Item);
    const member = teamData.members?.find(m => m.user_id === userContext.userId);
    
    if (!member) {
      console.warn(\`[\${correlationId}] User not member of team: \${userContext.userId}\`);
      return { valid: false, reason: 'Not a team member' };
    }

    // Validate role consistency
    if (member.role !== userContext.role) {
      console.warn(\`[\${correlationId}] Role mismatch for user \${userContext.userId}\`);
      return { valid: false, reason: 'Role mismatch' };
    }

    return { valid: true, teamData };

  } catch (error) {
    console.error(\`[\${correlationId}] Team validation error:\`, error);
    return { valid: false, reason: 'Team validation failed' };
  }
}

async function validateResourceAccess(event, userContext, correlationId) {
  const path = event.path;
  const method = event.httpMethod;
  const clearance = userContext.clearance;
  
  // Define permission matrix
  const permissions = {
    basic: [
      'GET:/agent/status/*',
      'POST:/agent/query',
      'GET:/kendra/search',
    ],
    standard: [
      'POST:/agent/check',
      'POST:/slack/notify',
      'POST:/jira/create',
    ],
    elevated: [
      'GET:/admin/personas',
      'PUT:/admin/persona/*',
    ],
    admin: [
      'POST:/admin/policy',
      'DELETE:/admin/policy/*',
      'GET:/admin/audit',
    ],
  };

  // Build allowed permissions based on clearance level
  let allowedPermissions = [...permissions.basic];
  
  if (['standard', 'elevated', 'admin'].includes(clearance)) {
    allowedPermissions.push(...permissions.standard);
  }
  
  if (['elevated', 'admin'].includes(clearance)) {
    allowedPermissions.push(...permissions.elevated);
  }
  
  if (clearance === 'admin') {
    allowedPermissions.push(...permissions.admin);
  }

  // Check if current request is allowed
  const requestPattern = \`\${method}:\${path}\`;
  const isAllowed = allowedPermissions.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(requestPattern);
    }
    return pattern === requestPattern;
  });

  if (!isAllowed) {
    console.warn(\`[\${correlationId}] Access denied for \${requestPattern} with clearance \${clearance}\`);
    return { 
      valid: false, 
      reason: \`Insufficient permissions for \${method} \${path}\` 
    };
  }

  return { 
    valid: true, 
    permissions: allowedPermissions 
  };
}

async function logSecurityEvent(event) {
  try {
    const command = new PutItemCommand({
      TableName: \`ai-agent-audit-log-\${process.env.STAGE}\`,
      Item: marshall({
        request_id: event.correlationId,
        timestamp: new Date().toISOString(),
        user_id: event.userId,
        persona: 'system',
        action: event.eventType,
        references: [{
          source_id: 'auth-middleware',
          source_type: 'security',
          confidence_score: 1.0,
          snippet: \`Resource: \${event.resource}, Error: \${event.error || 'none'}\`,
        }],
        result_summary: \`Authentication event for user \${event.username} on \${event.resource}\`,
        compliance_score: event.eventType === 'AUTHENTICATION_SUCCESS' ? 100 : 0,
      }),
    });

    await dynamoClient.send(command);
  } catch (error) {
    console.error('Failed to log security event:', error);
    // Don't fail the request due to logging issues
  }
}

function createErrorResponse(statusCode, message, correlationId) {
  return {
    statusCode,
    body: JSON.stringify({
      error: message,
      correlationId,
      timestamp: new Date().toISOString(),
    }),
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': correlationId,
    },
  };
}
      `),
    });
  }

  private createPreTokenGenerationFunction(
    props: AuthMiddlewareProps
  ): lambda.Function {
    // Create log group with retention
    const logGroup = new logs.LogGroup(this, 'PreTokenGenerationLogGroup', {
      logGroupName: `/aws/lambda/ai-agent-pre-token-${props.stage}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    return new lambda.Function(this, 'PreTokenGenerationFunction', {
      functionName: `ai-agent-pre-token-${props.stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      role: props.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logGroup,
      environment: {
        STAGE: props.stage,
        REGION: cdk.Stack.of(this).region,
      },
      code: lambda.Code.fromInline(`
const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamoClient = new DynamoDBClient({ region: process.env.REGION });

exports.handler = async (event) => {
  console.log('Pre-token generation event:', JSON.stringify(event, null, 2));

  try {
    const { userAttributes } = event.request;
    const userId = event.request.userAttributes.sub;
    
    // Get user's team information from DynamoDB
    const teamId = userAttributes['custom:team_id'];
    if (teamId) {
      const teamData = await getTeamData(teamId);
      if (teamData) {
        // Add team-specific claims to the token
        event.response.claimsOverrideDetails = {
          claimsToAddOrOverride: {
            'custom:team_name': teamData.team_name || teamId,
            'custom:leader_persona_id': teamData.leader_persona_id || '',
            'custom:policies': JSON.stringify(teamData.policies || []),
          },
        };
      }
    }

    // Add session metadata
    event.response.claimsOverrideDetails = {
      ...event.response.claimsOverrideDetails,
      claimsToAddOrOverride: {
        ...event.response.claimsOverrideDetails?.claimsToAddOrOverride,
        'custom:session_id': generateSessionId(),
        'custom:login_timestamp': new Date().toISOString(),
      },
    };

    console.log('Token claims enhanced successfully for user:', userId);
    return event;

  } catch (error) {
    console.error('Pre-token generation failed:', error);
    // Don't fail the authentication, just log the error
    return event;
  }
};

async function getTeamData(teamId) {
  try {
    const command = new GetItemCommand({
      TableName: \`ai-agent-team-roster-\${process.env.STAGE}\`,
      Key: marshall({ team_id: teamId }),
    });

    const result = await dynamoClient.send(command);
    return result.Item ? unmarshall(result.Item) : null;
  } catch (error) {
    console.error('Failed to get team data:', error);
    return null;
  }
}

function generateSessionId() {
  return \`sess_\${Date.now()}_\${Math.random().toString(36).substr(2, 9)}\`;
}
      `),
    });
  }
}
