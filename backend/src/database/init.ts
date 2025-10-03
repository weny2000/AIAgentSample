import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseConnection, executeMigration } from './connection.js';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Initialize database with schemas and initial data
 */
export async function initializeDatabase(db: DatabaseConnection): Promise<void> {
  console.log('Initializing database...');

  try {
    // Test connection first
    const isConnected = await db.testConnection();
    if (!isConnected) {
      throw new Error('Database connection test failed');
    }

    console.log('Database connection successful');

    // Execute dependency graph schema
    const dependencyGraphSql = readFileSync(
      join(__dirname, 'schemas', 'dependency-graph.sql'),
      'utf-8'
    );
    await executeMigration(db, dependencyGraphSql, 'dependency-graph-schema');

    // Execute policy management schema
    const policyManagementSql = readFileSync(
      join(__dirname, 'schemas', 'policy-management.sql'),
      'utf-8'
    );
    await executeMigration(db, policyManagementSql, 'policy-management-schema');

    // Insert initial data if needed
    await insertInitialData(db);

    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

/**
 * Insert initial data into the database
 */
async function insertInitialData(db: DatabaseConnection): Promise<void> {
  console.log('Inserting initial data...');

  try {
    await db.transaction(async (client) => {
      // Insert default rule templates
      const defaultRuleTemplates = [
        {
          name: 'ESLint Configuration Check',
          description: 'Validates ESLint configuration and common code quality rules',
          category: 'quality',
          template_json: {
            type: 'static_check',
            tool: 'eslint',
            rules: {
              'no-unused-vars': 'error',
              'no-console': 'warn',
              'prefer-const': 'error',
              'no-var': 'error'
            },
            extensions: ['.js', '.ts', '.jsx', '.tsx']
          },
          parameters: {
            severity_level: {
              type: 'string',
              enum: ['error', 'warn', 'off'],
              default: 'error'
            },
            custom_rules: {
              type: 'object',
              default: {}
            }
          },
          example_usage: {
            severity_level: 'error',
            custom_rules: {
              'max-len': ['error', { code: 120 }]
            }
          },
          created_by: 'system'
        },
        {
          name: 'Security Vulnerability Check',
          description: 'Scans for known security vulnerabilities using Snyk',
          category: 'security',
          template_json: {
            type: 'security_check',
            tool: 'snyk',
            scan_types: ['dependencies', 'code', 'container'],
            severity_threshold: 'medium'
          },
          parameters: {
            severity_threshold: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              default: 'medium'
            },
            exclude_paths: {
              type: 'array',
              items: { type: 'string' },
              default: []
            }
          },
          example_usage: {
            severity_threshold: 'high',
            exclude_paths: ['test/', 'docs/']
          },
          created_by: 'system'
        },
        {
          name: 'CloudFormation Security Check',
          description: 'Validates CloudFormation templates for security best practices',
          category: 'security',
          template_json: {
            type: 'static_check',
            tool: 'cfn-nag',
            rules: {
              'no_wildcard_policies': true,
              'require_ssl_only': true,
              'no_public_read_acl': true,
              'require_mfa_delete': true
            }
          },
          parameters: {
            custom_rules_path: {
              type: 'string',
              default: null
            },
            fail_on_warnings: {
              type: 'boolean',
              default: false
            }
          },
          example_usage: {
            custom_rules_path: './custom-cfn-rules/',
            fail_on_warnings: true
          },
          created_by: 'system'
        }
      ];

      for (const template of defaultRuleTemplates) {
        await client.query(`
          INSERT INTO rule_templates (name, description, category, template_json, parameters, example_usage, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (name) DO NOTHING
        `, [
          template.name,
          template.description,
          template.category,
          JSON.stringify(template.template_json),
          JSON.stringify(template.parameters),
          JSON.stringify(template.example_usage),
          template.created_by
        ]);
      }

      // Insert sample policies for demonstration
      const samplePolicies = [
        {
          name: 'Code Quality Standards',
          description: 'Enforces basic code quality standards across all JavaScript/TypeScript projects',
          policy_json: {
            rules: [
              {
                id: 'eslint-basic',
                template: 'ESLint Configuration Check',
                parameters: {
                  severity_level: 'error',
                  custom_rules: {
                    'max-len': ['error', { code: 120 }],
                    'complexity': ['warn', 10]
                  }
                }
              }
            ],
            threshold: 80
          },
          policy_type: 'static_check',
          severity: 'medium',
          applicable_artifacts: ['javascript', 'typescript'],
          created_by: 'system'
        },
        {
          name: 'Security Baseline',
          description: 'Basic security checks for all artifacts',
          policy_json: {
            rules: [
              {
                id: 'security-scan',
                template: 'Security Vulnerability Check',
                parameters: {
                  severity_threshold: 'medium',
                  exclude_paths: ['test/', 'docs/', 'examples/']
                }
              }
            ],
            threshold: 90
          },
          policy_type: 'security_check',
          severity: 'high',
          applicable_artifacts: ['*'],
          created_by: 'system'
        }
      ];

      for (const policy of samplePolicies) {
        await client.query(`
          INSERT INTO policies (name, description, policy_json, policy_type, severity, applicable_artifacts, created_by, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
          ON CONFLICT (name, version) DO NOTHING
        `, [
          policy.name,
          policy.description,
          JSON.stringify(policy.policy_json),
          policy.policy_type,
          policy.severity,
          policy.applicable_artifacts,
          policy.created_by
        ]);
      }
    });

    console.log('Initial data inserted successfully');
  } catch (error) {
    console.error('Failed to insert initial data:', error);
    throw error;
  }
}

/**
 * Check if database is properly initialized
 */
export async function isDatabaseInitialized(db: DatabaseConnection): Promise<boolean> {
  try {
    // Check if key tables exist
    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('services', 'dependencies', 'policies', 'rule_templates')
    `);

    return tables.length === 4;
  } catch (error) {
    console.error('Failed to check database initialization status:', error);
    return false;
  }
}

/**
 * Get database schema version/status
 */
export async function getDatabaseStatus(db: DatabaseConnection): Promise<{
  isInitialized: boolean;
  tables: string[];
  version: string;
}> {
  try {
    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const tableNames = tables.map(t => t.table_name);
    const isInitialized = await isDatabaseInitialized(db);

    return {
      isInitialized,
      tables: tableNames,
      version: '1.0.0' // Could be stored in a version table in the future
    };
  } catch (error) {
    console.error('Failed to get database status:', error);
    return {
      isInitialized: false,
      tables: [],
      version: 'unknown'
    };
  }
}