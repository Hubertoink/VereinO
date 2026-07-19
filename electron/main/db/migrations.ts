import Database from 'better-sqlite3'
type DB = InstanceType<typeof Database>

type Mig = { version: number; up: string | ((db: DB) => void) }

const MIGRATIONS: Mig[] = [
  {
    version: 1,
    up: `
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT CHECK(role IN ('ADMIN','KASSE','READONLY')) NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY,
      user_id INTEGER,
      entity TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      diff_json TEXT,
      hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      sphere TEXT CHECK(sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')) NOT NULL,
      vat_rate NUMERIC NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      parent_id INTEGER,
      FOREIGN KEY(parent_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      sphere TEXT CHECK(sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')) NOT NULL,
      parent_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(parent_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS earmarks (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      start_date TEXT,
      end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS vouchers (
      id INTEGER PRIMARY KEY,
      year INTEGER NOT NULL,
      seq_no INTEGER NOT NULL,
      voucher_no TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      type TEXT CHECK(type IN ('IN','OUT','TRANSFER','INTERNAL')) NOT NULL,
      sphere TEXT CHECK(sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')) NOT NULL,
      account_id INTEGER,
      category_id INTEGER,
      project_id INTEGER,
      earmark_id INTEGER,
      description TEXT,
      note TEXT,
      net_amount NUMERIC NOT NULL DEFAULT 0,
      vat_rate NUMERIC NOT NULL DEFAULT 0,
      vat_amount NUMERIC NOT NULL DEFAULT 0,
      gross_amount NUMERIC NOT NULL DEFAULT 0,
      amount_mode TEXT CHECK(amount_mode IN ('NET','GROSS')) NOT NULL DEFAULT 'NET',
      payment_method TEXT,
      counterparty TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      locked_at TEXT,
      reversed_by_id INTEGER,
      original_id INTEGER,
      FOREIGN KEY(account_id) REFERENCES accounts(id),
      FOREIGN KEY(category_id) REFERENCES categories(id),
      FOREIGN KEY(project_id) REFERENCES projects(id),
      FOREIGN KEY(earmark_id) REFERENCES earmarks(id),
      FOREIGN KEY(created_by) REFERENCES users(id),
      FOREIGN KEY(reversed_by_id) REFERENCES vouchers(id),
      FOREIGN KEY(original_id) REFERENCES vouchers(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_voucher_seq ON vouchers(year, seq_no);

    CREATE TABLE IF NOT EXISTS voucher_files (
      id INTEGER PRIMARY KEY,
      voucher_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY,
      year INTEGER NOT NULL,
      sphere TEXT CHECK(sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')) NOT NULL,
      category_id INTEGER,
      project_id INTEGER,
      earmark_id INTEGER,
      amount_planned NUMERIC NOT NULL DEFAULT 0,
      FOREIGN KEY(category_id) REFERENCES categories(id),
      FOREIGN KEY(project_id) REFERENCES projects(id),
      FOREIGN KEY(earmark_id) REFERENCES earmarks(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );
    `
  },
  {
    version: 2,
    up: `
      INSERT OR IGNORE INTO users(id, name, role) VALUES (1, 'Admin', 'ADMIN');
      INSERT OR IGNORE INTO settings(key, value_json) VALUES
        ('version', '{"appSchema":2}'),
        ('numbering', '{"perYear":true,"perSphere":true}'),
        ('earmark', '{"allowNegative":false}');
    `
  }
  ,
  {
    version: 3,
    up: `
      CREATE TABLE IF NOT EXISTS voucher_sequences (
        year INTEGER NOT NULL,
        sphere TEXT CHECK(sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')) NOT NULL,
        last_seq_no INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (year, sphere)
      );
      CREATE INDEX IF NOT EXISTS idx_vouchers_sphere_date ON vouchers(sphere, date);
      CREATE INDEX IF NOT EXISTS idx_vouchers_earmark ON vouchers(earmark_id);
    `
  }
  ,
  {
    version: 4,
    up: `
      INSERT OR IGNORE INTO settings(key, value_json) VALUES ('period_lock', '{"closedUntil": null}');
    `
  }
  ,
  {
    version: 5,
    up: `
        CREATE INDEX IF NOT EXISTS idx_vouchers_payment_method ON vouchers(payment_method);
      `
  }
  ,
  {
    version: 6,
    up: `
    -- Switch unique constraint from (year, seq_no) to (year, sphere, seq_no) for per-sphere numbering
    DROP INDEX IF EXISTS idx_voucher_seq;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_voucher_seq_per_sphere ON vouchers(year, sphere, seq_no);
    `
  }
  ,
  {
    version: 7,
    up: `
    -- Ensure unique budgets per dimension for upsert convenience
    CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_unique ON budgets(year, sphere, IFNULL(category_id, -1), IFNULL(project_id, -1), IFNULL(earmark_id, -1));
    -- Helpful indexes for reporting and lookups
    CREATE INDEX IF NOT EXISTS idx_vouchers_earmark_type_date ON vouchers(earmark_id, type, date);
    CREATE INDEX IF NOT EXISTS idx_budgets_earmark ON budgets(earmark_id);
    CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category_id);
    CREATE INDEX IF NOT EXISTS idx_budgets_project ON budgets(project_id);
  `
  }
  ,
  {
    version: 8,
    up: `
    -- Add optional color to earmarks for UI highlighting
    ALTER TABLE earmarks ADD COLUMN color TEXT;
    `
  }
  ,
  {
    version: 9,
    up: `
    -- Tags for vouchers, with optional color
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT
    );

    CREATE TABLE IF NOT EXISTS voucher_tags (
      voucher_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (voucher_id, tag_id),
      FOREIGN KEY(voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
      FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
    CREATE INDEX IF NOT EXISTS idx_voucher_tags_voucher ON voucher_tags(voucher_id);
    CREATE INDEX IF NOT EXISTS idx_voucher_tags_tag ON voucher_tags(tag_id);
    `
  }
  ,
  {
    version: 10,
    up: `
    -- Optional budget linkage for vouchers
    ALTER TABLE vouchers ADD COLUMN budget_id INTEGER;
    CREATE INDEX IF NOT EXISTS idx_vouchers_budget ON vouchers(budget_id);
    `
  }
  ,
  {
    version: 11,
    up: `
    -- Extend budgets with friendly fields and period/color
    ALTER TABLE budgets ADD COLUMN name TEXT;
    ALTER TABLE budgets ADD COLUMN category_name TEXT;
    ALTER TABLE budgets ADD COLUMN project_name TEXT;
    ALTER TABLE budgets ADD COLUMN start_date TEXT;
    ALTER TABLE budgets ADD COLUMN end_date TEXT;
    ALTER TABLE budgets ADD COLUMN color TEXT;
    `
  }
  ,
  {
    version: 12,
    up: `
    -- Allow multiple budgets with same dimensional keys; drop uniqueness index
    DROP INDEX IF EXISTS idx_budgets_unique;
    `
  }
  ,
  {
    version: 13,
    up: `
    -- Add optional budget to earmarks (Zweckbindungen)
    ALTER TABLE earmarks ADD COLUMN budget NUMERIC;
    `
  }
  ,
  {
    version: 14,
    up: `
    -- Transfer direction fields on vouchers
    ALTER TABLE vouchers ADD COLUMN transfer_from TEXT CHECK(transfer_from IN ('BAR','BANK'));
    ALTER TABLE vouchers ADD COLUMN transfer_to TEXT CHECK(transfer_to IN ('BAR','BANK'));
    CREATE INDEX IF NOT EXISTS idx_vouchers_transfer ON vouchers(transfer_from, transfer_to);
    `
  }
  ,
  {
    version: 15,
    up: `
    -- Invoices core
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY,
      date TEXT NOT NULL,
      due_date TEXT,
      invoice_no TEXT,
      party TEXT NOT NULL,
      description TEXT,
      gross_amount NUMERIC NOT NULL,
      payment_method TEXT,
      sphere TEXT CHECK(sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')) NOT NULL,
      earmark_id INTEGER,
      budget_id INTEGER,
      auto_post INTEGER NOT NULL DEFAULT 1,
      voucher_type TEXT CHECK(voucher_type IN ('IN','OUT')) NOT NULL,
      posted_voucher_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      FOREIGN KEY(earmark_id) REFERENCES earmarks(id),
      FOREIGN KEY(budget_id) REFERENCES budgets(id),
      FOREIGN KEY(posted_voucher_id) REFERENCES vouchers(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_payments (
      id INTEGER PRIMARY KEY,
      invoice_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoice_files (
      id INTEGER PRIMARY KEY,
      invoice_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoice_tags (
      invoice_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (invoice_id, tag_id),
      FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_sphere ON invoices(sphere);
    CREATE INDEX IF NOT EXISTS idx_invoices_budget ON invoices(budget_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_tags_invoice ON invoice_tags(invoice_id);
    `
  }
  ,
  {
    version: 16,
    up: `
    -- Members core tables
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY,
      member_no TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      status TEXT CHECK(status IN ('ACTIVE','NEW','PAUSED','LEFT')) NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );

    -- Optional tags for members using shared tags table
    CREATE TABLE IF NOT EXISTS member_tags (
      member_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY(member_id, tag_id),
      FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_members_name ON members(name);
    CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);
    CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
    `
  }
  ,
  {
    version: 17,
    up: `
    -- Members Phase 2: Contribution and SEPA-related fields
    ALTER TABLE members ADD COLUMN iban TEXT;
    ALTER TABLE members ADD COLUMN bic TEXT;
    ALTER TABLE members ADD COLUMN contribution_amount NUMERIC; -- EUR amount (gross)
    ALTER TABLE members ADD COLUMN contribution_interval TEXT CHECK(contribution_interval IN ('MONTHLY','QUARTERLY','YEARLY'));
    ALTER TABLE members ADD COLUMN mandate_ref TEXT; -- SEPA mandate reference
    ALTER TABLE members ADD COLUMN mandate_date TEXT; -- date when mandate signed
    ALTER TABLE members ADD COLUMN join_date TEXT;
    ALTER TABLE members ADD COLUMN leave_date TEXT;
    ALTER TABLE members ADD COLUMN notes TEXT;
    ALTER TABLE members ADD COLUMN next_due_date TEXT;
    `
  }
  ,
  {
    version: 18,
    up: `
    -- Membership payments tracking (manual assignment by Kassier)
    CREATE TABLE IF NOT EXISTS membership_payments (
      id INTEGER PRIMARY KEY,
      member_id INTEGER NOT NULL,
      period_key TEXT NOT NULL, -- 'YYYY-MM' | 'YYYY-Q1..Q4' | 'YYYY'
      interval TEXT CHECK(interval IN ('MONTHLY','QUARTERLY','YEARLY')) NOT NULL,
      amount NUMERIC NOT NULL,
      date_paid TEXT NOT NULL DEFAULT (date('now')),
      voucher_id INTEGER,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY(voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL,
      UNIQUE(member_id, period_key)
    );

    CREATE INDEX IF NOT EXISTS idx_mp_member_period ON membership_payments(member_id, period_key);
    CREATE INDEX IF NOT EXISTS idx_mp_voucher ON membership_payments(voucher_id);
    `
  }
  ,
  {
    version: 19,
    up: `
    -- Board function for members (optional)
    ALTER TABLE members ADD COLUMN board_role TEXT CHECK(board_role IN ('V1','V2','KASSIER','KASSENPR1','KASSENPR2','SCHRIFT'));
    `
  }
  ,
  {
    version: 20,
    up: `
    -- Optional strict time range enforcement for budgets and earmarks
    -- Check if column exists before adding (SQLite doesn't have IF NOT EXISTS for ALTER TABLE ADD COLUMN)
    -- This is handled by checking table_info in code, but we add it here as fallback
    ALTER TABLE budgets ADD COLUMN enforce_time_range INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE earmarks ADD COLUMN enforce_time_range INTEGER NOT NULL DEFAULT 0;
    `
  },
  {
    version: 21,
    up: `
    -- Submissions: Vouchers submitted by members for review by the treasurer
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY,
      external_id TEXT,
      date TEXT NOT NULL,
      type TEXT CHECK(type IN ('IN','OUT')) NOT NULL DEFAULT 'OUT',
      description TEXT,
      gross_amount NUMERIC NOT NULL DEFAULT 0,
      category_hint TEXT,
      counterparty TEXT,
      submitted_by TEXT NOT NULL,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT CHECK(status IN ('pending','approved','rejected')) NOT NULL DEFAULT 'pending',
      reviewed_at TEXT,
      reviewer_notes TEXT,
      voucher_id INTEGER,
      FOREIGN KEY(voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS submission_attachments (
      id INTEGER PRIMARY KEY,
      submission_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT,
      data BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(submission_id) REFERENCES submissions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
    CREATE INDEX IF NOT EXISTS idx_submissions_date ON submissions(date);
    CREATE INDEX IF NOT EXISTS idx_submission_attachments_submission ON submission_attachments(submission_id);
    `
  },
  {
    version: 22,
    up: `
    -- Add sphere and payment_method to submissions
    ALTER TABLE submissions ADD COLUMN sphere TEXT CHECK(sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB'));
    ALTER TABLE submissions ADD COLUMN payment_method TEXT CHECK(payment_method IN ('BAR','BANK'));
    `
  },
  {
    version: 23,
    up: `
    -- Add partial budget/earmark amount columns to vouchers
    -- When NULL, the full gross_amount is used
    ALTER TABLE vouchers ADD COLUMN budget_amount REAL;
    ALTER TABLE vouchers ADD COLUMN earmark_amount REAL;
    `
  },
  {
    version: 24,
    up: `
    -- Junction tables for multiple budgets/earmarks per voucher
    CREATE TABLE IF NOT EXISTS voucher_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
      budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(voucher_id, budget_id)
    );
    CREATE INDEX IF NOT EXISTS idx_voucher_budgets_voucher ON voucher_budgets(voucher_id);
    CREATE INDEX IF NOT EXISTS idx_voucher_budgets_budget ON voucher_budgets(budget_id);

    CREATE TABLE IF NOT EXISTS voucher_earmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
      earmark_id INTEGER NOT NULL REFERENCES earmarks(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(voucher_id, earmark_id)
    );
    CREATE INDEX IF NOT EXISTS idx_voucher_earmarks_voucher ON voucher_earmarks(voucher_id);
    CREATE INDEX IF NOT EXISTS idx_voucher_earmarks_earmark ON voucher_earmarks(earmark_id);

    -- Migrate existing budget assignments to junction table
    INSERT OR IGNORE INTO voucher_budgets (voucher_id, budget_id, amount)
    SELECT id, budget_id, COALESCE(budget_amount, gross_amount)
    FROM vouchers
    WHERE budget_id IS NOT NULL;

    -- Migrate existing earmark assignments to junction table
    INSERT OR IGNORE INTO voucher_earmarks (voucher_id, earmark_id, amount)
    SELECT id, earmark_id, COALESCE(earmark_amount, gross_amount)
    FROM vouchers
    WHERE earmark_id IS NOT NULL;
    `
  }
  ,
  {
    version: 25,
    up: `
    -- Budgets: allow archiving instead of deleting
    ALTER TABLE budgets ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS idx_budgets_archived ON budgets(is_archived);
    `
  },
  {
    version: 26,
    up: `
    -- Cash checks (Kassenprüfung) records for audit trail + PDF reports
    CREATE TABLE IF NOT EXISTS cash_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      date TEXT NOT NULL,
      soll REAL NOT NULL,
      ist REAL NOT NULL,
      diff REAL NOT NULL,
      voucher_id INTEGER,
      budget_id INTEGER,
      note TEXT,
      inspector1_member_id INTEGER,
      inspector1_name TEXT,
      inspector2_member_id INTEGER,
      inspector2_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL,
      FOREIGN KEY(budget_id) REFERENCES budgets(id) ON DELETE SET NULL,
      FOREIGN KEY(inspector1_member_id) REFERENCES members(id) ON DELETE SET NULL,
      FOREIGN KEY(inspector2_member_id) REFERENCES members(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cash_checks_year_date ON cash_checks(year, date);
    CREATE INDEX IF NOT EXISTS idx_cash_checks_voucher ON cash_checks(voucher_id);
    `
  },
  {
    version: 27,
    up: `
    -- Activity reports (Taetigkeitsbericht) for tax office year-end review
    CREATE TABLE IF NOT EXISTS activity_reports (
      fiscal_year INTEGER PRIMARY KEY,
      activities TEXT NOT NULL DEFAULT '',
      purpose_impact TEXT NOT NULL DEFAULT '',
      target_groups TEXT NOT NULL DEFAULT '',
      volunteer_work TEXT NOT NULL DEFAULT '',
      highlights TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_activity_reports_updated_at ON activity_reports(updated_at);
    `
  },
  {
    version: 28,
    up: `
    -- Member advances / Vorschuesse
    CREATE TABLE IF NOT EXISTS member_advances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      recipient_name TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      budget_id INTEGER,
      earmark_id INTEGER,
      placeholder_voucher_id INTEGER,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE SET NULL,
      FOREIGN KEY(budget_id) REFERENCES budgets(id) ON DELETE SET NULL,
      FOREIGN KEY(earmark_id) REFERENCES earmarks(id) ON DELETE SET NULL,
      FOREIGN KEY(placeholder_voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_member_advances_member ON member_advances(member_id);
    CREATE INDEX IF NOT EXISTS idx_member_advances_issued_at ON member_advances(issued_at);
    CREATE INDEX IF NOT EXISTS idx_member_advances_resolved_at ON member_advances(resolved_at);
    CREATE INDEX IF NOT EXISTS idx_member_advances_placeholder_voucher ON member_advances(placeholder_voucher_id);

    CREATE TABLE IF NOT EXISTS member_advance_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      advance_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('IN','OUT')),
      sphere TEXT NOT NULL CHECK(sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')),
      description TEXT,
      net_amount REAL NOT NULL DEFAULT 0,
      gross_amount REAL NOT NULL DEFAULT 0,
      vat_rate REAL NOT NULL DEFAULT 0,
      payment_method TEXT CHECK(payment_method IN ('BAR','BANK')),
      payment_account_id INTEGER REFERENCES payment_accounts(id),
      category_id INTEGER,
      project_id INTEGER,
      budgets_json TEXT NOT NULL DEFAULT '[]',
      earmarks_json TEXT NOT NULL DEFAULT '[]',
      tags_json TEXT NOT NULL DEFAULT '[]',
      files_json TEXT NOT NULL DEFAULT '[]',
      voucher_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(advance_id) REFERENCES member_advances(id) ON DELETE CASCADE,
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL,
      FOREIGN KEY(voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_member_advance_purchases_advance ON member_advance_purchases(advance_id);
    CREATE INDEX IF NOT EXISTS idx_member_advance_purchases_date ON member_advance_purchases(date);
    CREATE INDEX IF NOT EXISTS idx_member_advance_purchases_voucher ON member_advance_purchases(voucher_id);
    CREATE INDEX IF NOT EXISTS idx_member_advance_purchases_payment_account ON member_advance_purchases(payment_account_id);

    CREATE TABLE IF NOT EXISTS member_advance_settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      advance_id INTEGER NOT NULL,
      settled_at TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT,
      voucher_id INTEGER,
      invoice_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(advance_id) REFERENCES member_advances(id) ON DELETE CASCADE,
      FOREIGN KEY(voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_member_advance_settlements_advance ON member_advance_settlements(advance_id);
    CREATE INDEX IF NOT EXISTS idx_member_advance_settlements_settled_at ON member_advance_settlements(settled_at);
    CREATE INDEX IF NOT EXISTS idx_member_advance_settlements_voucher ON member_advance_settlements(voucher_id);
    CREATE INDEX IF NOT EXISTS idx_member_advance_settlements_invoice ON member_advance_settlements(invoice_id);
    `
  },
  {
    version: 29,
    up: `
    -- Persist whether vouchers were entered as net or gross amounts
    ALTER TABLE vouchers ADD COLUMN amount_mode TEXT CHECK(amount_mode IN ('NET','GROSS')) NOT NULL DEFAULT 'NET';
    UPDATE vouchers
    SET amount_mode = CASE
      WHEN IFNULL(net_amount, 0) = 0 AND IFNULL(gross_amount, 0) <> 0 THEN 'GROSS'
      ELSE 'NET'
    END
    WHERE amount_mode IS NULL OR amount_mode = '';
    `
  },
  {
    version: 30,
    up: `
    -- Submissions: member-proposed budget, earmark, and tags from the web form
    ALTER TABLE submissions ADD COLUMN budget_id INTEGER;
    ALTER TABLE submissions ADD COLUMN budget_label TEXT;
    ALTER TABLE submissions ADD COLUMN earmark_id INTEGER;
    ALTER TABLE submissions ADD COLUMN earmark_label TEXT;
    ALTER TABLE submissions ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
    CREATE INDEX IF NOT EXISTS idx_submissions_budget ON submissions(budget_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_earmark ON submissions(earmark_id);
    `
  },
  {
    version: 31,
    up: `
    -- Reversal vouchers store positive amounts; the opposite flow is represented by IN/OUT.
    UPDATE vouchers
    SET net_amount = ABS(IFNULL(net_amount, 0)),
        vat_amount = ABS(IFNULL(vat_amount, 0)),
        gross_amount = ABS(IFNULL(gross_amount, 0)),
        earmark_amount = CASE WHEN earmark_amount IS NULL THEN NULL ELSE ABS(earmark_amount) END,
        budget_amount = CASE WHEN budget_amount IS NULL THEN NULL ELSE ABS(budget_amount) END
    WHERE original_id IS NOT NULL;

    UPDATE voucher_budgets
    SET amount = ABS(IFNULL(amount, 0))
    WHERE voucher_id IN (SELECT id FROM vouchers WHERE original_id IS NOT NULL);

    UPDATE voucher_earmarks
    SET amount = ABS(IFNULL(amount, 0))
    WHERE voucher_id IN (SELECT id FROM vouchers WHERE original_id IS NOT NULL);

    UPDATE vouchers
    SET payment_method = (
      SELECT original.payment_method
      FROM vouchers original
      WHERE original.id = vouchers.original_id
    )
    WHERE original_id IS NOT NULL
      AND type IN ('IN', 'OUT')
      AND payment_method IS NULL;

    UPDATE vouchers
    SET transfer_from = (
          SELECT original.transfer_to
          FROM vouchers original
          WHERE original.id = vouchers.original_id
        ),
        transfer_to = (
          SELECT original.transfer_from
          FROM vouchers original
          WHERE original.id = vouchers.original_id
        )
    WHERE original_id IS NOT NULL
      AND type = 'TRANSFER'
      AND (transfer_from IS NULL OR transfer_to IS NULL);
    `
  },
  {
    version: 32,
    up: (db: DB) => {
      ensureInternalVoucherType(db)
    }
  },
  {
    version: 33,
    up: (db: DB) => {
      ensureBankImportTables(db)
    }
  },
  {
    version: 34,
    up: (db: DB) => {
      ensureAdvanceTables(db)
    }
  },
  {
    version: 35,
    up: `
    -- Optional comment on invoices / liabilities.
    ALTER TABLE invoices ADD COLUMN note TEXT;
    `
  },
  {
    version: 36,
    up: (db: DB) => {
      ensureJournalPerformanceIndexes(db)
    }
  },
  {
    version: 37,
    up: (db: DB) => {
      ensurePartyTables(db)
    }
  },
  {
    version: 38,
    up: (db: DB) => {
      ensureRecurringBookingTables(db)
    }
  },
  {
    version: 39,
    up: (db: DB) => {
      ensureRecurringBookingTables(db)
    }
  }
]

