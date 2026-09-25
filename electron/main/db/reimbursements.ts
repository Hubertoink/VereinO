import type Database from 'better-sqlite3'

export function ensureReimbursementTables(db: InstanceType<typeof Database>) {
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vouchers'").get()) return
  db.exec(`
    CREATE TABLE IF NOT EXISTS reimbursements (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, partner TEXT NOT NULL,
      due_date TEXT, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reimbursement_links (
      id INTEGER PRIMARY KEY,
      reimbursement_id INTEGER NOT NULL REFERENCES reimbursements(id) ON DELETE CASCADE,
      voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE RESTRICT,
      role TEXT NOT NULL CHECK(role IN ('EXPENSE','PAYMENT')),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0 AND typeof(amount_cents) = 'integer'),
      UNIQUE(reimbursement_id, voucher_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reimbursement_links_voucher ON reimbursement_links(voucher_id);
    CREATE TRIGGER IF NOT EXISTS reimbursement_voucher_delete BEFORE DELETE ON vouchers
    WHEN EXISTS (SELECT 1 FROM reimbursement_links WHERE voucher_id = OLD.id)
    BEGIN SELECT RAISE(ABORT, 'Bitte zuerst die Kostenerstattungs-Zuordnung dieser Buchung entfernen.'); END;
    CREATE TRIGGER IF NOT EXISTS reimbursement_voucher_update
    BEFORE UPDATE OF gross_amount, type, reversed_by_id, original_id ON vouchers
    WHEN EXISTS (SELECT 1 FROM reimbursement_links WHERE voucher_id = OLD.id)
      AND (NEW.type <> OLD.type OR NEW.reversed_by_id IS NOT NULL OR NEW.original_id IS NOT NULL
        OR ROUND(NEW.gross_amount * 100) < (SELECT SUM(amount_cents) FROM reimbursement_links WHERE voucher_id = OLD.id))
    BEGIN SELECT RAISE(ABORT, 'Die Buchung ist einer Kostenerstattung zugeordnet. Bitte zuerst die Zuordnung anpassen.'); END;
  `)
}
