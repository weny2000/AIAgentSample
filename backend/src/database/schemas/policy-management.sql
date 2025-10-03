-- Policy Management Schema
-- This schema manages organizational policies, rules, and compliance configurations

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Policies table - stores organizational policies and rules
CREATE TABLE IF NOT EXISTS policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    policy_json JSONB NOT NULL, -- The actual policy configuration
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'draft', -- 'draft', 'pending_approval', 'active', 'deprecated', 'archived'
    policy_type VARCHAR(50) NOT NULL, -- 'static_check', 'semantic_check', 'security_check', 'compliance'
    severity VARCHAR(20) NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    applicable_artifacts TEXT[] DEFAULT '{}', -- Array of artifact types this policy applies to
    team_scope TEXT[], -- Array of team IDs this policy applies to (empty = all teams)
    created_by VARCHAR(100) NOT NULL,
    approved_by VARCHAR(100),
    approved_at TIMESTAMP WITH TIME ZONE,
    effective_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    effective_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT policies_name_version_unique UNIQUE (name, version),
    CONSTRAINT policies_status_check CHECK (status IN ('draft', 'pending_approval', 'active', 'deprecated', 'archived')),
    CONSTRAINT policies_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT policies_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT policies_created_by_not_empty CHECK (LENGTH(TRIM(created_by)) > 0),
    CONSTRAINT policies_effective_dates_check CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT policies_approval_consistency CHECK (
        (status IN ('active', 'deprecated', 'archived') AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR
        (status IN ('draft', 'pending_approval') AND (approved_by IS NULL OR approved_at IS NULL))
    )
);

-- Policy approval workflow table - tracks approval process
CREATE TABLE IF NOT EXISTS policy_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    approver_id VARCHAR(100) NOT NULL,
    approval_status VARCHAR(20) NOT NULL, -- 'pending', 'approved', 'rejected', 'changes_requested'
    comments TEXT,
    approval_level INTEGER NOT NULL DEFAULT 1, -- Support for multi-level approval
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT policy_approvals_policy_approver_level_unique UNIQUE (policy_id, approver_id, approval_level),
    CONSTRAINT policy_approvals_status_check CHECK (approval_status IN ('pending', 'approved', 'rejected', 'changes_requested')),
    CONSTRAINT policy_approvals_approver_not_empty CHECK (LENGTH(TRIM(approver_id)) > 0),
    CONSTRAINT policy_approvals_level_positive CHECK (approval_level > 0)
);

-- Rule templates table - reusable rule configurations
CREATE TABLE IF NOT EXISTS rule_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    template_json JSONB NOT NULL, -- Template configuration with placeholders
    category VARCHAR(50) NOT NULL, -- 'security', 'quality', 'compliance', 'performance'
    parameters JSONB DEFAULT '{}', -- Parameter definitions for the template
    example_usage JSONB DEFAULT '{}', -- Example of how to use the template
    created_by VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT rule_templates_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT rule_templates_created_by_not_empty CHECK (LENGTH(TRIM(created_by)) > 0)
);

-- Policy execution history table - tracks policy check results
CREATE TABLE IF NOT EXISTS policy_execution_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    artifact_id VARCHAR(255) NOT NULL, -- Reference to the checked artifact
    artifact_type VARCHAR(50) NOT NULL,
    execution_result VARCHAR(20) NOT NULL, -- 'pass', 'fail', 'warning', 'error'
    score DECIMAL(5,2), -- Compliance score (0-100)
    findings JSONB DEFAULT '[]', -- Array of specific findings/violations
    execution_time_ms INTEGER,
    executed_by VARCHAR(100),
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT policy_execution_result_check CHECK (execution_result IN ('pass', 'fail', 'warning', 'error')),
    CONSTRAINT policy_execution_score_range CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    CONSTRAINT policy_execution_time_positive CHECK (execution_time_ms IS NULL OR execution_time_ms >= 0),
    CONSTRAINT policy_execution_artifact_not_empty CHECK (LENGTH(TRIM(artifact_id)) > 0),
    CONSTRAINT policy_execution_type_not_empty CHECK (LENGTH(TRIM(artifact_type)) > 0)
);

