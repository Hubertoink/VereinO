CREATE TABLE web_organization_profiles (
  organization_id INTEGER PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  profile TEXT NOT NULL DEFAULT 'NONPROFIT' CHECK (profile IN ('NONPROFIT', 'GENERAL')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep the legacy sphere when switching profiles. General categories are an
-- additional classification, so changing mode never rewrites historical data.
ALTER TABLE web_master_data ADD CONSTRAINT web_master_data_org_id_unique UNIQUE (organization_id, id);
ALTER TABLE web_bookings ADD COLUMN primary_classification_value_id INTEGER;
ALTER TABLE web_drafts ADD COLUMN primary_classification_value_id INTEGER;
ALTER TABLE web_bookings ADD CONSTRAINT web_bookings_category_tenant_fk
  FOREIGN KEY (organization_id, primary_classification_value_id)
  REFERENCES web_master_data(organization_id, id);
ALTER TABLE web_drafts ADD CONSTRAINT web_drafts_category_tenant_fk
  FOREIGN KEY (organization_id, primary_classification_value_id)
  REFERENCES web_master_data(organization_id, id);