export function ensureRecurringBookingTables(db: DB) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recurring_bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT CHECK(type IN ('IN','OUT')) NOT NULL,
      sphere TEXT CHECK(sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')) NOT NULL,
      description TEXT,
      note TEXT,
      counterparty TEXT,
      amount_mode TEXT CHECK(amount_mode IN ('NET','GROSS')) NOT NULL DEFAULT 'GROSS',
      amount NUMERIC NOT NULL,
      variable_amount INTEGER NOT NULL DEFAULT 0,
      vat_rate NUMERIC NOT NULL DEFAULT 0,
      payment_account_id INTEGER REFERENCES payment_accounts(id) ON DELETE SET NULL,
      budget_id INTEGER REFERENCES budgets(id) ON DELETE SET NULL,
      earmark_id INTEGER REFERENCES earmarks(id) ON DELETE SET NULL,
      budget_assignments_json TEXT NOT NULL DEFAULT '[]',
      earmark_assignments_json TEXT NOT NULL DEFAULT '[]',
      tags_json TEXT NOT NULL DEFAULT '[]',
      frequency TEXT CHECK(frequency IN ('WEEKLY','MONTHLY','QUARTERLY','YEARLY')) NOT NULL,
      anchor_day INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      next_due_date TEXT NOT NULL,
      end_date TEXT,
      status TEXT CHECK(status IN ('ACTIVE','PAUSED','ENDED')) NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_recurring_bookings_status_due
      ON recurring_bookings(status, next_due_date);

    CREATE TABLE IF NOT EXISTS recurring_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recurring_booking_id INTEGER NOT NULL REFERENCES recurring_bookings(id) ON DELETE CASCADE,
      scheduled_date TEXT NOT NULL,
      status TEXT CHECK(status IN ('DUE','BOOKED','SKIPPED')) NOT NULL DEFAULT 'DUE',
      voucher_id INTEGER REFERENCES vouchers(id) ON DELETE SET NULL,
      booked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      UNIQUE(recurring_booking_id, scheduled_date)
    );
    CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_due
      ON recurring_occurrences(status, scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_booking
      ON recurring_occurrences(recurring_booking_id, status, scheduled_date);
  `)
  const columns = db.prepare('PRAGMA table_info(recurring_bookings)').all() as Array<{ name: string }>
  if (!columns.some((column) => column.name === 'anchor_day')) {
    db.exec(`ALTER TABLE recurring_bookings ADD COLUMN anchor_day INTEGER NOT NULL DEFAULT 1;`)
    db.exec(`UPDATE recurring_bookings SET anchor_day=CAST(substr(start_date, 9, 2) AS INTEGER);`)
  }
  if (!columns.some((column) => column.name === 'budget_assignments_json')) {
    db.exec(`ALTER TABLE recurring_bookings ADD COLUMN budget_assignments_json TEXT NOT NULL DEFAULT '[]';`)
  }
  if (!columns.some((column) => column.name === 'earmark_assignments_json')) {
    db.exec(`ALTER TABLE recurring_bookings ADD COLUMN earmark_assignments_json TEXT NOT NULL DEFAULT '[]';`)
  }
}

export function ensurePartyTables(db: DB) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS parties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      legal_name TEXT,
      role TEXT CHECK(role IN ('SUPPLIER','CUSTOMER','BOTH','OTHER')) NOT NULL DEFAULT 'BOTH',
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      street TEXT,
      postal_code TEXT,
      city TEXT,
      country TEXT NOT NULL DEFAULT 'DE',
      iban TEXT,
      bic TEXT,
      tax_number TEXT,
      vat_id TEXT,
      payment_term_days INTEGER,
      note TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_parties_name ON parties(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_parties_iban ON parties(iban);
    CREATE INDEX IF NOT EXISTS idx_parties_active_role ON parties(is_active, role);
  `)

  const ensurePartyColumn = (table: string) => {
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(table)
    if (!exists) return
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    if (!columns.some((column) => column.name === 'party_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL;`)
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_party ON ${table}(party_id);`)
  }

  ensurePartyColumn('vouchers')
  ensurePartyColumn('invoices')
  ensurePartyColumn('submissions')
}

export function ensureJournalPerformanceIndexes(db: DB) {
  db.exec(`
    -- Journal pagination and its most common filters/sorts.
    CREATE INDEX IF NOT EXISTS idx_vouchers_date_id
      ON vouchers(date, id);
    CREATE INDEX IF NOT EXISTS idx_vouchers_type_date_id
      ON vouchers(type, date, id);
    CREATE INDEX IF NOT EXISTS idx_vouchers_payment_account_date_id
      ON vouchers(payment_account_id, date, id);
    CREATE INDEX IF NOT EXISTS idx_vouchers_earmark_date_id
      ON vouchers(earmark_id, date, id);

    -- Avoid a complete file-table scan for every Journal/Invoice row.
    CREATE INDEX IF NOT EXISTS idx_voucher_files_voucher
      ON voucher_files(voucher_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_files_invoice
      ON invoice_files(invoice_id);
  `)
}

function ensureMigrationsTable(db: DB) {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));`
  ).run()
}

export function ensureVoucherJunctionTables(db: DB) {
  // Defensive schema heal for legacy DBs where migration 24 didn't run.
  // Keep this idempotent and safe to run on every startup.
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS voucher_budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
        budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
        amount REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(voucher_id, budget_id)
      );
      CREATE INDEX IF NOT EXISTS idx_voucher_budgets_voucher ON voucher_budgets(voucher_id);
      CREATE INDEX IF NOT EXISTS idx_voucher_budgets_budget ON voucher_budgets(budget_id);

      CREATE TABLE IF NOT EXISTS voucher_earmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
        earmark_id INTEGER NOT NULL REFERENCES earmarks(id) ON DELETE CASCADE,
        amount REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(voucher_id, earmark_id)
      );
      CREATE INDEX IF NOT EXISTS idx_voucher_earmarks_voucher ON voucher_earmarks(voucher_id);
      CREATE INDEX IF NOT EXISTS idx_voucher_earmarks_earmark ON voucher_earmarks(earmark_id);
    `)
  } catch (e) {
    // If base tables are missing, migrations will handle it later.
    return
  }

  // Best-effort backfill from legacy single-assignment columns.
  // Do not throw: table presence is more important than full backfill.
  try {
    const voucherCols = db.prepare("PRAGMA table_info(vouchers)").all() as Array<{ name: string }>
    const hasBudgetAmount = voucherCols.some((c) => c.name === 'budget_amount')
    const hasEarmarkAmount = voucherCols.some((c) => c.name === 'earmark_amount')
    const hasGrossAmount = voucherCols.some((c) => c.name === 'gross_amount')

    const budgetAmountExpr = hasGrossAmount
      ? (hasBudgetAmount ? 'COALESCE(budget_amount, gross_amount)' : 'gross_amount')
      : '0'
    const earmarkAmountExpr = hasGrossAmount
      ? (hasEarmarkAmount ? 'COALESCE(earmark_amount, gross_amount)' : 'gross_amount')
      : '0'

    try {
      db.exec(`
        INSERT OR IGNORE INTO voucher_budgets (voucher_id, budget_id, amount)
        SELECT id, budget_id, ${budgetAmountExpr}
        FROM vouchers
        WHERE budget_id IS NOT NULL;
      `)
    } catch { /* ignore */ }

    try {
      db.exec(`
        INSERT OR IGNORE INTO voucher_earmarks (voucher_id, earmark_id, amount)
        SELECT id, earmark_id, ${earmarkAmountExpr}
        FROM vouchers
        WHERE earmark_id IS NOT NULL;
      `)
    } catch { /* ignore */ }
  } catch {
    // ignore
  }
}

export function ensureActivityReportsTable(db: DB) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS activity_reports (
        fiscal_year INTEGER PRIMARY KEY,
        activities TEXT NOT NULL DEFAULT '',
        purpose_impact TEXT NOT NULL DEFAULT '',
        target_groups TEXT NOT NULL DEFAULT '',
        volunteer_work TEXT NOT NULL DEFAULT '',
        highlights TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_activity_reports_updated_at ON activity_reports(updated_at);
    `)
  } catch {
    return
  }
}

