CREATE TABLE IF NOT EXISTS web_members (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_no TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','NEW','PAUSED','LEFT')),
  board_role TEXT CHECK (board_role IN ('V1','V2','KASSIER','KASSENPR1','KASSENPR2','SCHRIFT')),
  data JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, member_no),
  UNIQUE (organization_id, board_role)
);
CREATE INDEX IF NOT EXISTS web_members_org_status ON web_members(organization_id,status);
