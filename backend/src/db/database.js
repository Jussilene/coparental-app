import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { env } from "../config/env.js";
import { schemaSql } from "./schema.js";

fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });
fs.mkdirSync(env.uploadDir, { recursive: true });

export const db = new Database(env.dbPath);
db.pragma("journal_mode = WAL");
db.exec(schemaSql);

function hasColumn(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((row) => row.name === column);
}

function ensureColumn(table, column, definition) {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function runMigrations() {
  ensureColumn("users", "is_admin", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("users", "account_status", "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn("users", "activation_state", "TEXT NOT NULL DEFAULT 'completed'");
  ensureColumn("users", "activated_at", "TEXT");
  ensureColumn("users", "last_login_at", "TEXT");
  ensureColumn("families", "counterpart_name", "TEXT");
  ensureColumn("families", "counterpart_email", "TEXT");
  ensureColumn("schedule_events", "end_date", "TEXT");
  ensureColumn("schedule_events", "child_ids", "TEXT");
  ensureColumn("expenses", "child_ids", "TEXT");
  ensureColumn("support_payments", "last_notification_at", "TEXT");
  ensureColumn("support_payments", "notification_status", "TEXT");
  ensureColumn("support_payments", "notification_error", "TEXT");
}

runMigrations();

export function ensurePrimaryAdmin() {
  const adminEmail = "jvr.solucoes8@gmail.com";
  const adminPasswordHash = bcrypt.hashSync("110313", 10);
  const timestamp = new Date().toISOString();

  db.prepare("UPDATE users SET is_admin = 0 WHERE email != ?").run(adminEmail);

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail);
  if (existing) {
    db.prepare(`
      UPDATE users
      SET name = 'JVR Soluções', password_hash = ?, is_admin = 1, account_status = 'active',
          activation_state = 'completed', activated_at = COALESCE(activated_at, ?), updated_at = ?
      WHERE email = ?
    `).run(adminPasswordHash, timestamp, timestamp, adminEmail);
    return;
  }

  db.prepare(`
    INSERT INTO users (
      id, name, email, password_hash, phone, role_label, avatar_color, is_admin, account_status,
      activation_state, activated_at, last_login_at, created_at, updated_at
    ) VALUES (?, 'JVR Soluções', ?, ?, '', 'Administrador', '#2f7fd1', 1, 'active', 'completed', ?, NULL, ?, ?)
  `).run(nanoid(), adminEmail, adminPasswordHash, timestamp, timestamp, timestamp);
}

ensurePrimaryAdmin();