export function ensureAdvanceTables(db: DB) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS member_advances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id INTEGER,
        recipient_name TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        amount REAL NOT NULL,
        notes TEXT,
        budget_id INTEGER,
        earmark_id INTEGER,
        placeholder_voucher_id INTEGER,
        resolved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE SET NULL,
        FOREIGN KEY(budget_id) REFERENCES budgets(id) ON DELETE SET NULL,
        FOREIGN KEY(earmark_id) REFERENCES earmarks(id) ON DELETE SET NULL,
        FOREIGN KEY(placeholder_voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_member_advances_member ON member_advances(member_id);
      CREATE INDEX IF NOT EXISTS idx_member_advances_issued_at ON member_advances(issued_at);
      CREATE INDEX IF NOT EXISTS idx_member_advances_resolved_at ON member_advances(resolved_at);
      CREATE INDEX IF NOT EXISTS idx_member_advances_placeholder_voucher ON member_advances(placeholder_voucher_id);

      CREATE TABLE IF NOT EXISTS member_advance_purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        advance_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('IN','OUT')),
        sphere TEXT NOT NULL CHECK(sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')),
        description TEXT,
        net_amount REAL NOT NULL DEFAULT 0,
        gross_amount REAL NOT NULL DEFAULT 0,
        vat_rate REAL NOT NULL DEFAULT 0,
        payment_method TEXT CHECK(payment_method IN ('BAR','BANK')),
        payment_account_id INTEGER REFERENCES payment_accounts(id),
        category_id INTEGER,
        project_id INTEGER,
        budgets_json TEXT NOT NULL DEFAULT '[]',
        earmarks_json TEXT NOT NULL DEFAULT '[]',
        tags_json TEXT NOT NULL DEFAULT '[]',
        files_json TEXT NOT NULL DEFAULT '[]',
        voucher_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(advance_id) REFERENCES member_advances(id) ON DELETE CASCADE,
        FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL,
        FOREIGN KEY(voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_member_advance_purchases_advance ON member_advance_purchases(advance_id);
      CREATE INDEX IF NOT EXISTS idx_member_advance_purchases_date ON member_advance_purchases(date);
      CREATE INDEX IF NOT EXISTS idx_member_advance_purchases_voucher ON member_advance_purchases(voucher_id);
      CREATE INDEX IF NOT EXISTS idx_member_advance_purchases_payment_account ON member_advance_purchases(payment_account_id);

      CREATE TABLE IF NOT EXISTS member_advance_settlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        advance_id INTEGER NOT NULL,
        settled_at TEXT NOT NULL,
        amount REAL NOT NULL,
        note TEXT,
        voucher_id INTEGER,
        invoice_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(advance_id) REFERENCES member_advances(id) ON DELETE CASCADE,
        FOREIGN KEY(voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL,
        FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_member_advance_settlements_advance ON member_advance_settlements(advance_id);
      CREATE INDEX IF NOT EXISTS idx_member_advance_settlements_settled_at ON member_advance_settlements(settled_at);
      CREATE INDEX IF NOT EXISTS idx_member_advance_settlements_voucher ON member_advance_settlements(voucher_id);
      CREATE INDEX IF NOT EXISTS idx_member_advance_settlements_invoice ON member_advance_settlements(invoice_id);
    `)
  } catch {
    return
  }

  try {
    const purchaseCols = db.prepare('PRAGMA table_info(member_advance_purchases)').all() as Array<{ name: string }>
    const purchaseNames = new Set(purchaseCols.map((col) => col.name))
    if (!purchaseNames.has('payment_account_id')) {
      db.exec('ALTER TABLE member_advance_purchases ADD COLUMN payment_account_id INTEGER REFERENCES payment_accounts(id);')
    }
    db.exec('CREATE INDEX IF NOT EXISTS idx_member_advance_purchases_payment_account ON member_advance_purchases(payment_account_id);')
  } catch {
    return
  }
}

function ensureSubmissionColumns(db: DB) {
  try {
    const submissionCols = db.prepare('PRAGMA table_info(submissions)').all() as Array<{ name: string }>
    const names = new Set(submissionCols.map((col) => col.name))

    if (!names.has('budget_id')) db.exec('ALTER TABLE submissions ADD COLUMN budget_id INTEGER;')
    if (!names.has('budget_label')) db.exec('ALTER TABLE submissions ADD COLUMN budget_label TEXT;')
    if (!names.has('earmark_id')) db.exec('ALTER TABLE submissions ADD COLUMN earmark_id INTEGER;')
    if (!names.has('earmark_label')) db.exec('ALTER TABLE submissions ADD COLUMN earmark_label TEXT;')
    if (!names.has('tags_json')) db.exec("ALTER TABLE submissions ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';")

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_submissions_budget ON submissions(budget_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_earmark ON submissions(earmark_id);
    `)
  } catch {
    return
  }
}

