import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { db } from "../db/database.js";
import { env } from "../config/env.js";
import { nowIso } from "../utils/date.js";
import { normalizeEmail, sanitizeText } from "../utils/validation.js";
import { hashPassword } from "../utils/security.js";
import { writeAuditLog } from "./audit-service.js";
import { sendEmail } from "./email-service.js";
import { createActivationToken } from "./token-service.js";
import { syncUserAccountStatus, upsertSubscription } from "./subscription-service.js";

function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export function validateHotmartSignature(req) {
  if (!env.hotmartWebhookSecret) {
    return true;
  }
  const signature = req.headers["x-hotmart-hottok"] || req.headers["x-hotmart-signature"];
  if (!signature) {
    return false;
  }
  const expected = crypto.createHmac("sha256", env.hotmartWebhookSecret).update(JSON.stringify(req.body)).digest("hex");
  return String(signature) === expected;
}

export function extractHotmartEvent(payload) {
  const eventType = pick(payload.event, payload.event_type, payload.type, payload.data?.event);
  const data = payload.data || payload;
  const buyer = data.buyer || data.customer || data.subscriber || {};
  const product = data.product || {};
  const subscription = data.subscription || {};
  const purchase = data.purchase || {};

  return {
    externalEventId: pick(payload.id, data.id, purchase.order_id, purchase.transaction, `${eventType}-${buyer.email}-${purchase.approved_date}`),
    eventType: String(eventType || "unknown").toLowerCase(),
    email: normalizeEmail(pick(buyer.email, data.email)),
    name: sanitizeText(pick(buyer.name, data.name, "Cliente CoParental"), 120),
    phone: sanitizeText(pick(buyer.phone, buyer.checkout_phone, data.phone), 40),
    purchaseId: pick(purchase.order_id, purchase.id, purchase.transaction),
    transaction: pick(purchase.transaction, subscription.transaction),
    subscriberCode: pick(subscription.subscriber_code, subscription.code),
    productId: String(pick(product.id, data.product_id, "")),
    productName: sanitizeText(pick(product.name, data.product_name, "CoParental"), 120),
    planName: sanitizeText(pick(subscription.plan?.name, data.plan_name, env.hotmartDefaultPlan), 120),
    status: String(pick(purchase.status, subscription.status, "active")).toLowerCase(),
    purchaseDate: pick(purchase.approved_date, purchase.purchase_date, data.purchase_date, nowIso()),
    renewalDate: pick(subscription.next_charge_date, data.renewal_date),
    amount: Number(pick(purchase.price?.value, purchase.price, data.price_value, 0)),
    currency: pick(purchase.price?.currency_code, data.currency, "BRL")
  };
}

export function registerHotmartEvent(event, payload) {
  db.prepare(`
    INSERT INTO hotmart_events (id, external_event_id, event_type, hotmart_transaction, customer_email, payload_json, processing_status, processed_at, error_message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'received', NULL, NULL, ?)
  `).run(nanoid(), event.externalEventId, event.eventType, event.transaction || null, event.email || null, JSON.stringify(payload), nowIso());
}

export function hasProcessedHotmartEvent(externalEventId) {
  return db.prepare("SELECT id, processing_status FROM hotmart_events WHERE external_event_id = ?").get(externalEventId);
}

export async function provisionFromHotmartEvent(event) {
  let user = db.prepare("SELECT * FROM users WHERE email = ?").get(event.email);
  let createdUser = false;

  if (!user) {
    const userId = nanoid();
    const tempPasswordHash = await hashPassword(nanoid(24));
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, phone, role_label, avatar_color, is_admin, account_status, activation_state, activated_at, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Cliente Hotmart', '#4d8fd8', 0, 'active', 'pending', NULL, NULL, ?, ?)
    `).run(userId, event.name, event.email, tempPasswordHash, event.phone || "", nowIso(), nowIso());
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    createdUser = true;
  } else {
    db.prepare("UPDATE users SET name = ?, phone = COALESCE(NULLIF(?, ''), phone), account_status = 'active', updated_at = ? WHERE id = ?")
      .run(event.name || user.name, event.phone || "", nowIso(), user.id);
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  }

  const billingStatus = event.status === "approved" ? "active" : event.status;
  upsertSubscription({
    userId: user.id,
    purchaseId: event.purchaseId,
    transaction: event.transaction,
    subscriberCode: event.subscriberCode,
    productId: event.productId,
    productName: event.productName,
    planName: event.planName,
    status: billingStatus === "active" ? "active" : billingStatus,
    billingStatus,
    amount: event.amount,
    currency: event.currency,
    purchaseDate: event.purchaseDate,
    renewalDate: event.renewalDate,
    lastEventType: event.eventType
  });
  syncUserAccountStatus(user.id, billingStatus === "active" ? "active" : billingStatus);

  const activationToken = createActivationToken(user.id);
  const activationLink = `${env.appBaseUrl}/ativar-conta?token=${activationToken}`;
  sendEmail({
    to: user.email,
    subject: createdUser ? "Ative sua conta CoParental" : "Seu acesso ao CoParental foi atualizado",
    html: `<p>Olá, ${user.name}.</p><p>Seu acesso ao CoParental está disponível.</p><p><a href="${activationLink}">Clique aqui para definir sua senha</a></p>`,
    meta: { activationLink, type: "activation" }
  });

  writeAuditLog({
    userId: user.id,
    action: createdUser ? "hotmart_user_provisioned" : "hotmart_subscription_reactivated",
    entityType: "subscription",
    entityId: user.id,
    details: event
  });

  return user;
}

export function updateHotmartEventStatus(externalEventId, processingStatus, errorMessage = null) {
  db.prepare("UPDATE hotmart_events SET processing_status = ?, processed_at = ?, error_message = ? WHERE external_event_id = ?")
    .run(processingStatus, nowIso(), errorMessage, externalEventId);
}

export function applyHotmartStatusUpdate(event) {
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(event.email);
  if (!user) {
    return null;
  }

  const statusMap = {
    canceled: "canceled",
    cancelled: "canceled",
    chargeback: "canceled",
    expired: "expired",
    delayed: "late",
    late: "late",
    billet_printed: "late",
    renewed: "active",
    approved: "active"
  };

  const nextStatus = statusMap[event.eventType] || statusMap[event.status] || "active";
  upsertSubscription({
    userId: user.id,
    purchaseId: event.purchaseId,
    transaction: event.transaction,
    subscriberCode: event.subscriberCode,
    productId: event.productId,
    productName: event.productName,
    planName: event.planName,
    status: nextStatus,
    billingStatus: nextStatus,
    amount: event.amount,
    currency: event.currency,
    purchaseDate: event.purchaseDate,
    renewalDate: event.renewalDate,
    lastEventType: event.eventType
  });
  syncUserAccountStatus(user.id, nextStatus);
  writeAuditLog({
    userId: user.id,
    action: `hotmart_${nextStatus}`,
    entityType: "subscription",
    entityId: user.id,
    details: event
  });
  return user;
}
