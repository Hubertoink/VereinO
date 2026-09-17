ALTER TABLE web_ai_documents ADD COLUMN analysis_result JSONB;
CREATE INDEX web_ai_documents_pending ON web_ai_documents(organization_id,uploaded_by,created_at)
 WHERE draft_id IS NULL AND booking_id IS NULL;
