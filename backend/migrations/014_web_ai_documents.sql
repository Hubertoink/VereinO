CREATE TABLE web_ai_documents (
 id UUID PRIMARY KEY,
 organization_id INTEGER NOT NULL REFERENCES organizations(id),
 uploaded_by INTEGER NOT NULL REFERENCES users(id),
 file_name TEXT NOT NULL,
 mime_type TEXT NOT NULL CHECK(mime_type IN ('application/pdf','image/png','image/jpeg','image/webp')),
 size INTEGER NOT NULL CHECK(size > 0 AND size <= 10485760),
 data BYTEA NOT NULL,
 draft_id INTEGER UNIQUE REFERENCES web_drafts(id),
 booking_id INTEGER UNIQUE REFERENCES web_bookings(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(octet_length(data)=size)
);
ALTER TABLE web_drafts ADD COLUMN ai_document_id UUID UNIQUE REFERENCES web_ai_documents(id);
