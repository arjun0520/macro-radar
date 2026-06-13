CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('running', 'completed', 'failed', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE alert_status AS ENUM ('pending', 'sent', 'skipped', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol varchar(16) NOT NULL,
  name text,
  asset_type varchar(24) NOT NULL DEFAULT 'stock_etf',
  sector text,
  portfolio_weight real,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_watchlist_symbol ON watchlist_items(symbol);
CREATE INDEX IF NOT EXISTS ix_watchlist_active ON watchlist_items(active);

CREATE TABLE IF NOT EXISTS source_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type varchar(32) NOT NULL,
  source_name text NOT NULL,
  external_id text NOT NULL,
  title text NOT NULL,
  url text,
  published_at timestamptz,
  content_hash varchar(64) NOT NULL,
  summary text,
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_source_items_content_hash ON source_items(content_hash);
CREATE INDEX IF NOT EXISTS ix_source_items_source ON source_items(source_type, source_name);
CREATE INDEX IF NOT EXISTS ix_source_items_published_at ON source_items(published_at);

CREATE TABLE IF NOT EXISTS economic_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id uuid REFERENCES source_items(id) ON DELETE SET NULL,
  provider varchar(32) NOT NULL,
  external_id text NOT NULL,
  country text,
  category text,
  event_name text NOT NULL,
  event_date timestamptz,
  actual real,
  previous real,
  consensus real,
  forecast real,
  importance varchar(32),
  impact_score integer,
  surprise_score integer,
  url text,
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_economic_calendar_provider_external ON economic_calendar_events(provider, external_id);
CREATE INDEX IF NOT EXISTS ix_economic_calendar_event_date ON economic_calendar_events(event_date);
CREATE INDEX IF NOT EXISTS ix_economic_calendar_importance ON economic_calendar_events(importance);
CREATE INDEX IF NOT EXISTS ix_economic_calendar_impact_score ON economic_calendar_events(impact_score);

CREATE TABLE IF NOT EXISTS macro_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_id uuid REFERENCES source_items(id) ON DELETE SET NULL,
  fingerprint varchar(64) NOT NULL,
  event_type varchar(40) NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  event_date timestamptz,
  impact_horizon varchar(32) NOT NULL DEFAULT 'days_to_weeks',
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_model_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_macro_events_fingerprint ON macro_events(fingerprint);
CREATE INDEX IF NOT EXISTS ix_macro_events_event_date ON macro_events(event_date);
CREATE INDEX IF NOT EXISTS ix_macro_events_type ON macro_events(event_type);

CREATE TABLE IF NOT EXISTS signal_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES macro_events(id) ON DELETE CASCADE,
  score integer NOT NULL,
  ranking_label varchar(24) NOT NULL,
  reason text NOT NULL,
  directional_suggestion text NOT NULL,
  breakdown jsonb NOT NULL,
  affected_symbols jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_signal_scores_event ON signal_scores(event_id);
CREATE INDEX IF NOT EXISTS ix_signal_scores_score ON signal_scores(score);

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES macro_events(id) ON DELETE CASCADE,
  channel varchar(24) NOT NULL,
  threshold integer NOT NULL,
  status alert_status NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_alert_event_channel ON alerts(event_id, channel);
CREATE INDEX IF NOT EXISTS ix_alert_status ON alerts(status);

CREATE TABLE IF NOT EXISTS signal_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_score_id uuid NOT NULL REFERENCES signal_scores(id) ON DELETE CASCADE,
  rating varchar(32) NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_signal_feedback_score ON signal_feedback(signal_score_id);
CREATE INDEX IF NOT EXISTS ix_signal_feedback_rating ON signal_feedback(rating);

CREATE TABLE IF NOT EXISTS job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type varchar(64) NOT NULL,
  run_key varchar(128) NOT NULL,
  status job_status NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  lock_expires_at timestamptz NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_job_runs_run_key ON job_runs(run_key);
CREATE INDEX IF NOT EXISTS ix_job_runs_status ON job_runs(status);
CREATE INDEX IF NOT EXISTS ix_job_runs_type_started ON job_runs(job_type, started_at);
