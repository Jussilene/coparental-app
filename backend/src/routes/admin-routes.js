import express from "express";
import { nanoid } from "nanoid";
import { db } from "../db/database.js";
import { requireActiveSubscription, requireAdmin, requireAuth } from "../middleware/auth.js";
import { created, ok } from "../utils/http.js";
import { hashPassword } from "../utils/security.js";
import { assertEmail, assertPassword, normalizeEmail, required, sanitizeText } from "../utils/validation.js";
import { nowIso } from "../utils/date.js";
import { createActivationToken } from "../services/token-service.js";
import { sendEmail } from "../services/email-service.js";
import { env } from "../config/env.js";
import { writeAuditLog } from "../services/audit-service.js";
import { runSupportReminderCycle } from "../services/support-reminder-service.js";

export const adminRouter = express.Router();

adminRouter.use(requireAuth, requireActiveSubscription, requireAdmin);

function deleteByIds(table, column, ids) {
  if (!ids.length) {
    return;
  }

  const placeholders = ids.map(() => "?").join(", ");
  db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`).run(...ids);
}

function listIds(table, column, value) {
  return db.prepare(`SELECT id FROM ${table} WHERE ${column} = ?`).all(value).map((row) => row.id);
}

adminRouter.get("/customers", (req, res) => {
  const search = sanitizeText(req.query.search, 120);
  const status = sanitizeText(req.query.status, 20);
  const where = [];
  const params = [];

  if (search) {
    where.push("(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) {
    if (status === "never_accessed") {
      where.push("u.last_login_at IS NULL");
    } else {
      where.push("COALESCE(s.status, u.account_status) = ?");
      params.push(status);
    }
  }

  const sql = `
    SELECT
      u.id, u.name, u.email, u.phone, u.account_status, u.activation_state, u.last_login_at, u.created_at, u.updated_at,
      s.status AS subscription_status, s.billing_status, s.plan_name, s.product_name, s.purchase_date, s.renewal_date, s.amount,
      COUNT(he.id) AS webhook_count
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    LEFT JOIN hotmart_events he ON he.customer_email = u.email
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `;

  const rows = db.prepare(sql).all(...params);
  return ok(res, { customers: rows });
});

adminRouter.post("/customers", async (req, res, next) => {
  try {
    const name = sanitizeText(req.body.name, 80);
    const email = normalizeEmail(req.body.email);
    const phone = sanitizeText(req.body.phone, 40);
    const password = String(req.body.password || "");
    const planName = sanitizeText(req.body.planName, 80);
    const createPlan = Boolean(req.body.createPlan);

    required(name, "Nome");
    assertEmail(email);
    assertPassword(password);

    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (exists) {
      return res.status(409).json({ ok: false, message: "Ja existe um usuario com este e-mail." });
    }

    const timestamp = nowIso();
    const userId = nanoid();
    const passwordHash = await hashPassword(password);

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, phone, role_label, avatar_color, is_admin, account_status, activation_state, activated_at, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Responsável', '#5aa3c7', 0, 'active', 'completed', ?, NULL, ?, ?)
    `).run(userId, name, email, passwordHash, phone, timestamp, timestamp, timestamp);

    if (createPlan) {
      db.prepare(`
        INSERT INTO subscriptions (id, user_id, product_name, plan_name, status, billing_status, currency, purchase_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', 'active', 'BRL', ?, ?, ?)
      `).run(nanoid(), userId, "Plano manual CRM", planName || "Plano manual", timestamp, timestamp, timestamp);
    }

    writeAuditLog({ userId: req.user.id, action: "admin_customer_created", entityType: "user", entityId: userId, details: { email } });
    return created(res, { message: "Usuario criado com sucesso.", userId });
  } catch (error) {
    next(error);
  }
});