function ensurePaymentAccountTables(db: DB) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_accounts (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        kind TEXT CHECK(kind IN ('CASH','BANK','PAYPAL','CARD','OTHER')) NOT NULL,
        iban TEXT,
        color TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_payment_accounts_kind ON payment_accounts(kind);
      CREATE INDEX IF NOT EXISTS idx_payment_accounts_active ON payment_accounts(is_active, sort_order, name);
    `)

    const paymentAccountCount = db.prepare('SELECT COUNT(*) as count FROM payment_accounts').get() as { count?: number } | undefined
    if (Number(paymentAccountCount?.count || 0) === 0) {
      const defaults = [
        { name: 'Bar', kind: 'CASH', sortOrder: 1 },
        { name: 'Bank', kind: 'BANK', sortOrder: 2 },
      ]
      const insertDefault = db.prepare(`
        INSERT OR IGNORE INTO payment_accounts(name, kind, sort_order, is_active)
        VALUES (?, ?, ?, 1)
      `)
      for (const entry of defaults) {
        insertDefault.run(entry.name, entry.kind, entry.sortOrder)
      }
    }

    db.exec(`
      UPDATE payment_accounts
      SET name = 'Bar', sort_order = CASE WHEN sort_order <= 0 OR sort_order = 10 THEN 1 ELSE sort_order END
      WHERE kind = 'CASH' AND name = 'Barkasse' AND NOT EXISTS (SELECT 1 FROM payment_accounts WHERE name = 'Bar');

      UPDATE payment_accounts
      SET name = 'Bank', sort_order = CASE WHEN sort_order <= 0 OR sort_order = 20 THEN 2 ELSE sort_order END
      WHERE kind = 'BANK' AND name = 'Bankkonto' AND NOT EXISTS (SELECT 1 FROM payment_accounts WHERE name = 'Bank');
    `)

    const voucherCols = db.prepare('PRAGMA table_info(vouchers)').all() as Array<{ name: string }>
    const voucherNames = new Set(voucherCols.map((col) => col.name))
    if (!voucherNames.has('payment_account_id')) db.exec('ALTER TABLE vouchers ADD COLUMN payment_account_id INTEGER;')
    if (!voucherNames.has('transfer_from_account_id')) db.exec('ALTER TABLE vouchers ADD COLUMN transfer_from_account_id INTEGER;')
    if (!voucherNames.has('transfer_to_account_id')) db.exec('ALTER TABLE vouchers ADD COLUMN transfer_to_account_id INTEGER;')

    const submissionCols = db.prepare('PRAGMA table_info(submissions)').all() as Array<{ name: string }>
    const submissionNames = new Set(submissionCols.map((col) => col.name))
    if (!submissionNames.has('payment_account_id')) db.exec('ALTER TABLE submissions ADD COLUMN payment_account_id INTEGER;')

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_vouchers_payment_account ON vouchers(payment_account_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_transfer_accounts ON vouchers(transfer_from_account_id, transfer_to_account_id);
      CREATE INDEX IF NOT EXISTS idx_submissions_payment_account ON submissions(payment_account_id);
    `)

    db.exec(`
      UPDATE vouchers
      SET payment_account_id = (
        CASE payment_method
          WHEN 'BAR' THEN (SELECT id FROM payment_accounts WHERE kind = 'CASH' ORDER BY sort_order, id LIMIT 1)
          WHEN 'BANK' THEN (SELECT id FROM payment_accounts WHERE kind = 'BANK' ORDER BY sort_order, id LIMIT 1)
          ELSE payment_account_id
        END
      )
      WHERE payment_account_id IS NULL AND type <> 'TRANSFER';

      UPDATE vouchers
      SET transfer_from_account_id = (
        CASE transfer_from
          WHEN 'BAR' THEN (SELECT id FROM payment_accounts WHERE kind = 'CASH' ORDER BY sort_order, id LIMIT 1)
          WHEN 'BANK' THEN (SELECT id FROM payment_accounts WHERE kind = 'BANK' ORDER BY sort_order, id LIMIT 1)
          ELSE transfer_from_account_id
        END
      )
      WHERE transfer_from_account_id IS NULL AND type = 'TRANSFER';

      UPDATE vouchers
      SET transfer_to_account_id = (
        CASE transfer_to
          WHEN 'BAR' THEN (SELECT id FROM payment_accounts WHERE kind = 'CASH' ORDER BY sort_order, id LIMIT 1)
          WHEN 'BANK' THEN (SELECT id FROM payment_accounts WHERE kind = 'BANK' ORDER BY sort_order, id LIMIT 1)
          ELSE transfer_to_account_id
        END
      )
      WHERE transfer_to_account_id IS NULL AND type = 'TRANSFER';

      UPDATE submissions
      SET payment_account_id = (
        CASE payment_method
          WHEN 'BAR' THEN (SELECT id FROM payment_accounts WHERE kind = 'CASH' ORDER BY sort_order, id LIMIT 1)
          WHEN 'BANK' THEN (SELECT id FROM payment_accounts WHERE kind = 'BANK' ORDER BY sort_order, id LIMIT 1)
          ELSE payment_account_id
        END
      )
      WHERE payment_account_id IS NULL;
    `)
  } catch {
    return
  }
}

