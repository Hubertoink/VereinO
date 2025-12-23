import type Database from 'better-sqlite3'
type DB = InstanceType<typeof Database>

type Mig = { version: number; up: string }

export const MIGRATIONS: Mig[] = [
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
      type TEXT CHECK(type IN ('IN','OUT','TRANSFER')) NOT NULL,
      sphere TEXT CHECK(sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')) NOT NULL,
      account_id INTEGER,
      category_id INTEGER,
      project_id INTEGER,
      earmark_id INTEGER,
      description TEXT,
      net_amount NUMERIC NOT NULL DEFAULT 0,
      vat_rate NUMERIC NOT NULL DEFAULT 0,
      vat_amount NUMERIC NOT NULL DEFAULT 0,
      gross_amount NUMERIC NOT NULL DEFAULT 0,
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
    INSERT INTO voucher_budgets (voucher_id, budget_id, amount)
    SELECT id, budget_id, COALESCE(budget_amount, gross_amount)
    FROM vouchers
    WHERE budget_id IS NOT NULL;

    -- Migrate existing earmark assignments to junction table
    INSERT INTO voucher_earmarks (voucher_id, earmark_id, amount)
    SELECT id, earmark_id, COALESCE(earmark_amount, gross_amount)
    FROM vouchers
    WHERE earmark_id IS NOT NULL;
    `
  }
]

export function ensureMigrationsTable(db: DB) {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));`
  ).run()
}

export function getAppliedVersions(db: DB): Set<number> {
  ensureMigrationsTable(db)
  const rows = db.prepare('SELECT version FROM migrations ORDER BY version').all() as {
    version: number
  }[]
  return new Set(rows.map((r) => r.version))
}

export function applyMigrations(db: DB) {
  const applied = getAppliedVersions(db)
  for (const mig of MIGRATIONS) {
    if (applied.has(mig.version)) continue
    
    // Special handling for migration 20 - check if columns already exist
    if (mig.version === 20) {
      try {
        const budgetCols = db.prepare("PRAGMA table_info(budgets)").all() as Array<{ name: string }>
        const hasEnforceInBudgets = budgetCols.some((c: { name: string }) => c.name === 'enforce_time_range')
        
        if (hasEnforceInBudgets) {
          // Columns already exist, just mark migration as applied
          console.log('[Migration 20] Columns already exist, marking as applied')
          db.prepare('INSERT INTO migrations(version) VALUES (?)').run(mig.version)
          continue
        }
      } catch (e) {
        console.warn('[Migration 20] Failed to check if columns exist:', e)
        // If check fails, try to apply migration anyway
      }
    }
    
    try {
      const exec = db.transaction(() => {
        db.exec(mig.up)
        db.prepare('INSERT INTO migrations(version) VALUES (?)').run(mig.version)
      })
      exec()
      console.log(`[Migration ${mig.version}] Applied successfully`)
    } catch (error: any) {
      console.error(`[Migration ${mig.version}] Failed:`, error.message)
      // For migration 20 specifically, try to continue anyway if it's a duplicate column error
      if (mig.version === 20 && error.message?.includes('duplicate column')) {
        console.log('[Migration 20] Column already exists, marking as applied')
        db.prepare('INSERT INTO migrations(version) VALUES (?)').run(mig.version)
      } else {
        throw error
      }
    }
  }
}
