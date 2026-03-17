import { nanoid } from "nanoid";
import { db } from "../db/database.js";
import { nowIso } from "../utils/date.js";

export const ACTIVE_STATUSES = new Set(["active", "trialing"]);
export const BLOCKED_STATUSES = new Set(["late", "canceled", "suspended", "expired"]);

export function getUserSubscription(userId) {
  return db.prepare("SELECT * FROM subscriptions WHERE user_id = ?").get(userId);
}

export function upsertSubscription({ userId, purchaseId = null, transaction = null, subscriberCode = null, productId = null, productName = null, planName = null, status = "active", billingStatus = "active", amount = 0, currency = "BRL", purchaseDate = null, renewalDate = null, lastEventType = null }) {
  const existing = getUserSubscription(userId);
  const timestamp = nowIso();

  if (existing) {
    db.prepare(`
      UPDATE subscriptions
      SET hotmart_purchase_id = COALESCE(?, hotmart_purchase_id),
          hotmart_transaction = COALESCE(?, hotmart_transaction),
          hotmart_subscriber_code = COALESCE(?, hotmart_subscriber_code),
          product_id = COALESCE(?, product_id),
          product_name = COALESCE(?, product_name),
          plan_name = COALESCE(?, plan_name),
          status = ?,
          billing_status = ?,
          amount = ?,
          currency = ?,
          purchase_date = COALESCE(?, purchase_date),
          renewal_date = COALESCE(?, renewal_date),
          last_event_type = ?,
          last_event_at = ?,
          updated_at = ?
      WHERE user_id = ?
    `).run(purchaseId, transaction, subscriberCode, productId, productName, planName, status, billingStatus, amount, currency, purchaseDate, renewalDate, lastEventType, timestamp, timestamp, userId);
    return getUserSubscription(userId);
  }

  db.prepare(`
    INSERT INTO subscriptions (
      id, user_id, hotmart_purchase_id, hotmart_transaction, hotmart_subscriber_code, product_id, product_name, plan_name,
      status, billing_status, amount, currency, purchase_date, renewal_date, last_event_type, last_event_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nanoid(),
    userId,
    purchaseId,
    transaction,
    subscriberCode,
    productId,
    productName,
    planName,
    status,
    billingStatus,
    amount,
    currency,
    purchaseDate,
    renewalDate,
    lastEventType,
    timestamp,
    timestamp,
    timestamp
  );

  return getUserSubscription(userId);
}

export function syncUserAccountStatus(userId, subscriptionStatus) {
  const accountStatus = subscriptionStatus === "active" ? "active" : subscriptionStatus;
  db.prepare(`
    UPDATE users
    SET account_status = ?, updated_at = ?
    WHERE id = ?
  `).run(accountStatus, nowIso(), userId);
}

export function markLogin(userId) {
  db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(nowIso(), nowIso(), userId);
}
