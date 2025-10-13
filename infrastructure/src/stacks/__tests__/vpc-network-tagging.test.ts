import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { TagManager } from '../../utils/tag-manager';
import { getTagConfig } from '../../config/tag-config';

describe('VPC and Network Resource Tagging', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let template: Template;
  let tagManager: TagManager;
  let vpc: ec2.Vpc;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });

    // Initialize TagManager
    const tagConfig = getTagConfig('test');
    tagManager = new TagManager(tagConfig, 'test');

    // Apply mandatory tags at stack level
    const mandatoryTags = tagManager.getMandatoryTags();
    Object.entries(mandatoryTags).forEach(([key, value]) => {
      cdk.Tags.of(stack).add(key, value);
    });

    // Create VPC with private and public subnets
    vpc = new ec2.Vpc(stack, 'TestVpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 3,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Apply tags to VPC
    tagManager.applyTags(vpc, {
      Component: 'Network-VPC',
    });

    // Tag private subnets with NetworkTier and SubnetIndex
    vpc.privateSubnets.forEach((subnet, index) => {
      cdk.Tags.of(subnet).add('NetworkTier', 'Private');
      cdk.Tags.of(subnet).add('SubnetIndex', index.toString());
    });

    // Tag public subnets with NetworkTier and SubnetIndex
    vpc.publicSubnets.forEach((subnet, index) => {
      cdk.Tags.of(subnet).add('NetworkTier', 'Public');
      cdk.Tags.of(subnet).add('SubnetIndex', index.toString());
    });

    // Create security groups
    const lambdaSecurityGroup = new ec2.SecurityGroup(stack, 'LambdaSecurityGroup', {
      vpc: vpc,
      description: 'Security group for Lambda functions',
      allowAllOutbound: true,
    });
    tagManager.applyTags(lambdaSecurityGroup, {
      Component: 'Network-VPC',
      SecurityGroupPurpose: 'Lambda',
    });

    const ecsSecurityGroup = new ec2.SecurityGroup(stack, 'EcsSecurityGroup', {
      vpc: vpc,
      description: 'Security group for ECS tasks',
      allowAllOutbound: true,
    });
    tagManager.applyTags(ecsSecurityGroup, {
      Component: 'Network-VPC',
      SecurityGroupPurpose: 'ECS',
    });

    const vpcEndpointSecurityGroup = new ec2.SecurityGroup(stack, 'VpcEndpointSecurityGroup', {
      vpc: vpc,
      description: 'Security group for VPC endpoints',
      allowAllOutbound: false,
    });
    tagManager.applyTags(vpcEndpointSecurityGroup, {
      Component: 'Network-VPC',
      SecurityGroupPurpose: 'VPCEndpoints',
    });

    // Create VPC endpoints
    const s3Endpoint = vpc.addGatewayEndpoint('S3GatewayEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });
    tagManager.applyTags(s3Endpoint, {
      Component: 'Network-VPC',
      EndpointType: 'Gateway',
      EndpointService: 'S3',
    });

    const kmsEndpoint = vpc.addInterfaceEndpoint('KmsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.KMS,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });
    tagManager.applyTags(kmsEndpoint, {
      Component: 'Network-VPC',
      EndpointType: 'Interface',
      EndpointService: 'KMS',
    });

    const secretsManagerEndpoint = vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });
    tagManager.applyTags(secretsManagerEndpoint, {
      Component: 'Network-VPC',
      EndpointType: 'Interface',
      EndpointService: 'SecretsManager',
    });

    template = Template.fromStack(stack);
  });

  describe('VPC Tagging', () => {
    it('should apply Component tag to VPC', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Network-VPC' },
        ]),
      });
    });

    it('should apply mandatory tags to VPC', () => {
      // VPC should have at least Project and Stage tags
      // Note: ManagedBy and other tags are applied at stack level and propagate to VPC
      template.hasResourceProperties('AWS::EC2::VPC', {
        Tags: Match.arrayWith([
          { Key: 'Project', Value: 'AiAgentSystem' },
          { Key: 'Stage', Value: 'test' },
        ]),
      });
      
      // Verify ManagedBy tag is also present
      const vpcs = template.findResources('AWS::EC2::VPC');
      const vpcTags = Object.values(vpcs)[0] as any;
      const tagKeys = vpcTags.Properties.Tags.map((tag: any) => tag.Key);
      expect(tagKeys).toContain('ManagedBy');
    });
  });

  describe('Subnet Tagging', () => {
    it('should tag private subnets with NetworkTier: Private', () => {
      const subnets = template.findResources('AWS::EC2::Subnet', {
        Properties: {
          Tags: Match.arrayWith([
            { Key: 'NetworkTier', Value: 'Private' },
          ]),
        },
      });

      // Should have at least one private subnet
      expect(Object.keys(subnets).length).toBeGreaterThan(0);
    });

    it('should tag public subnets with NetworkTier: Public', () => {
      const subnets = template.findResources('AWS::EC2::Subnet', {
        Properties: {
          Tags: Match.arrayWith([
            { Key: 'NetworkTier', Value: 'Public' },
          ]),
        },
      });

      // Should have at least one public subnet
      expect(Object.keys(subnets).length).toBeGreaterThan(0);
    });

    it('should add SubnetIndex tags to all subnets', () => {
      const allSubnets = template.findResources('AWS::EC2::Subnet');
      
      // Check that each subnet has a SubnetIndex tag
      Object.values(allSubnets).forEach((subnet: any) => {
        const tags = subnet.Properties.Tags;
        const hasSubnetIndex = tags.some(
          (tag: any) => tag.Key === 'SubnetIndex'
        );
        expect(hasSubnetIndex).toBe(true);
      });
    });

    it('should apply mandatory tags to all subnets', () => {
      const allSubnets = template.findResources('AWS::EC2::Subnet');
      
      // Check that each subnet has mandatory tags
      Object.values(allSubnets).forEach((subnet: any) => {
        const tags = subnet.Properties.Tags;
        const tagKeys = tags.map((tag: any) => tag.Key);
        
        expect(tagKeys).toContain('Project');
        expect(tagKeys).toContain('Stage');
        expect(tagKeys).toContain('ManagedBy');
      });
    });
  });

  describe('Security Group Tagging', () => {
    it('should tag Lambda security group with appropriate component tags', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for Lambda functions',
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Network-VPC' },
          { Key: 'SecurityGroupPurpose', Value: 'Lambda' },
        ]),
      });
    });

    it('should tag ECS security group with appropriate component tags', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for ECS tasks',
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Network-VPC' },
          { Key: 'SecurityGroupPurpose', Value: 'ECS' },
        ]),
      });
    });

    it('should tag VPC endpoint security group with appropriate component tags', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for VPC endpoints',
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Network-VPC' },
          { Key: 'SecurityGroupPurpose', Value: 'VPCEndpoints' },
        ]),
      });
    });

    it('should apply mandatory tags to all security groups', () => {
      const securityGroups = template.findResources('AWS::EC2::SecurityGroup');
      
      Object.values(securityGroups).forEach((sg: any) => {
        const tags = sg.Properties.Tags;
        const tagKeys = tags.map((tag: any) => tag.Key);
        
        expect(tagKeys).toContain('Project');
        expect(tagKeys).toContain('Stage');
        expect(tagKeys).toContain('ManagedBy');
        expect(tagKeys).toContain('Component');
      });
    });
  });

  describe('VPC Endpoint Tagging', () => {
    it('should tag S3 Gateway endpoint with component tags', () => {
      const endpoints = template.findResources('AWS::EC2::VPCEndpoint', {
        Properties: {
          ServiceName: Match.objectLike({
            'Fn::Join': Match.arrayWith([
              Match.arrayWith([Match.stringLikeRegexp('s3')]),
            ]),
          }),
        },
      });

      // Check that S3 endpoint has appropriate tags
      Object.values(endpoints).forEach((endpoint: any) => {
        const tags = endpoint.Properties.Tags || [];
        const tagMap = tags.reduce((acc: any, tag: any) => {
          acc[tag.Key] = tag.Value;
          return acc;
        }, {});

        expect(tagMap['Component']).toBe('Network-VPC');
        expect(tagMap['EndpointType']).toBe('Gateway');
        expect(tagMap['EndpointService']).toBe('S3');
      });
    });

    it('should tag interface endpoints with component tags', () => {
      const interfaceEndpoints = template.findResources('AWS::EC2::VPCEndpoint', {
        Properties: {
          VpcEndpointType: 'Interface',
        },
      });

      // Should have multiple interface endpoints
      expect(Object.keys(interfaceEndpoints).length).toBeGreaterThan(0);

      // Check that each interface endpoint has appropriate tags
      Object.values(interfaceEndpoints).forEach((endpoint: any) => {
        const tags = endpoint.Properties.Tags || [];
        const tagMap = tags.reduce((acc: any, tag: any) => {
          acc[tag.Key] = tag.Value;
          return acc;
        }, {});

        expect(tagMap['Component']).toBe('Network-VPC');
        expect(tagMap['EndpointType']).toBe('Interface');
        expect(tagMap['EndpointService']).toBeDefined();
      });
    });

    it('should apply mandatory tags to all VPC endpoints', () => {
      const endpoints = template.findResources('AWS::EC2::VPCEndpoint');
      
      Object.values(endpoints).forEach((endpoint: any) => {
        const tags = endpoint.Properties.Tags || [];
        const tagKeys = tags.map((tag: any) => tag.Key);
        
        expect(tagKeys).toContain('Project');
        expect(tagKeys).toContain('Stage');
        expect(tagKeys).toContain('ManagedBy');
        expect(tagKeys).toContain('Component');
      });
    });

    it('should tag KMS endpoint correctly', () => {
      const kmsEndpoints = template.findResources('AWS::EC2::VPCEndpoint', {
        Properties: {
          ServiceName: Match.objectLike({
            'Fn::Join': Match.arrayWith([
              Match.arrayWith([Match.stringLikeRegexp('kms')]),
            ]),
          }),
        },
      });

      Object.values(kmsEndpoints).forEach((endpoint: any) => {
        const tags = endpoint.Properties.Tags || [];
        const tagMap = tags.reduce((acc: any, tag: any) => {
          acc[tag.Key] = tag.Value;
          return acc;
        }, {});

        expect(tagMap['EndpointService']).toBe('KMS');
      });
    });

    it('should tag Secrets Manager endpoint correctly', () => {
      const secretsEndpoints = template.findResources('AWS::EC2::VPCEndpoint', {
        Properties: {
          ServiceName: Match.objectLike({
            'Fn::Join': Match.arrayWith([
              Match.arrayWith([Match.stringLikeRegexp('secretsmanager')]),
            ]),
          }),
        },
      });

      Object.values(secretsEndpoints).forEach((endpoint: any) => {
        const tags = endpoint.Properties.Tags || [];
        const tagMap = tags.reduce((acc: any, tag: any) => {
          acc[tag.Key] = tag.Value;
          return acc;
        }, {});

        expect(tagMap['EndpointService']).toBe('SecretsManager');
      });
    });
  });

  describe('Tag Propagation', () => {
    it('should ensure VPC tags propagate to subnets', () => {
      const vpc = template.findResources('AWS::EC2::VPC');
      const subnets = template.findResources('AWS::EC2::Subnet');

      // Get VPC tags
      const vpcTags = Object.values(vpc)[0] as any;
      const vpcTagKeys = vpcTags.Properties.Tags.map((tag: any) => tag.Key);

      // Check that subnets have the same mandatory tags
      Object.values(subnets).forEach((subnet: any) => {
        const subnetTagKeys = subnet.Properties.Tags.map((tag: any) => tag.Key);
        
        // Mandatory tags should be present in subnets
        expect(subnetTagKeys).toContain('Project');
        expect(subnetTagKeys).toContain('Stage');
        expect(subnetTagKeys).toContain('ManagedBy');
      });
    });

    it('should ensure security groups have consistent tagging', () => {
      const securityGroups = template.findResources('AWS::EC2::SecurityGroup');
      
      // All security groups should have Component: Network-VPC
      Object.values(securityGroups).forEach((sg: any) => {
        const tags = sg.Properties.Tags;
        const componentTag = tags.find((tag: any) => tag.Key === 'Component');
        
        expect(componentTag).toBeDefined();
        expect(componentTag.Value).toBe('Network-VPC');
      });
    });
  });

  describe('Requirements Verification', () => {
    it('should satisfy Requirement 2.5: VPC resources with Component and NetworkTier tags', () => {
      // VPC should have Component tag
      template.hasResourceProperties('AWS::EC2::VPC', {
        Tags: Match.arrayWith([
          { Key: 'Component', Value: 'Network-VPC' },
        ]),
      });

      // Subnets should have NetworkTier tags
      const privateSubnets = template.findResources('AWS::EC2::Subnet', {
        Properties: {
          Tags: Match.arrayWith([
            { Key: 'NetworkTier', Value: 'Private' },
          ]),
        },
      });

      const publicSubnets = template.findResources('AWS::EC2::Subnet', {
        Properties: {
          Tags: Match.arrayWith([
            { Key: 'NetworkTier', Value: 'Public' },
          ]),
        },
      });

      expect(Object.keys(privateSubnets).length).toBeGreaterThan(0);
      expect(Object.keys(publicSubnets).length).toBeGreaterThan(0);
    });

    it('should satisfy Requirement 4.1: Tag propagation from VPC to child resources', () => {
      const vpc = template.findResources('AWS::EC2::VPC');
      const subnets = template.findResources('AWS::EC2::Subnet');
      const securityGroups = template.findResources('AWS::EC2::SecurityGroup');

      // Get mandatory tags from VPC
      const vpcTags = Object.values(vpc)[0] as any;
      const mandatoryTags = ['Project', 'Stage', 'ManagedBy'];

      // Verify subnets have mandatory tags
      Object.values(subnets).forEach((subnet: any) => {
        const subnetTagKeys = subnet.Properties.Tags.map((tag: any) => tag.Key);
        mandatoryTags.forEach(tagKey => {
          expect(subnetTagKeys).toContain(tagKey);
        });
      });

      // Verify security groups have mandatory tags
      Object.values(securityGroups).forEach((sg: any) => {
        const sgTagKeys = sg.Properties.Tags.map((tag: any) => tag.Key);
        mandatoryTags.forEach(tagKey => {
          expect(sgTagKeys).toContain(tagKey);
        });
      });
    });
  });
});
