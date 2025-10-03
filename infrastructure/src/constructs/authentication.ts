import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { LambdaLayer } from './lambda-layer';

export interface AuthenticationProps {
  stage: string;
  lambdaExecutionRole: iam.Role;
  apiGatewayRole: iam.Role;
}

export class Authentication extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;
  public readonly authorizerFunction: lambda.Function;
  public readonly authorizer: apigateway.RequestAuthorizer;
  public readonly abacPolicies: iam.ManagedPolicy[];
  public readonly lambdaLayer: LambdaLayer;

  constructor(scope: Construct, id: string, props: AuthenticationProps) {
    super(scope, id);

    // Create Lambda layer for dependencies
    this.lambdaLayer = new LambdaLayer(this, 'LambdaLayer', {
      stage: props.stage,
    });

    // Create Cognito User Pool for OIDC authentication
    this.userPool = this.createUserPool(props);
    this.userPoolClient = this.createUserPoolClient(props);
    this.identityPool = this.createIdentityPool(props);

    // Create ABAC policies
    this.abacPolicies = this.createAbacPolicies(props);

    // Create Lambda authorizer for API Gateway
    this.authorizerFunction = this.createAuthorizerFunction(props);
    this.authorizer = this.createApiGatewayAuthorizer(props);

    // Add tags
    cdk.Tags.of(this).add('Component', 'Authentication');
    cdk.Tags.of(this).add('Stage', props.stage);
  }

  private createUserPool(props: AuthenticationProps): cognito.UserPool {
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `ai-agent-users-${props.stage}`,
      selfSignUpEnabled: false, // Admin-managed users only
      signInAliases: {
        email: true,
        username: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(1),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
      deviceTracking: {
        challengeRequiredOnNewDevice: true,
        deviceOnlyRememberedOnUserPrompt: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: true,
          mutable: true,
        },
        familyName: {
          required: true,
          mutable: true,
        },
      },
      customAttributes: {
        department: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 50,
          mutable: true,
        }),
        team_id: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 50,
          mutable: true,
        }),
        role: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 50,
          mutable: true,
        }),
        clearance: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 20,
          mutable: true,
        }),
      },
    });

    // Add domain for hosted UI
    userPool.addDomain('UserPoolDomain', {
      cognitoDomain: {
        domainPrefix: `ai-agent-${props.stage}-${cdk.Stack.of(this).account}`,
      },
    });

    // Add SAML identity provider (can be configured post-deployment)
    const samlProvider = new cognito.UserPoolIdentityProviderSaml(
      this,
      'SamlProvider',
      {
        userPool,
        name: 'SAML',
        metadata: cognito.UserPoolIdentityProviderSamlMetadata.url(
          'https://placeholder.example.com/saml/metadata' // To be replaced with actual SAML metadata URL
        ),
        attributeMapping: {
          email: cognito.ProviderAttribute.other('http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'),
          givenName: cognito.ProviderAttribute.other('http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'),
          familyName: cognito.ProviderAttribute.other('http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'),
          custom: {
            department: cognito.ProviderAttribute.other('http://schemas.example.com/department'),
            team_id: cognito.ProviderAttribute.other('http://schemas.example.com/team_id'),
            role: cognito.ProviderAttribute.other('http://schemas.example.com/role'),
            clearance: cognito.ProviderAttribute.other('http://schemas.example.com/clearance'),
          },
        },
      }
    );

    // Output SAML configuration details for manual setup
    new cdk.CfnOutput(this, 'SamlProviderName', {
      value: samlProvider.providerName,
      description: 'SAML provider name for configuration',
    });

    return userPool;
  }

  private createUserPoolClient(
    props: AuthenticationProps
  ): cognito.UserPoolClient {
    return new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `ai-agent-client-${props.stage}`,
      generateSecret: false, // SPA doesn't need client secret
      authFlows: {
        userSrp: true,
        userPassword: false, // Disable less secure auth flows
        adminUserPassword: false,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false, // More secure to use authorization code
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          `https://localhost:3000/auth/callback`, // Development
          `https://ai-agent-${props.stage}.example.com/auth/callback`, // Production
        ],
        logoutUrls: [
          `https://localhost:3000/auth/logout`,
          `https://ai-agent-${props.stage}.example.com/auth/logout`,
        ],
      },
      preventUserExistenceErrors: true,
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      enableTokenRevocation: true,
    });
  }

  private createIdentityPool(
    props: AuthenticationProps
  ): cognito.CfnIdentityPool {
    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: `ai_agent_identity_pool_${props.stage}`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
          serverSideTokenCheck: true,
        },
      ],
    });

    // Create authenticated role for identity pool
    const authenticatedRole = new iam.Role(
      this,
      'IdentityPoolAuthenticatedRole',
      {
        roleName: `ai-agent-identity-authenticated-${props.stage}`,
        assumedBy: new iam.FederatedPrincipal(
          'cognito-identity.amazonaws.com',
          {
            StringEquals: {
              'cognito-identity.amazonaws.com:aud': identityPool.ref,
            },
            'ForAnyValue:StringLike': {
              'cognito-identity.amazonaws.com:amr': 'authenticated',
            },
          },
          'sts:AssumeRoleWithWebIdentity'
        ),
        description: 'Role for authenticated users from Cognito Identity Pool',
      }
    );

    // Attach ABAC policies to authenticated role
    this.abacPolicies.forEach(policy => {
      authenticatedRole.addManagedPolicy(policy);
    });

    // Attach role to identity pool
    new cognito.CfnIdentityPoolRoleAttachment(
      this,
      'IdentityPoolRoleAttachment',
      {
        identityPoolId: identityPool.ref,
        roles: {
          authenticated: authenticatedRole.roleArn,
        },
      }
    );

    return identityPool;
  }

  private createAbacPolicies(props: AuthenticationProps): iam.ManagedPolicy[] {
    const policies: iam.ManagedPolicy[] = [];

    // ABAC policy for S3 access based on team_id
    const s3AbacPolicy = new iam.ManagedPolicy(this, 'S3AbacPolicy', {
      managedPolicyName: `ai-agent-s3-abac-${props.stage}`,
      description: 'ABAC policy for S3 access based on user attributes',
      statements: [
        new iam.PolicyStatement({
          sid: 'S3TeamBoundaryAccess',
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
          resources: [
            `arn:aws:s3:::ai-agent-documents-${props.stage}-*/$\{cognito-identity.amazonaws.com:custom:team_id}/*`,
            `arn:aws:s3:::ai-agent-artifacts-${props.stage}-*/$\{cognito-identity.amazonaws.com:custom:team_id}/*`,
          ],
        }),
        new iam.PolicyStatement({
          sid: 'S3ListBucketWithTeamPrefix',
          effect: iam.Effect.ALLOW,
          actions: ['s3:ListBucket'],
          resources: [
            `arn:aws:s3:::ai-agent-documents-${props.stage}-*`,
            `arn:aws:s3:::ai-agent-artifacts-${props.stage}-*`,
          ],
          conditions: {
            StringLike: {
              's3:prefix': [
                '${cognito-identity.amazonaws.com:custom:team_id}/*',
              ],
            },
          },
        }),
      ],
    });
    policies.push(s3AbacPolicy);

    // ABAC policy for DynamoDB access based on team_id and role
    const dynamoAbacPolicy = new iam.ManagedPolicy(this, 'DynamoAbacPolicy', {
      managedPolicyName: `ai-agent-dynamo-abac-${props.stage}`,
      description: 'ABAC policy for DynamoDB access based on user attributes',
      statements: [
        new iam.PolicyStatement({
          sid: 'DynamoTeamRosterAccess',
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:GetItem', 'dynamodb:Query'],
          resources: [
            `arn:aws:dynamodb:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:table/ai-agent-team-roster-${props.stage}`,
          ],
          conditions: {
            'ForAllValues:StringEquals': {
              'dynamodb:LeadingKeys': [
                '${cognito-identity.amazonaws.com:custom:team_id}',
              ],
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'DynamoAuditLogWrite',
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:PutItem'],
          resources: [
            `arn:aws:dynamodb:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:table/ai-agent-audit-log-${props.stage}`,
          ],
          conditions: {
            StringEquals: {
              'dynamodb:Attributes': [
                'user_id',
                'team_id',
                'timestamp',
                'action',
                'references',
              ],
            },
          },
        }),
      ],
    });
    policies.push(dynamoAbacPolicy);

    // ABAC policy for API Gateway access based on clearance level
    const apiAbacPolicy = new iam.ManagedPolicy(this, 'ApiAbacPolicy', {
      managedPolicyName: `ai-agent-api-abac-${props.stage}`,
      description: 'ABAC policy for API access based on clearance level',
      statements: [
        new iam.PolicyStatement({
          sid: 'BasicAPIAccess',
          effect: iam.Effect.ALLOW,
          actions: ['execute-api:Invoke'],
          resources: [
            `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*/*/GET/agent/status/*`,
            `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*/*/POST/agent/query`,
            `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*/*/GET/kendra/search`,
          ],
        }),
        new iam.PolicyStatement({
          sid: 'ElevatedAPIAccess',
          effect: iam.Effect.ALLOW,
          actions: ['execute-api:Invoke'],
          resources: [
            `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*/*/POST/agent/check`,
            `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*/*/POST/jira/create`,
            `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*/*/POST/slack/notify`,
          ],
          conditions: {
            'ForAnyValue:StringEquals': {
              'cognito-identity.amazonaws.com:custom:clearance': [
                'standard',
                'elevated',
                'admin',
              ],
            },
          },
        }),
        new iam.PolicyStatement({
          sid: 'AdminAPIAccess',
          effect: iam.Effect.ALLOW,
          actions: ['execute-api:Invoke'],
          resources: [
            `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*/*/POST/admin/policy`,
            `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*/*/GET/admin/personas`,
            `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:*/*/PUT/admin/persona/*`,
          ],
          conditions: {
            StringEquals: {
              'cognito-identity.amazonaws.com:custom:clearance': 'admin',
            },
          },
        }),
      ],
    });
    policies.push(apiAbacPolicy);

    return policies;
  }

  private createAuthorizerFunction(
    props: AuthenticationProps
  ): lambda.Function {
    // Create log group with retention
    const logGroup = new logs.LogGroup(this, 'AuthorizerLogGroup', {
      logGroupName: `/aws/lambda/ai-agent-authorizer-${props.stage}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    return new lambda.Function(this, 'AuthorizerFunction', {
      functionName: `ai-agent-authorizer-${props.stage}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      role: props.lambdaExecutionRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logGroup,
      layers: [this.lambdaLayer.authLayer],
      environment: {
        USER_POOL_ID: this.userPool.userPoolId,
        USER_POOL_CLIENT_ID: this.userPoolClient.userPoolClientId,
        REGION: cdk.Stack.of(this).region,
        STAGE: props.stage,
        LOG_LEVEL: 'INFO',
      },
      code: lambda.Code.fromInline(`
const { CognitoJwtVerifier } = require('aws-jwt-verify');

// Create the verifier outside the Lambda handler (for caching)
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID,
  tokenUse: 'access',
  clientId: process.env.USER_POOL_CLIENT_ID,
});

exports.handler = async (event) => {
  console.log('Authorizer event:', JSON.stringify(event, null, 2));
  
  try {
    // Extract token from Authorization header
    const token = event.authorizationToken?.replace('Bearer ', '');
    if (!token) {
      throw new Error('No token provided');
    }

    // Verify the JWT token
    const payload = await verifier.verify(token);
    console.log('Token verified successfully:', payload);

    // Extract user attributes
    const userId = payload.sub;
    const username = payload.username;
    const department = payload['custom:department'];
    const teamId = payload['custom:team_id'];
    const role = payload['custom:role'];
    const clearance = payload['custom:clearance'];

    // Generate policy based on user attributes
    const policy = generatePolicy(userId, 'Allow', event.methodArn, {
      userId,
      username,
      department,
      teamId,
      role,
      clearance,
    });

    console.log('Generated policy:', JSON.stringify(policy, null, 2));
    return policy;

  } catch (error) {
    console.error('Authorization failed:', error);
    
    // Return deny policy
    return generatePolicy('user', 'Deny', event.methodArn);
  }
};

function generatePolicy(principalId, effect, resource, context = {}) {
  const authResponse = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    context,
  };

  return authResponse;
}
      `),
    });
  }

  private createApiGatewayAuthorizer(
    props: AuthenticationProps
  ): apigateway.RequestAuthorizer {
    return new apigateway.RequestAuthorizer(this, 'ApiGatewayAuthorizer', {
      handler: this.authorizerFunction,
      identitySources: [apigateway.IdentitySource.header('Authorization')],
      authorizerName: `ai-agent-authorizer-${props.stage}`,
      resultsCacheTtl: cdk.Duration.minutes(5),
    });
  }
}
