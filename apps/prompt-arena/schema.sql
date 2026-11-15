-- Prompt Arena relational persistence model (PostgreSQL 15+)
-- API credentials are never stored here. secret_ref points to an external secret manager.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE workspaces (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, owner_subject TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE workspace_members (
 workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_subject TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','admin','editor','viewer')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,user_subject)
);
CREATE TABLE experiments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name TEXT NOT NULL, objective TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','queued','running','completed','partial','failed','archived')),
 evaluation_rubric JSONB NOT NULL DEFAULT '{}'::jsonb, generation_config JSONB NOT NULL DEFAULT '{}'::jsonb,
 tags TEXT[] NOT NULL DEFAULT '{}', created_by TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE prompt_variants (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
 name TEXT NOT NULL, prompt_text TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 parent_variant_id UUID REFERENCES prompt_variants(id), change_note TEXT, content_sha256 CHAR(64) NOT NULL,
 created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(experiment_id,name,version), UNIQUE(id,experiment_id)
);
CREATE TABLE benchmark_suites (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name TEXT NOT NULL, description TEXT, version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(workspace_id,name,version)
);
CREATE TABLE test_cases (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), suite_id UUID REFERENCES benchmark_suites(id) ON DELETE SET NULL,
 experiment_id UUID REFERENCES experiments(id) ON DELETE CASCADE, name TEXT,
 input_payload JSONB NOT NULL, expected_output JSONB, reference_notes TEXT,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(suite_id IS NOT NULL OR experiment_id IS NOT NULL)
);
CREATE TABLE provider_connections (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 provider TEXT NOT NULL CHECK(provider IN ('openai','anthropic','gemini','custom')),
 display_name TEXT NOT NULL, secret_ref TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT true,
 allowed_models TEXT[] NOT NULL DEFAULT '{}', config JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE experiment_runs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','partial','failed','cancelled')),
 mode TEXT NOT NULL CHECK(mode IN ('live','replay','mock')), manifest JSONB NOT NULL, manifest_sha256 CHAR(64) NOT NULL,
 requested_by TEXT NOT NULL, queued_at TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ,
 completed_at TIMESTAMPTZ, error_summary TEXT
);
CREATE TABLE run_trials (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), run_id UUID NOT NULL REFERENCES experiment_runs(id) ON DELETE CASCADE,
 prompt_variant_id UUID NOT NULL REFERENCES prompt_variants(id) ON DELETE RESTRICT,
 test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE RESTRICT,
 provider_connection_id UUID REFERENCES provider_connections(id) ON DELETE SET NULL,
 provider TEXT NOT NULL, model_name TEXT NOT NULL, repetition INTEGER NOT NULL DEFAULT 1 CHECK(repetition BETWEEN 1 AND 100),
 status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed','timed_out','cancelled')),
 provider_request_id TEXT, latency_ms INTEGER CHECK(latency_ms IS NULL OR latency_ms>=0),
 input_tokens INTEGER, output_tokens INTEGER, estimated_cost NUMERIC(16,8),
 error_code TEXT, error_message TEXT, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(run_id,prompt_variant_id,test_case_id,provider,model_name,repetition)
);
CREATE TABLE trial_outputs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), trial_id UUID NOT NULL UNIQUE REFERENCES run_trials(id) ON DELETE CASCADE,
 output_text TEXT NOT NULL, output_json JSONB, output_sha256 CHAR(64) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE evaluations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), trial_output_id UUID NOT NULL REFERENCES trial_outputs(id) ON DELETE CASCADE,
 evaluator_type TEXT NOT NULL CHECK(evaluator_type IN ('heuristic','reference','llm_judge','human')),
 evaluator_version TEXT NOT NULL, rubric JSONB NOT NULL, dimension_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
 weighted_score NUMERIC(6,2) CHECK(weighted_score IS NULL OR weighted_score BETWEEN 0 AND 100),
 rationale TEXT, evidence JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE human_votes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), experiment_run_id UUID NOT NULL REFERENCES experiment_runs(id) ON DELETE CASCADE,
 trial_output_id UUID NOT NULL REFERENCES trial_outputs(id) ON DELETE CASCADE, voter_subject TEXT NOT NULL,
 preference SMALLINT NOT NULL CHECK(preference IN (-1,1)), notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(experiment_run_id,trial_output_id,voter_subject)
);
CREATE TABLE audit_events (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 actor_subject TEXT NOT NULL, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id UUID,
 metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_experiments_workspace_updated ON experiments(workspace_id,updated_at DESC);
CREATE INDEX idx_prompt_variants_experiment ON prompt_variants(experiment_id,created_at);
CREATE INDEX idx_test_cases_suite ON test_cases(suite_id);
CREATE INDEX idx_runs_experiment_status ON experiment_runs(experiment_id,status,queued_at DESC);
CREATE INDEX idx_trials_run_status ON run_trials(run_id,status);
CREATE INDEX idx_trials_provider_model ON run_trials(provider,model_name,created_at DESC);
CREATE INDEX idx_evaluations_output_created ON evaluations(trial_output_id,created_at DESC);
CREATE INDEX idx_audit_workspace_created ON audit_events(workspace_id,created_at DESC);
-- Production: enforce workspace membership in the API and enable PostgreSQL RLS before multi-tenant use.
-- Provider credentials remain in an external vault; this schema stores secret references only.
