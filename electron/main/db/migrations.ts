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

    -- Migrate existing budget assignments to junction table.
    -- Guard against legacy inconsistent data where vouchers.budget_id points
    -- to a non-existing budget, which would otherwise fail FK checks.
    INSERT OR IGNORE INTO voucher_budgets (voucher_id, budget_id, amount)
    SELECT v.id, v.budget_id, COALESCE(v.budget_amount, v.gross_amount)
    FROM vouchers v
    INNER JOIN budgets b ON b.id = v.budget_id
    WHERE v.budget_id IS NOT NULL;

    -- Migrate existing earmark assignments to junction table.
    -- Guard against legacy inconsistent data where vouchers.earmark_id points
    -- to a non-existing earmark, which would otherwise fail FK checks.
    INSERT OR IGNORE INTO voucher_earmarks (voucher_id, earmark_id, amount)
    SELECT v.id, v.earmark_id, COALESCE(v.earmark_amount, v.gross_amount)
    FROM vouchers v
    INNER JOIN earmarks e ON e.id = v.earmark_id
    WHERE v.earmark_id IS NOT NULL;
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
  }
  ,
  {
    version: 27,
    up: `
    -- Vorschüsse an Mitglieder/Personen + Auflösungen
    CREATE TABLE IF NOT EXISTS member_advances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER,
      recipient_name TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      budget_id INTEGER,
      earmark_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE SET NULL,
      FOREIGN KEY(budget_id) REFERENCES budgets(id) ON DELETE SET NULL,
      FOREIGN KEY(earmark_id) REFERENCES earmarks(id) ON DELETE SET NULL
    );

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

    CREATE INDEX IF NOT EXISTS idx_member_advances_member ON member_advances(member_id);
    CREATE INDEX IF NOT EXISTS idx_member_advances_issued ON member_advances(issued_at);
    CREATE INDEX IF NOT EXISTS idx_member_advance_settlements_advance ON member_advance_settlements(advance_id);
    CREATE INDEX IF NOT EXISTS idx_member_advance_settlements_settled ON member_advance_settlements(settled_at);
    `
  }
  ,
  {
    version: 28,
    up: `
    -- Vorschüsse: Platzhalter-Beleg + Buchungen (Entwürfe) + Auflösen-Status
    ALTER TABLE member_advances ADD COLUMN placeholder_voucher_id INTEGER;
    ALTER TABLE member_advances ADD COLUMN resolved_at TEXT;

    CREATE TABLE IF NOT EXISTS member_advance_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      advance_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      type TEXT CHECK(type IN ('IN','OUT')) NOT NULL DEFAULT 'OUT',
      sphere TEXT CHECK(sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')) NOT NULL DEFAULT 'IDEELL',
      description TEXT,
      net_amount NUMERIC NOT NULL DEFAULT 0,
      gross_amount NUMERIC NOT NULL DEFAULT 0,
      vat_rate NUMERIC NOT NULL DEFAULT 0,
      payment_method TEXT,
      category_id INTEGER,
      project_id INTEGER,
      budgets_json TEXT,
      earmarks_json TEXT,
      tags_json TEXT,
      files_json TEXT,
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
    `
  }
  ,
  {
    version: 29,
    up: `
    -- Legacy-Fix: Bei Brutto-Buchungen mit 0% USt wurde netto teils als 0 gespeichert.
    -- Für diese Datensätze netto auf brutto setzen (USt bleibt 0).
    UPDATE vouchers
    SET net_amount = gross_amount
    WHERE gross_amount <> 0
      AND IFNULL(net_amount, 0) = 0
      AND IFNULL(vat_rate, 0) = 0
      AND IFNULL(vat_amount, 0) = 0;
    `
  }
  ,
  {
    version: 30,
    up: `
    -- Persistierter Eingabe-Modus für Buchungen (damit Bearbeiten-Modus stabil bleibt)
    ALTER TABLE vouchers ADD COLUMN amount_mode TEXT CHECK(amount_mode IN ('NET','GROSS')) NOT NULL DEFAULT 'NET';

    -- Backfill-Heuristik für Bestandsdaten:
    -- 0% USt + netto==brutto => historisch typischer Brutto-Flow
    UPDATE vouchers
    SET amount_mode = 'GROSS'
    WHERE IFNULL(vat_rate, 0) = 0
      AND IFNULL(vat_amount, 0) = 0
      AND ABS(IFNULL(net_amount, 0) - IFNULL(gross_amount, 0)) < 0.000001;
    `
  }
]

