import * as cdk from 'aws-cdk-lib';
import * as kendra from 'aws-cdk-lib/aws-kendra';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

export interface KendraSearchProps {
  stage: string;
  documentsBucket: s3.Bucket;
  kmsKey: kms.Key;
}

export class KendraSearch extends Construct {
  public readonly kendraIndex: kendra.CfnIndex;
  public readonly kendraRole: iam.Role;
  public readonly s3DataSource: kendra.CfnDataSource;

  constructor(scope: Construct, id: string, props: KendraSearchProps) {
    super(scope, id);

    // Create IAM role for Kendra service
    this.kendraRole = new iam.Role(this, 'KendraServiceRole', {
      roleName: `ai-agent-kendra-service-${props.stage}`,
      assumedBy: new iam.ServicePrincipal('kendra.amazonaws.com'),
      description: 'Service role for Amazon Kendra index',
    });

    // Add permissions for Kendra to access S3 and CloudWatch
    this.kendraRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'S3Access',
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetObject',
          's3:ListBucket',
          's3:GetBucketLocation',
        ],
        resources: [
          props.documentsBucket.bucketArn,
          `${props.documentsBucket.bucketArn}/*`,
        ],
      })
    );

    this.kendraRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'KMSAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'kms:Decrypt',
          'kms:GenerateDataKey',
          'kms:DescribeKey',
        ],
        resources: [props.kmsKey.keyArn],
      })
    );

    this.kendraRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogsAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:DescribeLogGroups',
          'logs:DescribeLogStreams',
        ],
        resources: [
          `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:/aws/kendra/*`,
        ],
      })
    );

    // Create Kendra index
    this.kendraIndex = new kendra.CfnIndex(this, 'KendraIndex', {
      name: `ai-agent-knowledge-base-${props.stage}`,
      description: 'AI Agent system knowledge base for enterprise search',
      edition: 'DEVELOPER_EDITION', // Use ENTERPRISE_EDITION for production
      roleArn: this.kendraRole.roleArn,
      serverSideEncryptionConfiguration: {
        kmsKeyId: props.kmsKey.keyId,
      },
      capacityUnits: {
        queryCapacityUnits: 0,
        storageCapacityUnits: 0,
      },
      documentMetadataConfigurations: [
        {
          name: 'team_id',
          type: 'STRING_VALUE',
          search: {
            facetable: true,
            searchable: true,
            displayable: true,
          },
        },
        {
          name: 'source_type',
          type: 'STRING_VALUE',
          search: {
            facetable: true,
            searchable: true,
            displayable: true,
          },
        },
        {
          name: 'access_level',
          type: 'STRING_VALUE',
          search: {
            facetable: true,
            searchable: false,
            displayable: false,
          },
        },
        {
          name: 'department',
          type: 'STRING_VALUE',
          search: {
            facetable: true,
            searchable: true,
            displayable: true,
          },
        },
        {
          name: 'confidence_score',
          type: 'LONG_VALUE',
          search: {
            facetable: false,
            searchable: false,
            displayable: true,
          },
        },
        {
          name: 'created_date',
          type: 'DATE_VALUE',
          search: {
            facetable: true,
            searchable: false,
            displayable: true,
          },
        },
      ],
      userContextPolicy: 'USER_TOKEN',
      userTokenConfigurations: [
        {
          jwtTokenTypeConfiguration: {
            keyLocation: 'URL',
            url: `https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${cdk.Stack.of(this).region}_PLACEHOLDER/.well-known/jwks.json`,
            secretManagerArn: `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:ai-agent/jwt-secret`,
            userNameAttributeField: 'cognito:username',
            groupAttributeField: 'cognito:groups',
          },
        },
      ],
    });

    // Create S3 data source for Kendra
    this.s3DataSource = new kendra.CfnDataSource(this, 'S3DataSource', {
      indexId: this.kendraIndex.attrId,
      name: `ai-agent-s3-datasource-${props.stage}`,
      description: 'S3 data source for ingested documents',
      type: 'S3',
      roleArn: this.kendraRole.roleArn,
      dataSourceConfiguration: {
        s3Configuration: {
          bucketName: props.documentsBucket.bucketName,
          inclusionPrefixes: ['processed/'],
          exclusionPatterns: ['*.tmp', '*.log'],
          documentsMetadataConfiguration: {
            s3Prefix: 'processed/metadata/',
          },
          accessControlListConfiguration: {
            keyPath: 'processed/acl/',
          },
        },
      },
      schedule: 'cron(0 2 * * ? *)', // Daily at 2 AM UTC
    });

    // Output the Kendra index ID
    new cdk.CfnOutput(this, 'KendraIndexId', {
      value: this.kendraIndex.attrId,
      exportName: `${cdk.Stack.of(this).stackName}-KendraIndexId`,
      description: 'Amazon Kendra index ID for knowledge base search',
    });

    new cdk.CfnOutput(this, 'KendraIndexArn', {
      value: this.kendraIndex.attrArn,
      exportName: `${cdk.Stack.of(this).stackName}-KendraIndexArn`,
      description: 'Amazon Kendra index ARN for knowledge base search',
    });

    // Add tags
    cdk.Tags.of(this).add('Component', 'KendraSearch');
    cdk.Tags.of(this).add('Stage', props.stage);
  }
}