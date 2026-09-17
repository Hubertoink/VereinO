CREATE TABLE web_bank_imports (
 id SERIAL PRIMARY KEY,
 organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 file_name TEXT NOT NULL,
 imported INTEGER NOT NULL DEFAULT 0,
 duplicates INTEGER NOT NULL DEFAULT 0,
 errors INTEGER NOT NULL DEFAULT 0,
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE web_bank_transactions (
 id SERIAL PRIMARY KEY,
 organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 batch_id INTEGER NOT NULL REFERENCES web_bank_imports(id),
 fingerprint TEXT NOT NULL,
 data JSONB NOT NULL,
 booking_date DATE NOT NULL,
 gross_amount_cents BIGINT NOT NULL CHECK(gross_amount_cents>0),
 direction TEXT NOT NULL CHECK(direction IN ('IN','OUT')),
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','LINKED')),
 booking_id INTEGER UNIQUE REFERENCES web_bookings(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(organization_id,fingerprint)
);
CREATE INDEX web_bank_transactions_org_status ON web_bank_transactions(organization_id,status,booking_date);
