// Simple test to verify authentication constructs compile correctly
import { App, Stack } from 'aws-cdk-lib';
import { Authentication } from './constructs/authentication';
import { IamRoles } from './constructs/iam-roles';
import { AuthMiddleware } from './constructs/auth-middleware';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';

// This is just a compilation test - not meant to be deployed
const app = new App();
const stack = new Stack(app, 'TestStack');

// Create minimal resources for testing
const kmsKey = new kms.Key(stack, 'TestKey');
const bucket = new s3.Bucket(stack, 'TestBucket');

const lambdaRole = new iam.Role(stack, 'TestLambdaRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
});

const apiGatewayRole = new iam.Role(stack, 'TestApiGatewayRole', {
  assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
});

// Test IAM roles construct
const iamRoles = new IamRoles(stack, 'TestIamRoles', {
  kmsKey,
  documentsBucket: bucket,
  artifactsBucket: bucket,
  auditLogsBucket: bucket,
  stage: 'test',
});

// Test authentication construct
const auth = new Authentication(stack, 'TestAuth', {
  stage: 'test',
  lambdaExecutionRole: lambdaRole,
  apiGatewayRole,
});

// Test auth middleware construct
const authMiddleware = new AuthMiddleware(stack, 'TestAuthMiddleware', {
  stage: 'test',
  lambdaExecutionRole: lambdaRole,
  userPoolId: 'test-pool-id',
  userPoolClientId: 'test-client-id',
  authLayer: auth.lambdaLayer.authLayer,
});

console.log('✅ All authentication constructs compiled successfully');
console.log('✅ IAM roles created:', Object.keys(iamRoles));
console.log('✅ Authentication components created:', Object.keys(auth));
console.log('✅ Auth middleware created:', Object.keys(authMiddleware));