-- Policy conflicts table - tracks conflicts between policies
CREATE TABLE IF NOT EXISTS policy_conflicts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_a_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    policy_b_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    conflict_type VARCHAR(50) NOT NULL, -- 'contradictory', 'overlapping', 'dependency'
    conflict_description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    resolution_status VARCHAR(20) DEFAULT 'unresolved', -- 'unresolved', 'resolved', 'accepted'
    resolution_notes TEXT,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(100),
    
    -- Constraints
    CONSTRAINT policy_conflicts_different_policies CHECK (policy_a_id != policy_b_id),
    CONSTRAINT policy_conflicts_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT policy_conflicts_resolution_check CHECK (resolution_status IN ('unresolved', 'resolved', 'accepted')),
    CONSTRAINT policy_conflicts_resolution_consistency CHECK (
        (resolution_status IN ('resolved', 'accepted') AND resolved_at IS NOT NULL) OR
        (resolution_status = 'unresolved' AND resolved_at IS NULL)
    )
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_policy_type ON policies(policy_type);
CREATE INDEX IF NOT EXISTS idx_policies_severity ON policies(severity);
CREATE INDEX IF NOT EXISTS idx_policies_created_by ON policies(created_by);
CREATE INDEX IF NOT EXISTS idx_policies_approved_by ON policies(approved_by);
CREATE INDEX IF NOT EXISTS idx_policies_effective_from ON policies(effective_from);
CREATE INDEX IF NOT EXISTS idx_policies_effective_until ON policies(effective_until);
CREATE INDEX IF NOT EXISTS idx_policies_created_at ON policies(created_at);

