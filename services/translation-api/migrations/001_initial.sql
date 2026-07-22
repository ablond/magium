CREATE TABLE IF NOT EXISTS translation_proposals (
  id uuid PRIMARY KEY,
  public_id text NOT NULL UNIQUE,
  status text NOT NULL,
  content_version text NOT NULL,
  locale text NOT NULL,
  chapter_id text NOT NULL,
  scene_id text NOT NULL,
  message_id text NOT NULL,
  target_type text NOT NULL,
  segment_index integer,
  segment_count integer,
  current_text text,
  current_text_hash text NOT NULL,
  source_text_hash text NOT NULL,
  proposed_text text NOT NULL,
  final_text text,
  note text,
  pseudonym text,
  credit_requested boolean NOT NULL DEFAULT false,
  credit_approved boolean NOT NULL DEFAULT false,
  moderator_note text,
  changeset_id uuid,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS translation_proposal_contacts (
  proposal_id uuid PRIMARY KEY REFERENCES translation_proposals(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS translation_email_consents (
  id text PRIMARY KEY,
  email_hmac text NOT NULL,
  token_hash text NOT NULL,
  confirmed_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS translation_changesets (
  id uuid PRIMARY KEY,
  public_id text NOT NULL UNIQUE,
  title text NOT NULL,
  status text NOT NULL,
  branch_name text,
  pull_request_url text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS translation_proposals_status_idx ON translation_proposals(status);
CREATE INDEX IF NOT EXISTS translation_proposals_message_idx ON translation_proposals(locale, chapter_id, message_id);
CREATE INDEX IF NOT EXISTS translation_proposals_changeset_idx ON translation_proposals(changeset_id);
CREATE INDEX IF NOT EXISTS translation_email_consents_email_idx ON translation_email_consents(email_hmac);
CREATE INDEX IF NOT EXISTS translation_email_consents_expires_idx ON translation_email_consents(expires_at);

ALTER TABLE translation_proposals ADD COLUMN IF NOT EXISTS segment_index integer;
ALTER TABLE translation_proposals ADD COLUMN IF NOT EXISTS segment_count integer;
ALTER TABLE translation_proposals ADD COLUMN IF NOT EXISTS current_text text;

CREATE TABLE IF NOT EXISTS user_accounts (
  id uuid PRIMARY KEY,
  username text NOT NULL,
  username_normalized text NOT NULL UNIQUE,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  encryption_salt text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS user_sync_records (
  user_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  record_id text NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  encrypted jsonb,
  PRIMARY KEY (user_id, record_id),
  CHECK ((deleted AND encrypted IS NULL) OR (NOT deleted AND encrypted IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS user_sessions_token_idx ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS user_sessions_expires_idx ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS user_sync_records_updated_idx ON user_sync_records(user_id, updated_at);
