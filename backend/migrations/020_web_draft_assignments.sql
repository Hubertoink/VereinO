ALTER TABLE web_drafts
  ADD COLUMN budget_assignments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN earmark_assignments JSONB NOT NULL DEFAULT '[]'::jsonb;
