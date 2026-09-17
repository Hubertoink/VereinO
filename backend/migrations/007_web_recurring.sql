CREATE TABLE web_recurring (
 id SERIAL PRIMARY KEY,
 organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 data JSONB NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ACTIVE','PAUSED','ENDED')) DEFAULT 'ACTIVE',
 next_due_date DATE NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX web_recurring_org_due ON web_recurring(organization_id,status,next_due_date);
CREATE TABLE web_recurring_occurrences (
 id SERIAL PRIMARY KEY,
 recurring_id INTEGER NOT NULL REFERENCES web_recurring(id) ON DELETE CASCADE,
 due_date DATE NOT NULL,
 booking_id INTEGER REFERENCES web_bookings(id) ON DELETE RESTRICT,
 action TEXT NOT NULL CHECK(action IN ('BOOK','SKIP')),
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(recurring_id,due_date)
);
