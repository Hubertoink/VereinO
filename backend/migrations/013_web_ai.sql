CREATE TABLE web_ai_settings (
  organization_id INTEGER PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  provider TEXT NOT NULL DEFAULT 'openai' CHECK(provider IN ('openai','minimax','mittwald')),
  model TEXT NOT NULL DEFAULT 'gpt-5.5',
  text_model TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
  encrypted_api_key TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
