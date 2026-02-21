CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL,
  user_id text NOT NULL,
  device_id text NOT NULL,
  start_time timestamptz NOT NULL,
  state text NOT NULL,
  duration_seconds integer NOT NULL,
  energy_drained_mwh numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
