import webpush from "web-push";
import { nanoid } from "nanoid";
import { db } from "../db/database.js";
import { env } from "../config/env.js";
import { nowIso } from "../utils/date.js";

const hasPushConfig = Boolean(env.vapidPublicKey && env.vapidPrivateKey && env.vapidSubject);

if (hasPushConfig) {
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
}

export function getPushPublicKey() {
  return env.vapidPublicKey;
}

export function isPushConfigured() {
  return hasPushConfig;
}

export function savePushSubscription(userId, subscription, userAgent = "") {
  const endpoint = String(subscription?.endpoint || "");
  if (!endpoint) {
    return false;
  }

  const existing = db.prepare("SELECT id FROM push_subscriptions WHERE endpoint = ?").get(endpoint);
  const timestamp = nowIso();

  if (existing) {
    db.prepare(`
      UPDATE push_subscriptions
      SET user_id = ?, subscription_json = ?, user_agent = ?, updated_at = ?
      WHERE id = ?
    `).run(userId, JSON.stringify(subscription), userAgent, timestamp, existing.id);
    return true;
  }

  db.prepare(`
    INSERT INTO push_subscriptions (id, user_id, endpoint, subscription_json, user_agent, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(nanoid(), userId, endpoint, JSON.stringify(subscription), userAgent, timestamp, timestamp);
  return true;
}

export function deletePushSubscription(userId, endpoint = "") {
  if (endpoint) {
    db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").run(userId, endpoint);
    return;
  }

  db.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").run(userId);
}

export async function sendPushToUsers(userIds, payload) {
  if (!hasPushConfig || !Array.isArray(userIds) || !userIds.length) {
    return { sent: 0, failed: 0 };
  }

  const rows = db.prepare("SELECT id, user_id, endpoint, subscription_json FROM push_subscriptions WHERE user_id IN (" + userIds.map(() => "?").join(",") + ")").all(...userIds);
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await webpush.sendNotification(JSON.parse(row.subscription_json), JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      failed += 1;
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(row.id);
      }
    }
  }

  return { sent, failed };
}