adminRouter.put("/customers/:id", async (req, res, next) => {
  try {
    const customer = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!customer) {
      return res.status(404).json({ ok: false, message: "Usuario nao encontrado." });
    }
    const name = sanitizeText(req.body.name, 80);
    const email = normalizeEmail(req.body.email);
    const phone = sanitizeText(req.body.phone, 40);
    const roleLabel = sanitizeText(req.body.roleLabel || customer.role_label, 80);
    required(name, "Nome");
    assertEmail(email);
    const duplicate = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, customer.id);
    if (duplicate) {
      return res.status(409).json({ ok: false, message: "Ja existe outro usuario com este e-mail." });
    }

    db.prepare("UPDATE users SET name = ?, email = ?, phone = ?, role_label = ?, updated_at = ? WHERE id = ?")
      .run(name, email, phone, roleLabel, nowIso(), customer.id);

    if (req.body.subscriptionStatus) {
      db.prepare("UPDATE subscriptions SET status = ?, billing_status = ?, updated_at = ? WHERE user_id = ?")
        .run(req.body.subscriptionStatus, req.body.subscriptionStatus, nowIso(), customer.id);
      db.prepare("UPDATE users SET account_status = ?, updated_at = ? WHERE id = ?")
        .run(req.body.subscriptionStatus, nowIso(), customer.id);
    }

    writeAuditLog({ userId: req.user.id, action: "admin_customer_updated", entityType: "user", entityId: customer.id });
    return ok(res, { message: "Usuario atualizado." });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/customers/:id/resend-activation", (req, res) => {
  const customer = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!customer) {
    return res.status(404).json({ ok: false, message: "Usuario nao encontrado." });
  }
  const token = createActivationToken(customer.id);
  const activationLink = `${env.appBaseUrl}/ativar-conta?token=${token}`;
  sendEmail({
    to: customer.email,
    subject: "Ative sua conta CoParental",
    html: `<p>Ola, ${customer.name}.</p><p>Defina sua senha inicial em: <a href="${activationLink}">${activationLink}</a></p>`,
    meta: { activationLink, type: "activation-resend" }
  });
  writeAuditLog({ userId: req.user.id, action: "admin_activation_resent", entityType: "user", entityId: customer.id });
  return ok(res, { message: "E-mail de ativacao reenviado." });
});

adminRouter.post("/customers/:id/reset-password", async (req, res, next) => {
  try {
    const customer = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
    if (!customer) {
      return res.status(404).json({ ok: false, message: "Usuario nao encontrado." });
    }
    const passwordHash = await hashPassword("123456");
    db.prepare("UPDATE users SET password_hash = ?, activation_state = 'completed', activated_at = COALESCE(activated_at, ?), updated_at = ? WHERE id = ?")
      .run(passwordHash, nowIso(), nowIso(), customer.id);
    writeAuditLog({ userId: req.user.id, action: "admin_password_reset_default", entityType: "user", entityId: customer.id });
    return ok(res, { message: "Senha resetada para 123456." });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/customers/:id/suspend", (req, res) => {
  const customer = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!customer) {
    return res.status(404).json({ ok: false, message: "Usuario nao encontrado." });
  }
  db.prepare("UPDATE users SET account_status = 'suspended', updated_at = ? WHERE id = ?").run(nowIso(), customer.id);
  db.prepare("UPDATE subscriptions SET status = 'suspended', billing_status = 'suspended', updated_at = ? WHERE user_id = ?").run(nowIso(), customer.id);
  writeAuditLog({ userId: req.user.id, action: "admin_customer_suspended", entityType: "user", entityId: customer.id });
  return ok(res, { message: "Usuario desativado." });
});

adminRouter.post("/customers/:id/activate", (req, res) => {
  const customer = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!customer) {
    return res.status(404).json({ ok: false, message: "Usuario nao encontrado." });
  }
  db.prepare("UPDATE users SET account_status = 'active', activation_state = 'completed', updated_at = ? WHERE id = ?").run(nowIso(), customer.id);
  db.prepare("UPDATE subscriptions SET status = 'active', billing_status = 'active', updated_at = ? WHERE user_id = ?").run(nowIso(), customer.id);
  writeAuditLog({ userId: req.user.id, action: "admin_customer_activated", entityType: "user", entityId: customer.id });
  return ok(res, { message: "Usuario ativado." });
});

