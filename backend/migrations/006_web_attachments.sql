CREATE TABLE web_attachments (
 id UUID PRIMARY KEY,
 organization_id INTEGER NOT NULL REFERENCES organizations(id),
 booking_id INTEGER NOT NULL REFERENCES web_bookings(id) ON DELETE CASCADE,
 uploaded_by INTEGER NOT NULL REFERENCES users(id),
 file_name TEXT NOT NULL,
 mime_type TEXT NOT NULL CHECK(mime_type IN ('application/pdf','image/png','image/jpeg','image/webp')),
 size INTEGER NOT NULL CHECK(size > 0 AND size <= 10485760),
 data BYTEA NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(octet_length(data)=size)
);
CREATE INDEX web_attachments_booking ON web_attachments(organization_id,booking_id);
