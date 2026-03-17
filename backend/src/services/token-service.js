import { nanoid } from "nanoid";
import { db } from "../db/database.js";
import { nowIso } from "../utils/date.js";

function expiresInHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function createActivationToken(userId) {
  const token = nanoid(32);
  db.prepare("INSERT INTO account_activation_tokens (id, user_id, token, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)").run(
    nanoid(),
    userId,
    token,
    expiresInHours(48),
    nowIso()
  );
  return token;
}

export function consumeActivationToken(token) {
  const row = db.prepare("SELECT * FROM account_activation_tokens WHERE token = ? AND used_at IS NULL").get(token);
  if (!row || new Date(row.expires_at) < new Date()) {
    return null;
  }
  db.prepare("UPDATE account_activation_tokens SET used_at = ? WHERE id = ?").run(nowIso(), row.id);
  return row;
}

export function createPasswordResetToken(userId) {
  const token = nanoid(32);
  db.prepare("INSERT INTO password_reset_requests (id, user_id, token, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)").run(
    nanoid(),
    userId,
    token,
    expiresInHours(4),
    nowIso()
  );
  return token;
}

export function createPasswordResetCode(userId) {
  let code = "";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    code = String(Math.floor(100000 + Math.random() * 900000));
    const exists = db.prepare("SELECT id FROM password_reset_requests WHERE token = ? AND used_at IS NULL").get(code);
    if (!exists) {
      db.prepare("DELETE FROM password_reset_requests WHERE user_id = ? AND used_at IS NULL").run(userId);
      db.prepare("INSERT INTO password_reset_requests (id, user_id, token, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)")
        .run(nanoid(), userId, code, expiresInHours(1), nowIso());
      return code;
    }
  }

  throw new Error("Nao foi possivel gerar um codigo de redefinicao.");
}

export function consumePasswordResetToken(token) {
  const row = db.prepare("SELECT * FROM password_reset_requests WHERE token = ? AND used_at IS NULL").get(token);
  if (!row || new Date(row.expires_at) < new Date()) {
    return null;
  }
  db.prepare("UPDATE password_reset_requests SET used_at = ? WHERE id = ?").run(nowIso(), row.id);
  return row;
}

export function consumePasswordResetCode(userId, code) {
  const row = db.prepare("SELECT * FROM password_reset_requests WHERE user_id = ? AND token = ? AND used_at IS NULL").get(userId, code);
  if (!row || new Date(row.expires_at) < new Date()) {
    return null;
  }
  db.prepare("UPDATE password_reset_requests SET used_at = ? WHERE id = ?").run(nowIso(), row.id);
  return row;
}
