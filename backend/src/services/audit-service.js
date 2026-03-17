import { nanoid } from "nanoid";
import { db } from "../db/database.js";
import { nowIso } from "../utils/date.js";

export function writeAuditLog({ userId = null, action, entityType, entityId = null, details = null }) {
  db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(nanoid(), userId, action, entityType, entityId, details ? JSON.stringify(details) : null, nowIso());
}
