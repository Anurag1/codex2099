-- PostgreSQL starting schema for Prompt Arena
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE workspaces (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 name TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE experiments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
 name TEXT NOT NULL, objective TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','queued','running','completed','failed')),
 evaluation_config JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE test_cases (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
 input_payload JSONB NOT NULL, expected_output JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE prompt_variants (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
 name TEXT NOT NULL, prompt_text TEXT NOT NULL,
 parent_variant_id UUID REFERENCES prompt_variants(id),
 version INTEGER NOT NULL DEFAULT 1, tags TEXT[] NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(experiment_id,name,version)
);
CREATE TABLE model_configs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 provider TEXT NOT NULL, model_name TEXT NOT NULL, endpoint_url TEXT,
 secret_ref TEXT, -- reference only; never store plaintext API keys
 config JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE experiment_runs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
 test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
 model_config_id UUID REFERENCES model_configs(id),
 mode TEXT NOT NULL CHECK(mode IN ('mock','live')),
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed')),
 started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, error JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE run_outputs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id UUID NOT NULL REFERENCES experiment_runs(id) ON DELETE CASCADE,
 prompt_variant_id UUID NOT NULL REFERENCES prompt_variants(id) ON DELETE CASCADE,
 output_text TEXT, latency_ms INTEGER, input_tokens INTEGER, output_tokens INTEGER,
 estimated_cost NUMERIC(14,8), provider_request_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(run_id,prompt_variant_id)
);
CREATE TABLE evaluations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 run_output_id UUID NOT NULL REFERENCES run_outputs(id) ON DELETE CASCADE,
 evaluator_type TEXT NOT NULL CHECK(evaluator_type IN ('heuristic','llm_judge','human','reference')),
 rubric JSONB NOT NULL, weighted_score NUMERIC(6,2), rationale TEXT,
 score_provenance TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE human_votes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
 run_output_id UUID NOT NULL REFERENCES run_outputs(id) ON DELETE CASCADE,
 voter_id TEXT, preference INTEGER NOT NULL CHECK(preference IN (-1,1)),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_experiments_workspace_created ON experiments(workspace_id,created_at DESC);
CREATE INDEX idx_variants_experiment ON prompt_variants(experiment_id);
CREATE INDEX idx_runs_experiment_status ON experiment_runs(experiment_id,status);
CREATE INDEX idx_outputs_run ON run_outputs(run_id);
CREATE INDEX idx_evaluations_output ON evaluations(run_output_id);
