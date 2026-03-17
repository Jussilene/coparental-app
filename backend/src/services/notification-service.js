import { nanoid } from "nanoid";
import { db } from "../db/database.js";
import { nowIso } from "../utils/date.js";
import { sendPushToUsers } from "./push-service.js";

export function notifyFamilyMembers(familyId, type, title, content, excludeUserId = null, targetUserIds = null) {
  const members = db.prepare("SELECT user_id FROM family_members WHERE family_id = ? AND status = 'active'").all(familyId);
  const insert = db.prepare(`
    INSERT INTO notifications (id, family_id, user_id, type, title, content, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `);
  const deliveredUserIds = [];

  for (const member of members) {
    if (Array.isArray(targetUserIds) && targetUserIds.length && !targetUserIds.includes(member.user_id)) {
      continue;
    }
    if (excludeUserId && member.user_id === excludeUserId) {
      continue;
    }
    insert.run(nanoid(), familyId, member.user_id, type, title, content, nowIso());
    deliveredUserIds.push(member.user_id);
  }

  if (deliveredUserIds.length) {
    sendPushToUsers(deliveredUserIds, {
      title,
      body: content,
      type,
      path: "/notificacoes"
    }).catch(() => {});
  }
}
