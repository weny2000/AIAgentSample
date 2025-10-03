-- Dependency Graph Schema
-- This schema manages service dependencies and cross-team impact analysis

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Services table - represents all services/components in the system
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    team_id VARCHAR(100) NOT NULL,
    repository_url TEXT,
    description TEXT,
    service_type VARCHAR(50), -- 'api', 'database', 'queue', 'frontend', etc.
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'deprecated', 'retired'
    metadata JSONB DEFAULT '{}', -- Additional service metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT services_name_team_unique UNIQUE (name, team_id),
    CONSTRAINT services_status_check CHECK (status IN ('active', 'deprecated', 'retired')),
    CONSTRAINT services_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT services_team_id_not_empty CHECK (LENGTH(TRIM(team_id)) > 0)
);

-- Dependencies table - represents relationships between services
CREATE TABLE IF NOT EXISTS dependencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    target_service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    dependency_type VARCHAR(50) NOT NULL, -- 'api', 'database', 'queue', 'event', 'data'
    criticality VARCHAR(20) NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    description TEXT,
    metadata JSONB DEFAULT '{}', -- Additional dependency metadata (e.g., API endpoints, data flows)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT dependencies_source_target_type_unique UNIQUE (source_service_id, target_service_id, dependency_type),
    CONSTRAINT dependencies_no_self_reference CHECK (source_service_id != target_service_id),
    CONSTRAINT dependencies_criticality_check CHECK (criticality IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT dependencies_type_not_empty CHECK (LENGTH(TRIM(dependency_type)) > 0)
);

-- Impact analysis cache table - stores pre-computed impact analysis results
CREATE TABLE IF NOT EXISTS impact_analysis_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    analysis_type VARCHAR(50) NOT NULL, -- 'downstream', 'upstream', 'full'
    affected_services JSONB NOT NULL, -- Array of affected service IDs with impact details
    risk_level VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'critical'
    stakeholders JSONB DEFAULT '[]', -- Array of stakeholder information
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 hour'),
    
    -- Constraints
    CONSTRAINT impact_cache_service_type_unique UNIQUE (service_id, analysis_type),
    CONSTRAINT impact_cache_risk_level_check CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT impact_cache_expires_after_computed CHECK (expires_at > computed_at)
);

-- Service versions table - tracks service versions for impact analysis
CREATE TABLE IF NOT EXISTS service_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    release_notes TEXT,
    breaking_changes BOOLEAN DEFAULT FALSE,
    deployment_date TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT service_versions_service_version_unique UNIQUE (service_id, version),
    CONSTRAINT service_versions_version_not_empty CHECK (LENGTH(TRIM(version)) > 0)
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_services_team_id ON services(team_id);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(status);
CREATE INDEX IF NOT EXISTS idx_services_service_type ON services(service_type);
CREATE INDEX IF NOT EXISTS idx_services_created_at ON services(created_at);

CREATE INDEX IF NOT EXISTS idx_dependencies_source_service ON dependencies(source_service_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_target_service ON dependencies(target_service_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_type ON dependencies(dependency_type);
CREATE INDEX IF NOT EXISTS idx_dependencies_criticality ON dependencies(criticality);
CREATE INDEX IF NOT EXISTS idx_dependencies_created_at ON dependencies(created_at);

CREATE INDEX IF NOT EXISTS idx_impact_cache_service_id ON impact_analysis_cache(service_id);
CREATE INDEX IF NOT EXISTS idx_impact_cache_expires_at ON impact_analysis_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_impact_cache_computed_at ON impact_analysis_cache(computed_at);

CREATE INDEX IF NOT EXISTS idx_service_versions_service_id ON service_versions(service_id);
CREATE INDEX IF NOT EXISTS idx_service_versions_deployment_date ON service_versions(deployment_date);

-- GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_services_metadata_gin ON services USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_dependencies_metadata_gin ON dependencies USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_impact_cache_affected_services_gin ON impact_analysis_cache USING GIN(affected_services);
CREATE INDEX IF NOT EXISTS idx_impact_cache_stakeholders_gin ON impact_analysis_cache USING GIN(stakeholders);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at timestamps
CREATE TRIGGER update_services_updated_at 
    BEFORE UPDATE ON services 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dependencies_updated_at 
    BEFORE UPDATE ON dependencies 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired impact analysis cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_impact_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM impact_analysis_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- View for service dependency summary
CREATE OR REPLACE VIEW service_dependency_summary AS
SELECT 
    s.id,
    s.name,
    s.team_id,
    s.service_type,
    s.status,
    COUNT(DISTINCT d_out.id) as outgoing_dependencies,
    COUNT(DISTINCT d_in.id) as incoming_dependencies,
    MAX(CASE WHEN d_out.criticality = 'critical' THEN 1 ELSE 0 END) as has_critical_outgoing,
    MAX(CASE WHEN d_in.criticality = 'critical' THEN 1 ELSE 0 END) as has_critical_incoming
FROM services s
LEFT JOIN dependencies d_out ON s.id = d_out.source_service_id
LEFT JOIN dependencies d_in ON s.id = d_in.target_service_id
GROUP BY s.id, s.name, s.team_id, s.service_type, s.status;

-- View for cross-team dependencies
CREATE OR REPLACE VIEW cross_team_dependencies AS
SELECT 
    d.id,
    d.dependency_type,
    d.criticality,
    s_source.name as source_service,
    s_source.team_id as source_team,
    s_target.name as target_service,
    s_target.team_id as target_team,
    d.created_at
FROM dependencies d
JOIN services s_source ON d.source_service_id = s_source.id
JOIN services s_target ON d.target_service_id = s_target.id
WHERE s_source.team_id != s_target.team_id;