export function ensureMigrationsTable(db: DB) {
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

function ensureBudgetColumns(db: DB) {
  try {
    const budgetCols = db.prepare("PRAGMA table_info(budgets)").all() as Array<{ name: string }>
    const names = new Set(budgetCols.map((c) => c.name))

    if (!names.has('is_archived')) {
      db.exec('ALTER TABLE budgets ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;')
    }
    if (!names.has('enforce_time_range')) {
      db.exec('ALTER TABLE budgets ADD COLUMN enforce_time_range INTEGER NOT NULL DEFAULT 0;')
    }

    db.exec('CREATE INDEX IF NOT EXISTS idx_budgets_archived ON budgets(is_archived);')
  } catch {
    // budgets table may not exist yet on fresh/partial schemas; normal migrations handle this.
  }
}

function ensureCashChecksAndAdvancesSchema(db: DB) {
  try {
    db.exec(`
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

      CREATE TABLE IF NOT EXISTS member_advance_purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        advance_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        type TEXT CHECK(type IN ('IN','OUT')) NOT NULL DEFAULT 'OUT',
        sphere TEXT CHECK(sphere IN ('IDEELL','ZWECK','VERMOEGEN','WGB')) NOT NULL DEFAULT 'IDEELL',
        description TEXT,
        net_amount NUMERIC NOT NULL DEFAULT 0,
        gross_amount NUMERIC NOT NULL DEFAULT 0,
        vat_rate NUMERIC NOT NULL DEFAULT 0,
        payment_method TEXT,
        category_id INTEGER,
        project_id INTEGER,
        budgets_json TEXT,
        earmarks_json TEXT,
        tags_json TEXT,
        files_json TEXT,
        voucher_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(advance_id) REFERENCES member_advances(id) ON DELETE CASCADE,
        FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL,
        FOREIGN KEY(voucher_id) REFERENCES vouchers(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_member_advances_member ON member_advances(member_id);
      CREATE INDEX IF NOT EXISTS idx_member_advances_issued ON member_advances(issued_at);
      CREATE INDEX IF NOT EXISTS idx_member_advance_settlements_advance ON member_advance_settlements(advance_id);
      CREATE INDEX IF NOT EXISTS idx_member_advance_settlements_settled ON member_advance_settlements(settled_at);
      CREATE INDEX IF NOT EXISTS idx_member_advance_purchases_advance ON member_advance_purchases(advance_id);
      CREATE INDEX IF NOT EXISTS idx_member_advance_purchases_date ON member_advance_purchases(date);
      CREATE INDEX IF NOT EXISTS idx_member_advance_purchases_voucher ON member_advance_purchases(voucher_id);
    `)
  } catch {
    // Base tables may still be migrating; regular migrations continue and may complete schema later.
    return
  }

  try {
    const advanceCols = db.prepare("PRAGMA table_info(member_advances)").all() as Array<{ name: string }>
    const names = new Set(advanceCols.map((c) => c.name))
    if (!names.has('placeholder_voucher_id')) {
      db.exec('ALTER TABLE member_advances ADD COLUMN placeholder_voucher_id INTEGER;')
    }
    if (!names.has('resolved_at')) {
      db.exec('ALTER TABLE member_advances ADD COLUMN resolved_at TEXT;')
    }
  } catch {
    // ignore
  }
}

export function getAppliedVersions(db: DB): Set<number> {
  ensureMigrationsTable(db)
  const rows = db.prepare('SELECT version FROM migrations ORDER BY version').all() as {
    version: number
  }[]
  return new Set(rows.map((r) => r.version))
}

export function applyMigrations(db: DB) {
  // Ensure critical junction tables exist even if migrations are partially applied.
  ensureVoucherJunctionTables(db)
  // Heal critical budgets columns for legacy/inconsistent DB states.
  ensureBudgetColumns(db)
  // Heal cash check + advances schema for legacy/inconsistent DB states.
  ensureCashChecksAndAdvancesSchema(db)

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

    // Special handling for migration 25 - check if archive column already exists
    if (mig.version === 25) {
      try {
        const budgetCols = db.prepare("PRAGMA table_info(budgets)").all() as Array<{ name: string }>
        const hasArchivedInBudgets = budgetCols.some((c: { name: string }) => c.name === 'is_archived')

        if (hasArchivedInBudgets) {
          console.log('[Migration 25] Column already exists, marking as applied')
          db.prepare('INSERT INTO migrations(version) VALUES (?)').run(mig.version)
          continue
        }
      } catch (e) {
        console.warn('[Migration 25] Failed to check if columns exist:', e)
      }
    }

    // Special handling for migration 28 - ensureCashChecksAndAdvancesSchema may have already created the full table
    if (mig.version === 28) {
      try {
        const advCols = db.prepare("PRAGMA table_info(member_advances)").all() as Array<{ name: string }>
        const hasPlaceholder = advCols.some((c: { name: string }) => c.name === 'placeholder_voucher_id')

        if (hasPlaceholder) {
          console.log('[Migration 28] Columns already exist (created by schema heal), marking as applied')
          db.prepare('INSERT INTO migrations(version) VALUES (?)').run(mig.version)
          continue
        }
      } catch (e) {
        console.warn('[Migration 28] Failed to check if columns exist:', e)
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
      // For migrations that add known columns, continue on duplicate-column errors.
      if ((mig.version === 20 || mig.version === 25 || mig.version === 28 || mig.version === 30) && error.message?.includes('duplicate column')) {
        console.log(`[Migration ${mig.version}] Column already exists, marking as applied`)
        db.prepare('INSERT INTO migrations(version) VALUES (?)').run(mig.version)
      } else {
        throw error
      }
    }
  }
}
