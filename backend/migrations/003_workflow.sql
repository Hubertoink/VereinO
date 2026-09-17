-- Isolated web pilot. Desktop SQLite and legacy vouchers require a future explicit import.
CREATE TABLE web_drafts (
 id SERIAL PRIMARY KEY,
 organization_id INTEGER NOT NULL REFERENCES organizations(id),
 created_by INTEGER NOT NULL REFERENCES users(id),
 type TEXT NOT NULL CHECK (type IN ('IN','OUT')),
 date DATE NOT NULL,
 description TEXT NOT NULL,
 gross_amount_cents BIGINT NOT NULL CHECK (gross_amount_cents > 0 AND gross_amount_cents <= 9007199254740991),
 sphere TEXT NOT NULL CHECK (sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')),
 payment_method TEXT NOT NULL CHECK (payment_method IN ('BANK','CASH')),
 counterparty TEXT,
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','RETURNED','APPROVED')),
 review_reason TEXT,
 version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX web_drafts_org_owner ON web_drafts(organization_id, created_by);
CREATE TABLE web_booking_sequences (
 organization_id INTEGER NOT NULL REFERENCES organizations(id),
 year INTEGER NOT NULL,
 last_number INTEGER NOT NULL,
 PRIMARY KEY (organization_id, year)
);
CREATE TABLE web_bookings (
 id SERIAL PRIMARY KEY,
 organization_id INTEGER NOT NULL REFERENCES organizations(id),
 created_by INTEGER NOT NULL REFERENCES users(id),
 source_draft_id INTEGER UNIQUE REFERENCES web_drafts(id),
 number TEXT NOT NULL,
 type TEXT NOT NULL CHECK (type IN ('IN','OUT')),
 date DATE NOT NULL,
 description TEXT NOT NULL,
 gross_amount_cents BIGINT NOT NULL CHECK (gross_amount_cents > 0 AND gross_amount_cents <= 9007199254740991),
 sphere TEXT NOT NULL CHECK (sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')),
 payment_method TEXT NOT NULL CHECK (payment_method IN ('BANK','CASH')),
 counterparty TEXT,
 version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (organization_id, number)
);
