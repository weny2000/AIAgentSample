import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { TagManager } from '../utils/tag-manager';

export interface RdsPostgreSqlProps {
  vpc: ec2.Vpc;
  kmsKey: kms.Key;
  stage: string;
  lambdaSecurityGroup: ec2.SecurityGroup;
  ecsSecurityGroup: ec2.SecurityGroup;
}

export class RdsPostgreSql extends Construct {
  public readonly database: rds.DatabaseInstance;
  public readonly databaseSecret: secretsmanager.Secret;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: RdsPostgreSqlProps) {
    super(scope, id);

    // Create security group for RDS
    this.securityGroup = new ec2.SecurityGroup(this, 'RdsSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for RDS PostgreSQL database',
      allowAllOutbound: false,
    });

    // Allow Lambda and ECS to connect to RDS on PostgreSQL port
    this.securityGroup.addIngressRule(
      props.lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda functions to connect to PostgreSQL'
    );

    this.securityGroup.addIngressRule(
      props.ecsSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow ECS tasks to connect to PostgreSQL'
    );

    // Create database credentials secret
    this.databaseSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      description: `AI Agent PostgreSQL database credentials for ${props.stage}`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'aiagent' }),
        generateStringKey: 'password',
        excludeCharacters: '"@/\\\'',
        includeSpace: false,
        passwordLength: 32,
      },
      encryptionKey: props.kmsKey,
    });

    // Create DB subnet group
    const subnetGroup = new rds.SubnetGroup(this, 'DatabaseSubnetGroup', {
      description: 'Subnet group for AI Agent PostgreSQL database',
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // Create parameter group for PostgreSQL optimization
    const parameterGroup = new rds.ParameterGroup(this, 'DatabaseParameterGroup', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_4,
      }),
      description: 'Parameter group for AI Agent PostgreSQL database',
      parameters: {
        // Connection settings
        'max_connections': '200',
        'shared_preload_libraries': 'pg_stat_statements',
        
        // Memory settings
        'shared_buffers': '{DBInstanceClassMemory/4}',
        'effective_cache_size': '{DBInstanceClassMemory*3/4}',
        'work_mem': '4MB',
        'maintenance_work_mem': '64MB',
        
        // Checkpoint settings
        'checkpoint_completion_target': '0.9',
        'wal_buffers': '16MB',
        
        // Query planner settings
        'random_page_cost': '1.1',
        'effective_io_concurrency': '200',
        
        // Logging settings
        'log_statement': 'mod',
        'log_min_duration_statement': '1000',
        'log_checkpoints': '1',
        'log_connections': '1',
        'log_disconnections': '1',
        'log_lock_waits': '1',
      },
    });

    // Create the RDS PostgreSQL instance
    this.database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_4,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        props.stage === 'prod' ? ec2.InstanceSize.MEDIUM : ec2.InstanceSize.MICRO
      ),
      credentials: rds.Credentials.fromSecret(this.databaseSecret),
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      subnetGroup,
      securityGroups: [this.securityGroup],
      parameterGroup,
      
      // Database configuration
      databaseName: 'aiagent',
      port: 5432,
      
      // Storage configuration
      allocatedStorage: props.stage === 'prod' ? 100 : 20,
      maxAllocatedStorage: props.stage === 'prod' ? 1000 : 100,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      storageEncryptionKey: props.kmsKey,
      
      // Backup and maintenance
      backupRetention: cdk.Duration.days(props.stage === 'prod' ? 30 : 7),
      deleteAutomatedBackups: props.stage !== 'prod',
      deletionProtection: props.stage === 'prod',
      
      // Monitoring and logging
      monitoringInterval: cdk.Duration.seconds(60),
      enablePerformanceInsights: true,
      performanceInsightEncryptionKey: props.kmsKey,
      performanceInsightRetention: props.stage === 'prod' 
        ? rds.PerformanceInsightRetention.LONG_TERM 
        : rds.PerformanceInsightRetention.DEFAULT,
      
      cloudwatchLogsExports: ['postgresql'],
      
      // Multi-AZ for production
      multiAz: props.stage === 'prod',
      
      // Auto minor version upgrade
      autoMinorVersionUpgrade: true,
      
      // Preferred maintenance window (Sunday 3-4 AM UTC)
      preferredMaintenanceWindow: 'sun:03:00-sun:04:00',
      
      // Preferred backup window (2-3 AM UTC)
      preferredBackupWindow: '02:00-03:00',
      
      removalPolicy: props.stage === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
    });

    // Create read replica for production
    let readReplica: rds.DatabaseInstanceReadReplica | undefined;
    if (props.stage === 'prod') {
      readReplica = new rds.DatabaseInstanceReadReplica(this, 'DatabaseReadReplica', {
        sourceDatabaseInstance: this.database,
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
        vpc: props.vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        securityGroups: [this.securityGroup],
        storageEncrypted: true,
        storageEncryptionKey: props.kmsKey,
        enablePerformanceInsights: true,
        performanceInsightEncryptionKey: props.kmsKey,
        autoMinorVersionUpgrade: true,
        deleteAutomatedBackups: false,
        deletionProtection: true,
      });
    }

    // Output database connection information
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.database.instanceEndpoint.hostname,
      description: 'RDS PostgreSQL database endpoint',
    });

    new cdk.CfnOutput(this, 'DatabasePort', {
      value: this.database.instanceEndpoint.port.toString(),
      description: 'RDS PostgreSQL database port',
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: this.databaseSecret.secretArn,
      description: 'ARN of the database credentials secret',
    });

    // Initialize TagManager
    const tagManager = new TagManager(null, props.stage);

    // Determine backup policy based on backup retention
    const backupRetentionDays = props.stage === 'prod' ? 30 : 7;
    const backupPolicy = backupRetentionDays >= 30 ? 'Daily' : backupRetentionDays >= 7 ? 'Weekly' : 'None';

    // Apply resource-specific tags to RDS instance
    const rdsTags = tagManager.getResourceTags('rds', 'Database');
    tagManager.applyTags(this.database, {
      ...rdsTags,
      Engine: 'PostgreSQL',
      DataClassification: 'Confidential',
      BackupPolicy: backupPolicy,
    });

    // Apply tags to read replica if it exists (production only)
    if (readReplica) {
      tagManager.applyTags(readReplica, {
        ...rdsTags,
        Engine: 'PostgreSQL',
        DataClassification: 'Confidential',
        BackupPolicy: backupPolicy,
        ReplicaType: 'ReadReplica',
      });
    }
  }
}