CREATE INDEX IF NOT EXISTS idx_policy_approvals_policy_id ON policy_approvals(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_approvals_approver_id ON policy_approvals(approver_id);
CREATE INDEX IF NOT EXISTS idx_policy_approvals_status ON policy_approvals(approval_status);
CREATE INDEX IF NOT EXISTS idx_policy_approvals_created_at ON policy_approvals(created_at);

CREATE INDEX IF NOT EXISTS idx_rule_templates_category ON rule_templates(category);
CREATE INDEX IF NOT EXISTS idx_rule_templates_is_active ON rule_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_rule_templates_created_by ON rule_templates(created_by);

CREATE INDEX IF NOT EXISTS idx_policy_execution_policy_id ON policy_execution_history(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_execution_artifact_id ON policy_execution_history(artifact_id);
CREATE INDEX IF NOT EXISTS idx_policy_execution_artifact_type ON policy_execution_history(artifact_type);
CREATE INDEX IF NOT EXISTS idx_policy_execution_result ON policy_execution_history(execution_result);
CREATE INDEX IF NOT EXISTS idx_policy_execution_executed_at ON policy_execution_history(executed_at);

CREATE INDEX IF NOT EXISTS idx_policy_conflicts_policy_a ON policy_conflicts(policy_a_id);
CREATE INDEX IF NOT EXISTS idx_policy_conflicts_policy_b ON policy_conflicts(policy_b_id);
CREATE INDEX IF NOT EXISTS idx_policy_conflicts_resolution_status ON policy_conflicts(resolution_status);
CREATE INDEX IF NOT EXISTS idx_policy_conflicts_severity ON policy_conflicts(severity);

-- GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_policies_policy_json_gin ON policies USING GIN(policy_json);
CREATE INDEX IF NOT EXISTS idx_policies_applicable_artifacts_gin ON policies USING GIN(applicable_artifacts);
CREATE INDEX IF NOT EXISTS idx_policies_team_scope_gin ON policies USING GIN(team_scope);
CREATE INDEX IF NOT EXISTS idx_rule_templates_template_json_gin ON rule_templates USING GIN(template_json);
CREATE INDEX IF NOT EXISTS idx_rule_templates_parameters_gin ON rule_templates USING GIN(parameters);
CREATE INDEX IF NOT EXISTS idx_policy_execution_findings_gin ON policy_execution_history USING GIN(findings);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at timestamps
CREATE TRIGGER update_policies_updated_at 
    BEFORE UPDATE ON policies 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_policy_approvals_updated_at 
    BEFORE UPDATE ON policy_approvals 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rule_templates_updated_at 
    BEFORE UPDATE ON rule_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically version policies
CREATE OR REPLACE FUNCTION create_policy_version()
RETURNS TRIGGER AS $$
BEGIN
    -- If this is an update to an existing policy and the policy_json has changed
    IF TG_OP = 'UPDATE' AND OLD.policy_json != NEW.policy_json THEN
        -- Increment version number
        NEW.version = OLD.version + 1;
        -- Reset approval status
        NEW.status = 'draft';
        NEW.approved_by = NULL;
        NEW.approved_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically version policies when policy_json changes
CREATE TRIGGER create_policy_version_trigger
    BEFORE UPDATE ON policies
    FOR EACH ROW EXECUTE FUNCTION create_policy_version();

-- View for active policies
CREATE OR REPLACE VIEW active_policies AS
SELECT 
    p.*,
    CASE 
        WHEN p.effective_until IS NULL THEN TRUE
        WHEN p.effective_until > NOW() THEN TRUE
        ELSE FALSE
    END as is_currently_effective
FROM policies p
WHERE p.status = 'active'
    AND p.effective_from <= NOW()
    AND (p.effective_until IS NULL OR p.effective_until > NOW());

-- View for policy approval status
CREATE OR REPLACE VIEW policy_approval_status AS
SELECT 
    p.id as policy_id,
    p.name,
    p.status,
    COUNT(pa.id) as total_approvals_required,
    COUNT(CASE WHEN pa.approval_status = 'approved' THEN 1 END) as approvals_received,
    COUNT(CASE WHEN pa.approval_status = 'rejected' THEN 1 END) as rejections_received,
    COUNT(CASE WHEN pa.approval_status = 'pending' THEN 1 END) as pending_approvals,
    CASE 
        WHEN COUNT(CASE WHEN pa.approval_status = 'rejected' THEN 1 END) > 0 THEN 'rejected'
        WHEN COUNT(pa.id) = COUNT(CASE WHEN pa.approval_status = 'approved' THEN 1 END) THEN 'fully_approved'
        WHEN COUNT(CASE WHEN pa.approval_status = 'approved' THEN 1 END) > 0 THEN 'partially_approved'
        ELSE 'not_approved'
    END as overall_approval_status
FROM policies p
LEFT JOIN policy_approvals pa ON p.id = pa.policy_id
GROUP BY p.id, p.name, p.status;

-- View for policy execution statistics
CREATE OR REPLACE VIEW policy_execution_stats AS
SELECT 
    p.id as policy_id,
    p.name,
    p.policy_type,
    p.severity,
    COUNT(peh.id) as total_executions,
    COUNT(CASE WHEN peh.execution_result = 'pass' THEN 1 END) as passes,
    COUNT(CASE WHEN peh.execution_result = 'fail' THEN 1 END) as failures,
    COUNT(CASE WHEN peh.execution_result = 'warning' THEN 1 END) as warnings,
    COUNT(CASE WHEN peh.execution_result = 'error' THEN 1 END) as errors,
    ROUND(AVG(peh.score), 2) as average_score,
    ROUND(AVG(peh.execution_time_ms), 2) as average_execution_time_ms
FROM policies p
LEFT JOIN policy_execution_history peh ON p.id = peh.policy_id
WHERE p.status = 'active'
GROUP BY p.id, p.name, p.policy_type, p.severity;