adminRouter.delete("/customers/:id", (req, res) => {
  const customer = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!customer) {
    return res.status(404).json({ ok: false, message: "Usuario nao encontrado." });
  }

  const removeCustomer = db.transaction((userId) => {
    const ownedFamilyIds = listIds("families", "created_by", userId);

    if (ownedFamilyIds.length) {
      const ownedExpenseIds = db.prepare(`SELECT id FROM expenses WHERE family_id IN (${ownedFamilyIds.map(() => "?").join(", ")})`).all(...ownedFamilyIds).map((row) => row.id);
      const ownedScheduleEventIds = db.prepare(`SELECT id FROM schedule_events WHERE family_id IN (${ownedFamilyIds.map(() => "?").join(", ")})`).all(...ownedFamilyIds).map((row) => row.id);

      deleteByIds("expense_comments", "expense_id", ownedExpenseIds);
      deleteByIds("swap_requests", "schedule_event_id", ownedScheduleEventIds);
      deleteByIds("swap_requests", "family_id", ownedFamilyIds);
      deleteByIds("notifications", "family_id", ownedFamilyIds);
      deleteByIds("chat_messages", "family_id", ownedFamilyIds);
      deleteByIds("support_reminder_dispatches", "family_id", ownedFamilyIds);
      deleteByIds("support_payments", "family_id", ownedFamilyIds);
      deleteByIds("expenses", "family_id", ownedFamilyIds);
      deleteByIds("schedule_events", "family_id", ownedFamilyIds);
      deleteByIds("invitations", "family_id", ownedFamilyIds);
      deleteByIds("support_settings", "family_id", ownedFamilyIds);
      deleteByIds("family_members", "family_id", ownedFamilyIds);
      deleteByIds("children", "family_id", ownedFamilyIds);
      deleteByIds("families", "id", ownedFamilyIds);
    }

    const expenseIds = db.prepare("SELECT id FROM expenses WHERE created_by = ? OR paid_by_user_id = ?").all(userId, userId).map((row) => row.id);
    const scheduleEventIds = listIds("schedule_events", "created_by", userId);

    deleteByIds("expense_comments", "expense_id", expenseIds);
    deleteByIds("swap_requests", "schedule_event_id", scheduleEventIds);

    db.prepare("DELETE FROM account_activation_tokens WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM password_reset_requests WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM subscriptions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM notifications WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM expense_comments WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM family_members WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM support_reminder_dispatches WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM support_payments WHERE created_by = ?").run(userId);
    db.prepare("DELETE FROM expenses WHERE created_by = ? OR paid_by_user_id = ?").run(userId, userId);
    db.prepare("DELETE FROM swap_requests WHERE requested_by = ?").run(userId);
    db.prepare("DELETE FROM schedule_events WHERE created_by = ?").run(userId);
    db.prepare("DELETE FROM chat_messages WHERE sender_id = ?").run(userId);
    db.prepare("UPDATE audit_logs SET user_id = NULL WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  });

  removeCustomer(customer.id);
  writeAuditLog({ userId: req.user.id, action: "admin_customer_deleted", entityType: "user", entityId: customer.id, details: { email: customer.email } });
  return ok(res, { message: "Usuario excluido." });
});

adminRouter.get("/overview", (_req, res) => {
  const stats = {
    active: db.prepare("SELECT COUNT(*) AS total FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id WHERE COALESCE(s.status, u.account_status) = 'active'").get().total,
    late: db.prepare("SELECT COUNT(*) AS total FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id WHERE COALESCE(s.status, u.account_status) = 'late'").get().total,
    canceled: db.prepare("SELECT COUNT(*) AS total FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id WHERE COALESCE(s.status, u.account_status) = 'canceled'").get().total,
    neverAccessed: db.prepare("SELECT COUNT(*) AS total FROM users WHERE last_login_at IS NULL").get().total
  };
  return ok(res, { stats });
});

adminRouter.post("/support-reminders/run", async (req, res) => {
  const result = await runSupportReminderCycle({
    todayDate: sanitizeText(req.body.date, 20) || undefined,
    familyId: sanitizeText(req.body.familyId, 40) || "",
    forceStage: sanitizeText(req.body.stage, 20) || ""
  });
  return ok(res, result);
});

adminRouter.post("/notifications/pensao-atrasada/test", async (req, res) => {
  const result = await runSupportReminderCycle({
    todayDate: sanitizeText(req.body.date, 20) || undefined,
    familyId: sanitizeText(req.body.familyId, 40) || "",
    forceStage: "overdue_daily"
  });
  return ok(res, result);
});

adminRouter.post("/notifications/pensao-atrasada/run", async (req, res) => {
  const result = await runSupportReminderCycle({
    todayDate: sanitizeText(req.body.date, 20) || undefined,
    familyId: sanitizeText(req.body.familyId, 40) || "",
    forceStage: ""
  });
  return ok(res, result);
});
