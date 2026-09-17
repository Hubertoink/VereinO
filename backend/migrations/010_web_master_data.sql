ALTER TABLE organizations ADD COLUMN settings_data JSONB NOT NULL DEFAULT '{}';
CREATE TABLE web_master_data (
 id SERIAL PRIMARY KEY,
 organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('accounts','categories','parties','tags')),
 name TEXT NOT NULL,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 data JSONB NOT NULL DEFAULT '{}',
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX web_master_data_org_kind ON web_master_data(organization_id,kind,is_active);
CREATE UNIQUE INDEX web_master_data_unique_name ON web_master_data(organization_id,kind,lower(name)) WHERE kind<>'parties';
