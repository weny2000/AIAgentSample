# AWS Resource Tag Maintenance Procedures

## Overview

This document outlines the procedures for maintaining AWS resource tags in the AI Agent System infrastructure. Proper tag maintenance ensures accurate cost allocation, compliance tracking, and resource management.

## Tag Maintenance Schedule

### Monthly Reviews
- **First Monday of each month**: Review cost allocation reports
- **Second Monday of each month**: Audit tag compliance across all environments
- **Third Monday of each month**: Update tag documentation if needed
- **Fourth Monday of each month**: Review and update tag governance policies

### Quarterly Reviews
- **End of each quarter**: Comprehensive tag audit
- **Beginning of each quarter**: Update cost center allocations if needed
- **Mid-quarter**: Review tag schema for new requirements

### Annual Reviews
- **Beginning of fiscal year**: Review and update tagging strategy
- **Mid-year**: Assess tag effectiveness for cost optimization
- **End of fiscal year**: Prepare annual compliance reports

## Tag Validation Procedures

### Pre-Deployment Validation

1. **Automated Validation**
   ```bash
   # Run tag validation before deployment
   cd infrastructure
   npm run validate-tags
   ```

2. **Manual Review**
   - Review `cdk diff` output for tag changes
   - Verify new resources have appropriate tags
   - Check data classification tags for storage resources

3. **Environment-Specific Validation**
   ```bash
   # Validate tags for specific environments
   npm run validate-tags:dev
   npm run validate-tags:staging  
   npm run validate-tags:production
   ```

### Post-Deployment Validation

1. **AWS Console Verification**
   - Spot-check resources in AWS Console
   - Verify tags are applied correctly
   - Check cost allocation tag activation

2. **Automated Reporting**
   ```bash
   # Generate tag documentation
   npm run docs:generate:production
   ```

3. **Cost Allocation Verification**
   - Check AWS Cost Explorer for tag-based reports
   - Verify cost allocation tags are active
   - Review cost center allocations

## Tag Update Procedures

### Adding New Tags

1. **Update Tag Configuration**
   - Modify `src/config/tag-config.ts`
   - Add new tag to appropriate interface
   - Update validation rules if needed

2. **Update TagManager**
   - Add logic for new tag in `src/utils/tag-manager.ts`
   - Update resource-specific tag methods
   - Add validation for new tag

3. **Update Documentation**
   - Update `TAGGING_GOVERNANCE_POLICY.md`
   - Update `CODE_REVIEW_CHECKLIST.md`
   - Regenerate tag documentation

4. **Testing**
   - Write unit tests for new tag logic
   - Run integration tests
   - Test in development environment first

### Modifying Existing Tags

1. **Impact Assessment**
   - Identify affected resources
   - Assess cost allocation impact
   - Check compliance implications

2. **Backward Compatibility**
   - Ensure existing resources continue to work
   - Plan migration strategy if needed
   - Document breaking changes

3. **Deployment Strategy**
   - Deploy to development first
   - Validate in staging
   - Coordinate production deployment

### Removing Tags

1. **Deprecation Process**
   - Mark tag as deprecated in documentation
   - Set removal timeline (minimum 3 months)
   - Notify stakeholders

2. **Migration Planning**
   - Identify replacement tags if needed
   - Plan data migration
   - Update cost allocation reports

3. **Removal Execution**
   - Remove from tag configuration
   - Update validation rules
   - Clean up documentation

## Tag Compliance Monitoring

### Automated Monitoring

1. **Daily Checks**
   - Automated tag validation in CI/CD pipeline
   - Alert on validation failures
   - Monitor tag coverage metrics

2. **Weekly Reports**
   - Generate tag compliance reports
   - Identify resources with missing tags
   - Track tag coverage trends

3. **Monthly Audits**
   - Comprehensive tag audit across all environments
   - Cost allocation tag verification
   - Compliance scope validation

### Manual Monitoring

1. **Resource Inventory**
   ```bash
   # List all resources with tags
   aws resourcegroupstaggingapi get-resources \
     --region us-east-1 \
     --resource-type-filters "AWS::Lambda::Function" \
     --tag-filters Key=Project,Values=AiAgentSystem
   ```

2. **Cost Allocation Review**
   - Review AWS Cost Explorer reports
   - Verify tag-based cost allocation
   - Identify untagged resources

3. **Compliance Verification**
   - Check data classification tags
   - Verify production compliance tags
   - Audit backup policy tags

## Tag Remediation Procedures

### Missing Mandatory Tags

1. **Identification**
   - Run tag validation to identify missing tags
   - Use AWS Resource Groups to find untagged resources
   - Generate remediation report

2. **Remediation**
   ```bash
   # Update infrastructure code to add missing tags
   # Deploy updated stack
   cdk deploy --context stage=production
   ```

3. **Verification**
   - Verify tags are applied correctly
   - Update tag compliance reports
   - Monitor for future compliance

### Incorrect Tag Values

1. **Detection**
   - Automated validation alerts
   - Manual audit findings
   - Cost allocation discrepancies

