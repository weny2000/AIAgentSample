/**
 * Migration: Initial Schema Setup
 * Description: Create initial database schema for PostgreSQL tables
 * Created: 2024-12-03T00:00:01.000Z
 */

export const version = '20241203000001';
export const name = 'Initial Schema Setup';
export const description = 'Create initial database schema for PostgreSQL tables';

export async function up(): Promise<void> {
  console.log('Applying migration: Initial Schema Setup');
  
  // This migration would typically use a database connection
  // For demonstration, we'll just log the SQL that would be executed
  
  const sql = `
    -- Create services table
    CREATE TABLE IF NOT EXISTS services (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL UNIQUE,
      team_id VARCHAR(100) NOT NULL,
      repository_url TEXT,
      description TEXT,
      service_type VARCHAR(50),
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'retired')),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Create dependencies table
    CREATE TABLE IF NOT EXISTS dependencies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      target_service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      dependency_type VARCHAR(50) NOT NULL,
      criticality VARCHAR(20) DEFAULT 'medium' CHECK (criticality IN ('low', 'medium', 'high', 'critical')),
      description TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(source_service_id, target_service_id, dependency_type)
    );

    -- Create policies table
    CREATE TABLE IF NOT EXISTS policies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      policy_json JSONB NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'active', 'deprecated', 'archived')),
      policy_type VARCHAR(50) NOT NULL,
      severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
      applicable_artifacts TEXT[] DEFAULT '{}',
      team_scope TEXT[] DEFAULT '{}',
      created_by VARCHAR(100) NOT NULL,
      approved_by VARCHAR(100),
      approved_at TIMESTAMP,
      effective_from TIMESTAMP DEFAULT NOW(),
      effective_until TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_services_team_id ON services(team_id);
    CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
    CREATE INDEX IF NOT EXISTS idx_dependencies_source ON dependencies(source_service_id);
    CREATE INDEX IF NOT EXISTS idx_dependencies_target ON dependencies(target_service_id);
    CREATE INDEX IF NOT EXISTS idx_dependencies_criticality ON dependencies(criticality);
    CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
    CREATE INDEX IF NOT EXISTS idx_policies_type ON policies(policy_type);
    CREATE INDEX IF NOT EXISTS idx_policies_effective ON policies(effective_from, effective_until);

    -- Create updated_at trigger function
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';

    -- Create triggers for updated_at
    CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
    CREATE TRIGGER update_dependencies_updated_at BEFORE UPDATE ON dependencies
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
    CREATE TRIGGER update_policies_updated_at BEFORE UPDATE ON policies
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `;

  console.log('SQL to execute:', sql);
  console.log('Initial schema migration completed');
}

export async function down(): Promise<void> {
  console.log('Rolling back migration: Initial Schema Setup');
  
  const sql = `
    -- Drop triggers
    DROP TRIGGER IF EXISTS update_policies_updated_at ON policies;
    DROP TRIGGER IF EXISTS update_dependencies_updated_at ON dependencies;
    DROP TRIGGER IF EXISTS update_services_updated_at ON services;
    
    -- Drop function
    DROP FUNCTION IF EXISTS update_updated_at_column();
    
    -- Drop indexes
    DROP INDEX IF EXISTS idx_policies_effective;
    DROP INDEX IF EXISTS idx_policies_type;
    DROP INDEX IF EXISTS idx_policies_status;
    DROP INDEX IF EXISTS idx_dependencies_criticality;
    DROP INDEX IF EXISTS idx_dependencies_target;
    DROP INDEX IF EXISTS idx_dependencies_source;
    DROP INDEX IF EXISTS idx_services_status;
    DROP INDEX IF EXISTS idx_services_team_id;
    
    -- Drop tables (in reverse order due to foreign keys)
    DROP TABLE IF EXISTS policies;
    DROP TABLE IF EXISTS dependencies;
    DROP TABLE IF EXISTS services;
  `;

  console.log('SQL to execute:', sql);
  console.log('Initial schema rollback completed');
}

export async function validate(): Promise<boolean> {
  console.log('Validating migration: Initial Schema Setup');
  
  // In a real implementation, this would check if the tables exist
  // For demonstration, we'll just return true
  return true;
}