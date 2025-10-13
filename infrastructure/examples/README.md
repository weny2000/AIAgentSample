# AWS Resource Tagging Examples

This directory contains example scripts demonstrating how to use the AWS resource tagging utilities.

## Available Examples

### 1. Generate Tag Documentation

**File:** `generate-tag-documentation.ts`

Demonstrates how to use the `TagDocumentationGenerator` to create comprehensive tag documentation and compliance reports.

#### Usage

Generate documentation for all environments:
```bash
npx ts-node examples/generate-tag-documentation.ts
```

Generate documentation for a specific environment:
```bash
npx ts-node examples/generate-tag-documentation.ts dev
npx ts-node examples/generate-tag-documentation.ts staging
npx ts-node examples/generate-tag-documentation.ts production
```

#### Output

The script generates the following files in the `docs/` directory:
- `TAG_REFERENCE_DEV.md` - Complete tag reference for development
- `TAG_REFERENCE_STAGING.md` - Complete tag reference for staging
- `TAG_REFERENCE_PRODUCTION.md` - Complete tag reference for production
- `COMPLIANCE_REPORT_DEV.md` - Compliance report for development
- `COMPLIANCE_REPORT_STAGING.md` - Compliance report for staging
- `COMPLIANCE_REPORT_PRODUCTION.md` - Compliance report for production

#### Features Demonstrated

1. **Tag Key Listing**: Lists all unique tag keys used in the system
2. **Cost Allocation Tags**: Generates list of tags for AWS Billing Console
3. **Comprehensive Documentation**: Creates detailed markdown documentation
4. **Compliance Reporting**: Generates compliance reports with requirements
5. **Multi-Environment Support**: Handles dev, staging, and production

## Running Examples

### Prerequisites

Ensure you have the infrastructure dependencies installed:
```bash
cd infrastructure
npm install
```

### TypeScript Compilation

Examples are written in TypeScript and can be run directly with `ts-node`:
```bash
npm install -g ts-node  # If not already installed
npx ts-node examples/generate-tag-documentation.ts
```

Or compile first and run with Node.js:
```bash
npx tsc examples/generate-tag-documentation.ts
node examples/generate-tag-documentation.js
```

## Integration with CI/CD

You can integrate these examples into your CI/CD pipeline to automatically generate documentation on deployment:

```yaml
# Example GitHub Actions workflow
- name: Generate Tag Documentation
  run: |
    cd infrastructure
    npx ts-node examples/generate-tag-documentation.ts production
    
- name: Commit Documentation
  run: |
    git add docs/
    git commit -m "Update tag documentation [skip ci]"
    git push
```

## Example Output

When you run the documentation generator, you'll see output like:

```
╔════════════════════════════════════════════════════════════╗
║   AWS Resource Tagging Documentation Generator            ║
╚════════════════════════════════════════════════════════════╝

=== Generating Tag Documentation for production ===

1. Listing all tag keys...
   Found 26 unique tag keys:
   ApiPurpose, AuthPurpose, AutoShutdown, BackupPolicy, BucketPurpose...

2. Generating cost allocation tag list...
   Cost allocation tags (6):
   - Project
   - Stage
   - Environment
   - Component
   - Owner
   - CostCenter

3. Generating comprehensive tag documentation...
   ✓ Documentation saved to: docs/TAG_REFERENCE_PRODUCTION.md
   ✓ Documentation size: 12543 characters

4. Generating compliance report...
   ✓ Compliance report saved to: docs/COMPLIANCE_REPORT_PRODUCTION.md
   ✓ Report size: 8234 characters

✓ Documentation generation complete for production!
```

## Additional Resources

- [Tag Configuration](../src/config/tag-config.ts) - Centralized tag configuration
- [TagManager](../src/utils/tag-manager.ts) - Tag management utility
- [TagDocumentationGenerator](../src/utils/tag-documentation-generator.ts) - Documentation generator
- [TagValidator](../src/utils/tag-validator.ts) - Tag validation utility
- [TaggingAspect](../src/aspects/tagging-aspect.ts) - CDK aspect for automatic tagging

## Contributing

When adding new examples:

1. Create a new TypeScript file in this directory
2. Follow the existing code style and structure
3. Add comprehensive comments explaining the example
4. Update this README with usage instructions
5. Test the example thoroughly before committing

## Support

For questions or issues with the tagging utilities, please refer to:
- [AWS Resource Tagging Design Document](../.kiro/specs/aws-resource-tagging/design.md)
- [AWS Resource Tagging Requirements](../.kiro/specs/aws-resource-tagging/requirements.md)
- [Implementation Summary](../TAG_DOCUMENTATION_GENERATOR_IMPLEMENTATION_SUMMARY.md)