2. **Correction**
   - Update tag configuration
   - Deploy corrected tags
   - Verify in AWS Console

3. **Prevention**
   - Update validation rules
   - Improve automated testing
   - Update documentation

### Orphaned Resources

1. **Identification**
   - Resources not managed by CDK
   - Resources with incorrect tags
   - Resources missing from inventory

2. **Assessment**
   - Determine resource ownership
   - Assess business impact
   - Plan remediation approach

3. **Remediation**
   - Import into CDK if appropriate
   - Apply correct tags manually
   - Document exceptions

## Cost Allocation Tag Management

### Activation Process

1. **AWS Billing Console**
   - Navigate to Cost Allocation Tags
   - Activate required tags:
     - Project
     - Stage
     - Environment
     - Component
     - Owner
     - CostCenter

2. **Verification**
   - Wait 24 hours for activation
   - Verify tags appear in Cost Explorer
   - Test cost allocation reports

3. **Documentation**
   - Update cost allocation guide
   - Notify finance team
   - Update reporting procedures

### Cost Optimization

1. **Regular Reviews**
   - Monthly cost analysis by tag
   - Identify cost optimization opportunities
   - Review resource utilization

2. **Recommendations**
   - Right-size resources based on usage
   - Implement auto-shutdown for dev resources
   - Optimize backup policies

3. **Implementation**
   - Update infrastructure code
   - Deploy optimizations
   - Monitor cost impact

## Emergency Procedures

### Tag Validation Failures

1. **Immediate Response**
   - Stop deployment if validation fails
   - Identify root cause
   - Fix validation errors

2. **Escalation**
   - Notify team lead if unable to resolve
   - Document issue and resolution
   - Update procedures if needed

### Compliance Violations

1. **Assessment**
   - Identify compliance impact
   - Assess data exposure risk
   - Determine remediation urgency

2. **Remediation**
   - Apply correct tags immediately
   - Verify compliance restoration
   - Document incident

3. **Prevention**
   - Update validation rules
   - Improve monitoring
   - Enhance training

### Cost Allocation Issues

1. **Detection**
   - Unexpected cost allocations
   - Missing cost data
   - Incorrect cost center assignments

2. **Investigation**
   - Review tag configuration
   - Check AWS Cost Explorer
   - Verify tag activation

3. **Resolution**
   - Correct tag values
   - Reactivate cost allocation tags if needed
   - Update cost reports

## Documentation Maintenance

### Regular Updates

1. **Tag Reference Documentation**
   - Update after any tag schema changes
   - Regenerate automatically with deployments
   - Review quarterly for accuracy

2. **Governance Policies**
   - Update annually or when requirements change
   - Review with compliance team
   - Communicate changes to all teams

3. **Procedures Documentation**
   - Update when processes change
   - Review after incidents
   - Incorporate lessons learned

### Version Control

1. **Change Tracking**
   - All documentation changes in Git
   - Meaningful commit messages
   - Tag major policy changes

2. **Review Process**
   - Peer review for documentation changes
   - Stakeholder approval for policy changes
   - Communication of updates

## Training and Communication

### Team Training

1. **New Team Members**
   - Tagging strategy overview
   - Hands-on tag validation
   - Review of procedures

2. **Regular Training**
   - Quarterly team updates
   - Annual comprehensive review
   - Incident-based training

### Stakeholder Communication

1. **Regular Updates**
   - Monthly compliance reports
   - Quarterly cost allocation reviews
   - Annual strategy updates

2. **Change Communication**
   - Advance notice of tag changes
   - Impact assessment communication
   - Training on new procedures

## Tools and Automation

### Recommended Tools

1. **AWS CLI Scripts**
   - Resource inventory scripts
   - Tag compliance checking
   - Bulk tag updates

2. **Monitoring Tools**
   - CloudWatch dashboards
   - Cost allocation reports
   - Compliance monitoring

3. **Automation**
   - CI/CD pipeline integration
   - Automated reporting
   - Alert notifications

### Custom Scripts

1. **Tag Audit Script**
   ```bash
   #!/bin/bash
   # Generate comprehensive tag audit report
   aws resourcegroupstaggingapi get-resources \
     --region us-east-1 \
     --tag-filters Key=Project,Values=AiAgentSystem \
     --output table
   ```

2. **Cost Allocation Report**
   ```bash
   #!/bin/bash
   # Generate cost allocation report by component
   aws ce get-cost-and-usage \
     --time-period Start=2025-01-01,End=2025-01-31 \
     --granularity MONTHLY \
     --metrics UnblendedCost \
     --group-by Type=TAG,Key=Component
   ```

## Contact Information

### Escalation Contacts

- **Infrastructure Team Lead**: [Contact Information]
- **Platform Team**: [Contact Information]
- **Compliance Officer**: [Contact Information]
- **Finance Team**: [Contact Information]

### Support Channels

- **Slack**: #infrastructure-support
- **Email**: infrastructure-team@company.com
- **Documentation**: Internal wiki/confluence

---

## Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-01-07 | Initial version | Infrastructure Team |

---

*This document should be reviewed and updated quarterly or when significant changes are made to the tagging strategy.*