export function ensureBankImportTables(db: DB) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS bank_import_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        format TEXT NOT NULL CHECK(format IN ('CAMT', 'CSV')),
        file_hash TEXT NOT NULL,
        payment_account_id INTEGER NOT NULL REFERENCES payment_accounts(id),
        imported_count INTEGER NOT NULL DEFAULT 0,
        duplicate_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS bank_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id INTEGER NOT NULL REFERENCES bank_import_batches(id) ON DELETE CASCADE,
        payment_account_id INTEGER NOT NULL REFERENCES payment_accounts(id),
        booking_date TEXT NOT NULL,
        value_date TEXT,
        direction TEXT NOT NULL CHECK(direction IN ('IN', 'OUT')),
        amount REAL NOT NULL CHECK(amount > 0),
        currency TEXT NOT NULL DEFAULT 'EUR',
        counterparty TEXT,
        counterparty_iban TEXT,
        purpose TEXT,
        end_to_end_id TEXT,
        bank_reference TEXT,
        raw_json TEXT NOT NULL DEFAULT '{}',
        fingerprint TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'LINKED', 'CHECKED')),
        voucher_id INTEGER UNIQUE REFERENCES vouchers(id) ON DELETE SET NULL,
        link_origin TEXT CHECK(link_origin IN ('EXISTING', 'CREATED')),
        checked_note TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_bank_transactions_status_date
        ON bank_transactions(status, booking_date DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_date
        ON bank_transactions(payment_account_id, booking_date DESC);
      CREATE INDEX IF NOT EXISTS idx_bank_transactions_batch
        ON bank_transactions(batch_id);

      DROP TRIGGER IF EXISTS trg_bank_transactions_voucher_deleted;
      CREATE TRIGGER trg_bank_transactions_voucher_deleted
      BEFORE DELETE ON vouchers
      BEGIN
        UPDATE bank_transactions
        SET status = 'OPEN',
            voucher_id = NULL,
            link_origin = NULL,
            resolved_at = NULL,
            updated_at = datetime('now')
        WHERE voucher_id = OLD.id;
      END;
    `)
  } catch {
    // Base tables may not exist before the regular migrations run.
  }
}

export function ensureAiTables(db: DB) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('BOOKING_FROM_DOCUMENTS', 'MEMBER_TEXT', 'REPORT_TEXT')),
        status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'QUEUED', 'PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'FAILED')),
        title TEXT,
        prompt TEXT,
        model TEXT,
        usage_json TEXT,
        error TEXT,
        voucher_id INTEGER REFERENCES vouchers(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        processed_at TEXT,
        approved_at TEXT
      );

      CREATE TABLE IF NOT EXISTS ai_job_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        mime_type TEXT,
        size INTEGER NOT NULL DEFAULT 0,
        data BLOB NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ai_job_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('BOOKING_CANDIDATE', 'TEXT_DRAFT')),
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ai_jobs_status_created ON ai_jobs(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_job_files_job ON ai_job_files(job_id);
      CREATE INDEX IF NOT EXISTS idx_ai_job_results_job ON ai_job_results(job_id);

      CREATE TABLE IF NOT EXISTS ai_agent_sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        summary TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'ARCHIVED')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ai_agent_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES ai_agent_sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool', 'system')),
        kind TEXT NOT NULL,
        content TEXT,
        tool_name TEXT,
        payload_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ai_agent_sessions_updated ON ai_agent_sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_agent_events_session_created ON ai_agent_events(session_id, created_at ASC, id ASC);

      CREATE TABLE IF NOT EXISTS ai_agent_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL DEFAULT 'ORG' CHECK(scope IN ('ORG', 'USER', 'SESSION')),
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        source TEXT,
        confidence REAL NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(scope, key)
      );

      CREATE TABLE IF NOT EXISTS ai_agent_auto_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        draft_kind TEXT NOT NULL,
        conditions_json TEXT NOT NULL DEFAULT '{}',
        action TEXT NOT NULL DEFAULT 'AUTO_PRESELECT' CHECK(action IN ('AUTO_PRESELECT', 'AUTO_APPLY_SAFE')),
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ai_agent_memory_active_scope ON ai_agent_memory(is_active, scope, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_agent_auto_rules_enabled_kind ON ai_agent_auto_rules(enabled, draft_kind);
    `)
    try { db.prepare('ALTER TABLE ai_jobs ADD COLUMN usage_json TEXT').run() } catch { }
  } catch {
    // Base tables may not exist before the regular migrations run.
  }
}

