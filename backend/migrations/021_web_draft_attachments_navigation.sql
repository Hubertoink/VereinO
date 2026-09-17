ALTER TABLE web_attachments ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE web_attachments ADD COLUMN draft_id INTEGER REFERENCES web_drafts(id) ON DELETE CASCADE;
UPDATE web_attachments a SET draft_id=b.source_draft_id FROM web_bookings b WHERE a.booking_id=b.id AND b.source_draft_id IS NOT NULL;
CREATE INDEX web_attachments_draft ON web_attachments(organization_id,draft_id);
ALTER TABLE organizations ADD COLUMN visible_nav_items TEXT[];
