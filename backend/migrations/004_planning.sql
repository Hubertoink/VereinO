CREATE TABLE web_budgets (
 id SERIAL PRIMARY KEY,
 organization_id INTEGER NOT NULL REFERENCES organizations(id),
 name TEXT NOT NULL,
 year INTEGER NOT NULL CHECK(year BETWEEN 1900 AND 9999),
 sphere TEXT NOT NULL CHECK(sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')),
 amount_planned_cents BIGINT NOT NULL CHECK(amount_planned_cents >= 0 AND amount_planned_cents <= 9007199254740991),
 category_name TEXT, project_name TEXT,
 start_date DATE, end_date DATE, color TEXT,
 is_archived BOOLEAN NOT NULL DEFAULT false,
 enforce_time_range BOOLEAN NOT NULL DEFAULT false,
 version INTEGER NOT NULL DEFAULT 1,
 CHECK(start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);
CREATE INDEX web_budgets_org ON web_budgets(organization_id);
CREATE TABLE web_earmarks (
 id SERIAL PRIMARY KEY,
 organization_id INTEGER NOT NULL REFERENCES organizations(id),
 code TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
 budget_cents BIGINT CHECK(budget_cents >= 0 AND budget_cents <= 9007199254740991),
 start_date DATE, end_date DATE, color TEXT,
 is_active BOOLEAN NOT NULL DEFAULT true,
 enforce_time_range BOOLEAN NOT NULL DEFAULT false,
 version INTEGER NOT NULL DEFAULT 1,
 UNIQUE(organization_id,code),
 CHECK(start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);
CREATE TABLE web_booking_budget_assignments (
 booking_id INTEGER NOT NULL REFERENCES web_bookings(id) ON DELETE CASCADE,
 budget_id INTEGER NOT NULL REFERENCES web_budgets(id),
 amount_cents BIGINT NOT NULL CHECK(amount_cents > 0 AND amount_cents <= 9007199254740991),
 PRIMARY KEY(booking_id,budget_id)
);
CREATE TABLE web_booking_earmark_assignments (
 booking_id INTEGER NOT NULL REFERENCES web_bookings(id) ON DELETE CASCADE,
 earmark_id INTEGER NOT NULL REFERENCES web_earmarks(id),
 amount_cents BIGINT NOT NULL CHECK(amount_cents > 0 AND amount_cents <= 9007199254740991),
 PRIMARY KEY(booking_id,earmark_id)
);