export function ensureInvoiceTables(db: DB) {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY,
        date TEXT NOT NULL,
        due_date TEXT,
        invoice_no TEXT,
        party TEXT NOT NULL,
        description TEXT,
        note TEXT,
        gross_amount NUMERIC NOT NULL,
        payment_method TEXT,
        sphere TEXT CHECK(sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')) NOT NULL,
        earmark_id INTEGER,
        budget_id INTEGER,
        payment_account_id INTEGER,
        auto_post INTEGER NOT NULL DEFAULT 1,
        voucher_type TEXT CHECK(voucher_type IN ('IN','OUT')) NOT NULL,
        posted_voucher_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS invoice_payments (
        id INTEGER PRIMARY KEY,
        invoice_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS invoice_files (
        id INTEGER PRIMARY KEY,
        invoice_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        mime_type TEXT,
        size INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS invoice_tags (
        invoice_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (invoice_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS invoice_budgets (
        id INTEGER PRIMARY KEY,
        invoice_id INTEGER NOT NULL,
        budget_id INTEGER NOT NULL,
        amount NUMERIC NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS invoice_earmarks (
        id INTEGER PRIMARY KEY,
        invoice_id INTEGER NOT NULL,
        earmark_id INTEGER NOT NULL,
        amount NUMERIC NOT NULL DEFAULT 0
      );
    `)

    const invoiceCols = db.prepare('PRAGMA table_info(invoices)').all() as Array<{ name: string }>
    const invoiceNames = new Set(invoiceCols.map((col) => col.name))
    if (!invoiceNames.has('payment_account_id')) db.exec('ALTER TABLE invoices ADD COLUMN payment_account_id INTEGER;')
    if (!invoiceNames.has('note')) db.exec('ALTER TABLE invoices ADD COLUMN note TEXT;')

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date);
      CREATE INDEX IF NOT EXISTS idx_invoices_sphere ON invoices(sphere);
      CREATE INDEX IF NOT EXISTS idx_invoices_budget ON invoices(budget_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_payment_account ON invoices(payment_account_id);
      CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_invoice_tags_invoice ON invoice_tags(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_invoice_budgets_invoice ON invoice_budgets(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_invoice_budgets_budget ON invoice_budgets(budget_id);
      CREATE INDEX IF NOT EXISTS idx_invoice_earmarks_invoice ON invoice_earmarks(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_invoice_earmarks_earmark ON invoice_earmarks(earmark_id);
    `)
  } catch {
    return
  }
}

export function ensureVoucherColumns(db: DB) {
  try {
    const voucherCols = db.prepare('PRAGMA table_info(vouchers)').all() as Array<{ name: string }>
    const names = new Set(voucherCols.map((col) => col.name))

    if (!names.has('budget_id')) {
      db.exec('ALTER TABLE vouchers ADD COLUMN budget_id INTEGER;')
    }
    if (!names.has('transfer_from')) {
      db.exec("ALTER TABLE vouchers ADD COLUMN transfer_from TEXT CHECK(transfer_from IN ('BAR','BANK'));")
    }
    if (!names.has('transfer_to')) {
      db.exec("ALTER TABLE vouchers ADD COLUMN transfer_to TEXT CHECK(transfer_to IN ('BAR','BANK'));")
    }
    if (!names.has('budget_amount')) {
      db.exec('ALTER TABLE vouchers ADD COLUMN budget_amount REAL;')
    }
    if (!names.has('earmark_amount')) {
      db.exec('ALTER TABLE vouchers ADD COLUMN earmark_amount REAL;')
    }
    if (!names.has('amount_mode')) {
      db.exec("ALTER TABLE vouchers ADD COLUMN amount_mode TEXT CHECK(amount_mode IN ('NET','GROSS')) NOT NULL DEFAULT 'NET';")
    }
    if (!names.has('payment_account_id')) {
      db.exec('ALTER TABLE vouchers ADD COLUMN payment_account_id INTEGER;')
    }
    if (!names.has('transfer_from_account_id')) {
      db.exec('ALTER TABLE vouchers ADD COLUMN transfer_from_account_id INTEGER;')
    }
    if (!names.has('transfer_to_account_id')) {
      db.exec('ALTER TABLE vouchers ADD COLUMN transfer_to_account_id INTEGER;')
    }
    if (!names.has('note')) {
      db.exec('ALTER TABLE vouchers ADD COLUMN note TEXT;')
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_vouchers_budget ON vouchers(budget_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_transfer ON vouchers(transfer_from, transfer_to);
      CREATE INDEX IF NOT EXISTS idx_vouchers_payment_account ON vouchers(payment_account_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_transfer_accounts ON vouchers(transfer_from_account_id, transfer_to_account_id);
    `)

    db.exec(`
      UPDATE vouchers
      SET amount_mode = CASE
        WHEN IFNULL(net_amount, 0) = 0 AND IFNULL(gross_amount, 0) <> 0 THEN 'GROSS'
        ELSE 'NET'
      END
      WHERE amount_mode IS NULL OR amount_mode = '';
    `)
  } catch {
    return
  }
}

export function expandVoucherTypeConstraint(sql: string): string {
  return sql.replace(
    /CHECK\s*\(\s*type\s+IN\s*\(\s*'IN'\s*,\s*'OUT'\s*(?:,\s*'TRANSFER')?\s*\)\s*\)/i,
    "CHECK(type IN ('IN','OUT','TRANSFER','INTERNAL'))"
  )
}

function ensureInternalVoucherType(db: DB) {
  try {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='vouchers'").get() as { sql?: string } | undefined
    const sql = row?.sql || ''
    if (!sql || sql.includes("'INTERNAL'")) return

    const nextSql = expandVoucherTypeConstraint(sql)
    if (nextSql === sql) return

    const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='vouchers' AND sql IS NOT NULL").all() as Array<{ sql: string }>

    db.exec('PRAGMA foreign_keys = OFF;')
    db.exec('BEGIN;')
    db.exec('ALTER TABLE vouchers RENAME TO vouchers_old;')
    db.exec(nextSql)
    db.exec('INSERT INTO vouchers SELECT * FROM vouchers_old;')
    db.exec('DROP TABLE vouchers_old;')

    for (const index of indexes) {
      db.exec(index.sql)
    }

    db.exec('COMMIT;')
    db.exec('PRAGMA foreign_keys = ON;')
  } catch (error) {
    try { db.exec('ROLLBACK;') } catch { /* ignore */ }
    try { db.exec('PRAGMA foreign_keys = ON;') } catch { /* ignore */ }
    console.warn('[ensureInternalVoucherType] Failed to rebuild vouchers schema:', error)
  }
}

function quoteIdentifier(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`
}

function rebuildTableWithSql(db: DB, tableName: string, createSql: string) {
  const tempName = `__repair_${tableName}`
  const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name = ? AND sql IS NOT NULL").all(tableName) as Array<{ sql: string }>
  const triggers = db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND tbl_name = ? AND sql IS NOT NULL").all(tableName) as Array<{ sql: string }>
  const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as Array<{ name: string }>
  const columnList = columns.map((column) => quoteIdentifier(column.name)).join(', ')

  db.exec(`ALTER TABLE ${quoteIdentifier(tableName)} RENAME TO ${quoteIdentifier(tempName)};`)
  db.exec(createSql)
  if (columnList) {
    db.exec(`INSERT INTO ${quoteIdentifier(tableName)} (${columnList}) SELECT ${columnList} FROM ${quoteIdentifier(tempName)};`)
  }
  db.exec(`DROP TABLE ${quoteIdentifier(tempName)};`)

  for (const index of indexes) db.exec(index.sql)
  for (const trigger of triggers) db.exec(trigger.sql)
}

export function ensureVoucherForeignKeyTargets(db: DB) {
  try {
    const rows = db.prepare(`
      SELECT name, sql
      FROM sqlite_master
      WHERE type='table'
        AND name NOT LIKE 'sqlite_%'
        AND sql LIKE '%vouchers_old%'
    `).all() as Array<{ name: string; sql: string }>
    if (!rows.length) return

    db.exec('PRAGMA foreign_keys = OFF;')
    db.exec('BEGIN;')
    for (const row of rows) {
      const fixedSql = String(row.sql).replace(/vouchers_old/g, 'vouchers')
      rebuildTableWithSql(db, row.name, fixedSql)
    }
    db.exec('COMMIT;')
    db.exec('PRAGMA foreign_keys = ON;')
  } catch (error) {
    try { db.exec('ROLLBACK;') } catch { /* ignore */ }
    try { db.exec('PRAGMA foreign_keys = ON;') } catch { /* ignore */ }
    console.warn('[ensureVoucherForeignKeyTargets] Failed to repair voucher foreign keys:', error)
  }
}

function getAppliedVersions(db: DB): Set<number> {
  ensureMigrationsTable(db)
  const rows = db.prepare('SELECT version FROM migrations ORDER BY version').all() as {
    version: number
  }[]
  return new Set(rows.map((r) => r.version))
}

export function applyMigrations(db: DB) {
  // Ensure critical junction tables exist even if migrations are partially applied.
  ensurePaymentAccountTables(db)
  ensureVoucherColumns(db)
  ensureInternalVoucherType(db)
  ensureVoucherForeignKeyTargets(db)
  ensureVoucherJunctionTables(db)
  ensureActivityReportsTable(db)
  ensureAdvanceTables(db)
  ensureSubmissionColumns(db)
  ensureBankImportTables(db)
  ensurePartyTables(db)
  ensureRecurringBookingTables(db)

  const applied = getAppliedVersions(db)
  let migrationApplied = false
  for (const mig of MIGRATIONS) {
    if (applied.has(mig.version)) continue

    // Special handling for migration 20 - check if columns already exist
    if (mig.version === 20 || mig.version === 29 || mig.version === 30) {
      try {
        if (mig.version === 20) {
          const budgetCols = db.prepare("PRAGMA table_info(budgets)").all() as Array<{ name: string }>
          const hasEnforceInBudgets = budgetCols.some((c: { name: string }) => c.name === 'enforce_time_range')

          if (hasEnforceInBudgets) {
            console.log('[Migration 20] Columns already exist, marking as applied')
            db.prepare('INSERT INTO migrations(version) VALUES (?)').run(mig.version)
            continue
          }
        }

        if (mig.version === 29) {
          const voucherCols = db.prepare("PRAGMA table_info(vouchers)").all() as Array<{ name: string }>
          const hasAmountMode = voucherCols.some((c: { name: string }) => c.name === 'amount_mode')

          if (hasAmountMode) {
            console.log('[Migration 29] Column already exists, marking as applied')
            db.prepare('INSERT INTO migrations(version) VALUES (?)').run(mig.version)
            continue
          }
        }

        if (mig.version === 30) {
          const submissionCols = db.prepare("PRAGMA table_info(submissions)").all() as Array<{ name: string }>
          const hasSubmissionTags = submissionCols.some((c: { name: string }) => c.name === 'tags_json')

          if (hasSubmissionTags) {
            console.log('[Migration 30] Columns already exist, marking as applied')
            db.prepare('INSERT INTO migrations(version) VALUES (?)').run(mig.version)
            continue
          }
        }
      } catch (e) {
        console.warn(`[Migration ${mig.version}] Failed to check if columns exist:`, e)
      }
    }

    try {
      const exec = db.transaction(() => {
        if (typeof mig.up === 'function') {
          mig.up(db)
        } else {
          db.exec(mig.up)
        }
        db.prepare('INSERT INTO migrations(version) VALUES (?)').run(mig.version)
      })
      exec()
      migrationApplied = true
      console.log(`[Migration ${mig.version}] Applied successfully`)
    } catch (error: any) {
      console.error(`[Migration ${mig.version}] Failed:`, error.message)
      // For migration 20 specifically, try to continue anyway if it's a duplicate column error
      if ((mig.version === 20 || mig.version === 29 || mig.version === 30) && error.message?.includes('duplicate column')) {
        console.log(`[Migration ${mig.version}] Column already exists, marking as applied`)
        db.prepare('INSERT INTO migrations(version) VALUES (?)').run(mig.version)
      } else {
        throw error
      }
    }
  }

  // A brand-new or upgraded database may not have had the base tables required
  // by the pre-flight healers. A database that was already current must not pay
  // for a second complete schema scan on every startup.
  if (migrationApplied) {
    ensurePaymentAccountTables(db)
    ensureVoucherColumns(db)
    ensureInternalVoucherType(db)
    ensureVoucherForeignKeyTargets(db)
    ensureVoucherJunctionTables(db)
    ensureActivityReportsTable(db)
    ensureAdvanceTables(db)
    ensureSubmissionColumns(db)
    ensureBankImportTables(db)
    ensurePartyTables(db)
    ensureRecurringBookingTables(db)
  }
}
