import express from "express";
import fs from "node:fs";
import path from "node:path";
import dayjs from "dayjs";
import { nanoid } from "nanoid";
import { env } from "../config/env.js";
import { db } from "../db/database.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { getUploadMeta, upload } from "../middleware/upload.js";
import { getFamilyContext, getUserFamilies, requireFamily, createFamilySetup, acceptInvitation, deleteFamilyPanel } from "../services/family-service.js";
import { notifyFamilyMembers } from "../services/notification-service.js";
import { deletePushSubscription, getPushPublicKey, isPushConfigured, savePushSubscription } from "../services/push-service.js";
import { runSupportReminderCycle } from "../services/support-reminder-service.js";
import { buildDueDate, isPast, monthRef, nowIso } from "../utils/date.js";
import { ok, created } from "../utils/http.js";
import { sendPdf } from "../utils/pdf.js";
import { required, sanitizeText } from "../utils/validation.js";

export const appRouter = express.Router();

appRouter.use(requireAuth);

function selectedFamilyId(req) {
  return req.query.familyId || req.body?.familyId || null;
}

function parseMoneyInput(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function parseDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }

  return raw;
}

appRouter.get("/bootstrap", (req, res) => {
  const context = getFamilyContext(req.user.id, selectedFamilyId(req));
  return ok(res, {
    user: req.user,
    familyContext: context,
    familyPanels: getUserFamilies(req.user.id)
  });
});

appRouter.post("/onboarding", (req, res, next) => {
  try {
    const result = createFamilySetup(req.user.id, req.body);
    return created(res, { message: "Estrutura familiar criada.", ...result });
  } catch (error) {
    next(error);
  }
});

appRouter.post("/invitations/accept", (req, res, next) => {
  try {
    required(req.body.token, "Token do convite");
    const result = acceptInvitation(req.user.id, req.body.token);
    return ok(res, { message: "Convite aceito com sucesso.", ...result });
  } catch (error) {
    next(error);
  }
});

appRouter.delete("/family/:id", (req, res, next) => {
  try {
    deleteFamilyPanel(req.user.id, req.params.id);
    return ok(res, { message: "Painel excluído com sucesso." });
  } catch (error) {
    next(error);
  }
});

appRouter.get("/dashboard", (req, res, next) => {
  try {
    const { family, members } = requireFamily(req.user.id, selectedFamilyId(req));
    const support = db.prepare("SELECT * FROM support_settings WHERE family_id = ?").get(family.id);
    const latestPayment = db.prepare("SELECT * FROM support_payments WHERE family_id = ? ORDER BY month_ref DESC LIMIT 1").get(family.id);
    const recentExpenses = db.prepare(`
      SELECT e.*, u.name AS paid_by_name
      FROM expenses e
      JOIN users u ON u.id = e.paid_by_user_id
      WHERE e.family_id = ?
      ORDER BY e.expense_date DESC, e.created_at DESC
      LIMIT 5
    `).all(family.id);
    const upcomingEvents = db.prepare(`
      SELECT *
      FROM schedule_events
      WHERE family_id = ? AND event_date >= ?
      ORDER BY event_date ASC
      LIMIT 5
    `).all(family.id, dayjs().format("YYYY-MM-DD"));
    const pendingSwaps = db.prepare(`
      SELECT *
      FROM swap_requests
      WHERE family_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `).all(family.id);
    const messages = db.prepare(`
      SELECT m.*, u.name AS sender_name
      FROM chat_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.family_id = ?
      ORDER BY m.created_at DESC
      LIMIT 4
    `).all(family.id);
    const notifications = db.prepare(`
      SELECT *
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 6
    `).all(req.user.id);
    const nextDueDate = support ? buildDueDate(monthRef(), support.due_day) : null;

    return ok(res, {
      family,
      members,
      support,
      latestPayment,
      recentExpenses,
      upcomingEvents,
      pendingSwaps,
      messages,
      notifications,
      nextDueDate
    });
  } catch (error) {
    next(error);
  }
});

appRouter.get("/family", (req, res, next) => {
  try {
    return ok(res, requireFamily(req.user.id, selectedFamilyId(req)));
  } catch (error) {
    next(error);
  }
});

appRouter.post("/children", (req, res, next) => {
  try {
    const { family, children } = requireFamily(req.user.id, selectedFamilyId(req));
    const name = sanitizeText(req.body.name, 80);
    required(name, "Nome da criança");
    const timestamp = nowIso();

    if (status === "paid_late" && !justification) {
      return res.status(400).json({ ok: false, message: "Informe o motivo do atraso para pagamentos fora do vencimento." });
    }

    db.prepare(`
      INSERT INTO children (id, family_id, name, birth_date, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(nanoid(), family.id, name, req.body.birthDate || null, sanitizeText(req.body.notes, 240), timestamp, timestamp);

    return created(res, { message: "Perfil da criança criado." });
  } catch (error) {
    next(error);
  }
});

appRouter.get("/support", (req, res, next) => {
  try {
    const { family } = requireFamily(req.user.id, selectedFamilyId(req));
    const settings = db.prepare("SELECT * FROM support_settings WHERE family_id = ?").get(family.id);
    const payments = db.prepare("SELECT * FROM support_payments WHERE family_id = ? ORDER BY month_ref DESC").all(family.id);
    const paymentMap = new Map(payments.map((item) => [item.month_ref, item]));
    const history = settings
      ? [-2, -1, 0, 1].map((offset) => {
          const ref = monthRef(dayjs().add(offset, "month"));
          const saved = paymentMap.get(ref);
          if (saved) {
            return saved;
          }

          const dueDate = buildDueDate(ref, settings.due_day);
          return {
            id: `virtual-${ref}`,
            family_id: family.id,
            month_ref: ref,
            amount: settings.amount,
            due_date: dueDate,
            paid_at: null,
            status: isPast(dueDate) ? "overdue" : "pending",
            justification: "",
            attachment_path: null,
            attachment_name: null,
            created_by: null,
            created_at: null,
            updated_at: null
          };
        }).sort((a, b) => String(b.month_ref).localeCompare(String(a.month_ref)))
      : payments;

    return ok(res, { settings, payments, history });
  } catch (error) {
    next(error);
  }
});

appRouter.post("/support/settings", (req, res, next) => {
  try {
    const { family, children } = requireFamily(req.user.id, selectedFamilyId(req));
    if (family.created_by !== req.user.id) {
      return res.status(403).json({ ok: false, message: "Apenas quem criou o painel pode alterar a pensao." });
    }
    const amount = parseMoneyInput(req.body.amount);
    const dueDay = Number(req.body.dueDay);

    if (!amount || !dueDay) {
      return res.status(400).json({ ok: false, message: "Informe valor e vencimento mensal." });
    }

    db.prepare(`
      INSERT INTO support_settings (id, family_id, amount, due_day, description, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(family_id) DO UPDATE SET amount = excluded.amount, due_day = excluded.due_day, description = excluded.description, updated_at = excluded.updated_at
    `).run(nanoid(), family.id, amount, dueDay, sanitizeText(req.body.description, 240), nowIso());

    return ok(res, { message: "Configuração da pensão atualizada." });
  } catch (error) {
    next(error);
  }
});

appRouter.post("/support/payments", upload.single("attachment"), (req, res, next) => {
  try {
    const { family, children } = requireFamily(req.user.id, selectedFamilyId(req));
    const settings = db.prepare("SELECT * FROM support_settings WHERE family_id = ?").get(family.id);
    if (!settings) {
      return res.status(400).json({ ok: false, message: "Configure a pensão antes de registrar um pagamento." });
    }

    const ref = req.body.monthRef || monthRef();
    const paidAt = parseDateInput(req.body.paidAt) || dayjs().format("YYYY-MM-DD");
    const dueDate = buildDueDate(ref, settings.due_day);
    const paymentAmount = parseMoneyInput(req.body.amount || settings.amount);
    const meta = getUploadMeta(req.file);
    const status = dayjs(paidAt).isAfter(dayjs(dueDate)) ? "paid_late" : "paid";
    const justification = sanitizeText(req.body.justification, 240);

    if (!req.file) {
      return res.status(400).json({ ok: false, message: "Anexe o comprovante para registrar o pagamento." });
    }

    if (!paymentAmount) {
      return res.status(400).json({ ok: false, message: "Informe um valor válido para o pagamento." });
    }

    db.prepare(`
      INSERT INTO support_payments (id, family_id, month_ref, amount, due_date, paid_at, status, justification, attachment_path, attachment_name, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(family_id, month_ref) DO UPDATE SET amount = excluded.amount, paid_at = excluded.paid_at, status = excluded.status, justification = excluded.justification, attachment_path = excluded.attachment_path, attachment_name = excluded.attachment_name, updated_at = excluded.updated_at
    `).run(
      nanoid(),
      family.id,
      ref,
      paymentAmount,
      dueDate,
      paidAt,
      status,
      justification,
      meta.attachmentPath,
      meta.attachmentName,
      req.user.id,
      nowIso(),
      nowIso()
    );

    notifyFamilyMembers(family.id, "support", "Pagamento registrado", `Foi registrado o pagamento referente a ${ref}.`, req.user.id);
    return created(res, { message: "Pagamento registrado." });
  } catch (error) {
    next(error);
  }
});

appRouter.post("/support/payments/:monthRef/status", (req, res, next) => {
  try {
    const { family } = requireFamily(req.user.id, selectedFamilyId(req));
    if (family.created_by !== req.user.id) {
      return res.status(403).json({ ok: false, message: "Apenas quem criou o painel pode alterar o status da pensao." });
    }

    const settings = db.prepare("SELECT * FROM support_settings WHERE family_id = ?").get(family.id);
    if (!settings) {
      return res.status(400).json({ ok: false, message: "Cadastre a pensao antes de alterar o status." });
    }

    const monthRefValue = String(req.params.monthRef || "").trim();
    const nextStatus = String(req.body.status || "").trim();
    if (!monthRefValue) {
      return res.status(400).json({ ok: false, message: "Mes de referencia invalido." });
    }

    if (!["pending", "overdue"].includes(nextStatus)) {
      return res.status(400).json({ ok: false, message: "Status invalido." });
    }

    const dueDate = buildDueDate(monthRefValue, settings.due_day);
    const existing = db.prepare("SELECT id FROM support_payments WHERE family_id = ? AND month_ref = ?").get(family.id, monthRefValue);

    if (existing) {
      db.prepare(`
        UPDATE support_payments
        SET due_date = ?, paid_at = NULL, status = ?, justification = '', attachment_path = NULL, attachment_name = NULL, updated_at = ?
        WHERE family_id = ? AND month_ref = ?
      `).run(dueDate, nextStatus, nowIso(), family.id, monthRefValue);
    } else {
      db.prepare(`
        INSERT INTO support_payments (id, family_id, month_ref, amount, due_date, paid_at, status, justification, attachment_path, attachment_name, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NULL, ?, '', NULL, NULL, ?, ?, ?)
      `).run(nanoid(), family.id, monthRefValue, settings.amount, dueDate, nextStatus, req.user.id, nowIso(), nowIso());
    }

    return ok(res, { message: nextStatus === "overdue" ? "Registro alterado para atrasado." : "Registro alterado para pendente." });
  } catch (error) {
    next(error);
  }
});

appRouter.post("/support/mark-overdue", (req, res, next) => {
  try {
    const { family, children } = requireFamily(req.user.id, selectedFamilyId(req));
    const settings = db.prepare("SELECT * FROM support_settings WHERE family_id = ?").get(family.id);
    if (!settings) {
      return ok(res, { updated: 0 });
    }

    const ref = req.body.monthRef || monthRef();
    const dueDate = buildDueDate(ref, settings.due_day);
    const existing = db.prepare("SELECT id FROM support_payments WHERE family_id = ? AND month_ref = ?").get(family.id, ref);

    if (!existing && isPast(dueDate)) {
      db.prepare(`
        INSERT INTO support_payments (id, family_id, month_ref, amount, due_date, paid_at, status, justification, attachment_path, attachment_name, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NULL, 'overdue', '', NULL, NULL, ?, ?, ?)
      `).run(nanoid(), family.id, ref, settings.amount, dueDate, req.user.id, nowIso(), nowIso());

      notifyFamilyMembers(family.id, "support_overdue", "Pensão em atraso", `O registro de ${ref} está pendente após o vencimento.`, null);
      return ok(res, { updated: 1 });
    }

    return ok(res, { updated: 0 });
  } catch (error) {
    next(error);
  }
});

appRouter.get("/expenses", (req, res, next) => {
  try {
    const { family, children } = requireFamily(req.user.id, selectedFamilyId(req));
    const rows = db.prepare(`
      SELECT e.*, u.name AS paid_by_name, c.name AS child_name
      FROM expenses e
      JOIN users u ON u.id = e.paid_by_user_id
      LEFT JOIN children c ON c.id = e.child_id
      WHERE e.family_id = ?
      ORDER BY e.expense_date DESC, e.created_at DESC
    `).all(family.id);
    const comments = db.prepare(`
      SELECT ec.*, u.name
      FROM expense_comments ec
      JOIN users u ON u.id = ec.user_id
      WHERE ec.expense_id IN (SELECT id FROM expenses WHERE family_id = ?)
      ORDER BY ec.created_at ASC
    `).all(family.id);
    return ok(res, { expenses: rows, comments });
  } catch (error) {
    next(error);
  }
});

appRouter.post("/expenses", upload.single("attachment"), (req, res, next) => {
  try {
    const { family, children } = requireFamily(req.user.id, selectedFamilyId(req));
    const description = sanitizeText(req.body.description, 180);
    required(description, "Descri????o");
    const amount = parseMoneyInput(req.body.amount);
    const expenseDate = parseDateInput(req.body.expenseDate);
    const childIds = Array.isArray(req.body.childIds)
      ? req.body.childIds
      : typeof req.body.childIds === "string" && req.body.childIds.trim()
        ? (() => {
            try {
              const parsed = JSON.parse(req.body.childIds);
              return Array.isArray(parsed) ? parsed : req.body.childIds.split(",");
            } catch {
              return req.body.childIds.split(",");
            }
          })()
        : req.body.childId
          ? [req.body.childId]
          : [];
    const allowedChildIds = new Set(children.map((child) => child.id));
    const normalizedChildIds = childIds
      .map((value) => String(value || "").trim())
      .filter((value, index, list) => value && list.indexOf(value) === index && allowedChildIds.has(value));
    if (!amount) {
      return res.status(400).json({ ok: false, message: "Informe um valor v??lido para a despesa." });
    }
    if (!expenseDate) {
      return res.status(400).json({ ok: false, message: "Informe a data da despesa." });
    }
    const meta = getUploadMeta(req.file);

    db.prepare(`
      INSERT INTO expenses (id, family_id, child_id, child_ids, category, amount, expense_date, description, paid_by_user_id, is_shared, attachment_path, attachment_name, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nanoid(),
      family.id,
      normalizedChildIds[0] || req.body.childId || null,
      normalizedChildIds.length ? JSON.stringify(normalizedChildIds) : null,
      sanitizeText(req.body.category, 50) || "outros",
      amount,
      expenseDate,
      description,
      req.body.paidByUserId || req.user.id,
      req.body.isShared === "true" || req.body.isShared === true ? 1 : 0,
      meta.attachmentPath,
      meta.attachmentName,
      req.user.id,
      nowIso(),
      nowIso()
    );

    notifyFamilyMembers(family.id, "expense", "Nova despesa cadastrada", description, req.user.id);
    return created(res, { message: "Despesa registrada." });
  } catch (error) {
    next(error);
  }
});

appRouter.post("/expenses/:id/comments", (req, res, next) => {
  try {
    const { family, children } = requireFamily(req.user.id, selectedFamilyId(req));
    const expense = db.prepare("SELECT id FROM expenses WHERE id = ? AND family_id = ?").get(req.params.id, family.id);
    if (!expense) {
      return res.status(404).json({ ok: false, message: "Despesa não encontrada." });
    }

    const content = sanitizeText(req.body.content, 240);
    required(content, "Comentário");
    db.prepare(`
      INSERT INTO expense_comments (id, expense_id, user_id, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(nanoid(), req.params.id, req.user.id, content, nowIso());

    return created(res, { message: "Comentário adicionado." });
  } catch (error) {
    next(error);
  }
});

appRouter.post("/expenses/:id/approve", (req, res, next) => {
  try {
    const { family } = requireFamily(req.user.id, selectedFamilyId(req));
    const expense = db.prepare("SELECT id FROM expenses WHERE id = ? AND family_id = ?").get(req.params.id, family.id);
    if (!expense) {
      return res.status(404).json({ ok: false, message: "Despesa não encontrada." });
    }

    db.prepare(`
      UPDATE expenses
      SET is_shared = 1, updated_at = ?
      WHERE id = ? AND family_id = ?
    `).run(nowIso(), req.params.id, family.id);

    return ok(res, { message: "Despesa aprovada." });
  } catch (error) {
    next(error);
  }
});

appRouter.put("/expenses/:id", upload.single("attachment"), (req, res, next) => {
  try {
    const { family, children } = requireFamily(req.user.id, selectedFamilyId(req));
    const existing = db.prepare("SELECT * FROM expenses WHERE id = ? AND family_id = ?").get(req.params.id, family.id);
    if (!existing) {
      return res.status(404).json({ ok: false, message: "Despesa não encontrada." });
    }
    if (existing.created_by !== req.user.id) {
      return res.status(403).json({ ok: false, message: "Apenas quem criou a despesa pode editar." });
    }

    const description = sanitizeText(req.body.description, 180);
    required(description, "Descrição");
    const amount = parseMoneyInput(req.body.amount);
    const expenseDate = parseDateInput(req.body.expenseDate);
    const childIds = Array.isArray(req.body.childIds)
      ? req.body.childIds
      : typeof req.body.childIds === "string" && req.body.childIds.trim()
        ? (() => {
            try {
              const parsed = JSON.parse(req.body.childIds);
              return Array.isArray(parsed) ? parsed : req.body.childIds.split(",");
            } catch {
              return req.body.childIds.split(",");
            }
          })()
        : req.body.childId
          ? [req.body.childId]
          : [];
    const allowedChildIds = new Set(children.map((child) => child.id));
    const normalizedChildIds = childIds
      .map((value) => String(value || "").trim())
      .filter((value, index, list) => value && list.indexOf(value) === index && allowedChildIds.has(value));

    if (!amount) {
      return res.status(400).json({ ok: false, message: "Informe um valor válido para a despesa." });
    }
    if (!expenseDate) {
      return res.status(400).json({ ok: false, message: "Informe a data da despesa." });
    }

    const meta = getUploadMeta(req.file);
    db.prepare(`
      UPDATE expenses
      SET child_id = ?, child_ids = ?, category = ?, amount = ?, expense_date = ?, description = ?, paid_by_user_id = ?, is_shared = ?, attachment_path = ?, attachment_name = ?, updated_at = ?
      WHERE id = ? AND family_id = ?
    `).run(
      normalizedChildIds[0] || req.body.childId || null,
      normalizedChildIds.length ? JSON.stringify(normalizedChildIds) : null,
      sanitizeText(req.body.category, 50) || "outros",
      amount,
      expenseDate,
      description,
      req.body.paidByUserId || req.user.id,
      req.body.isShared === "true" || req.body.isShared === true ? 1 : 0,
      req.file ? meta.attachmentPath : existing.attachment_path,
      req.file ? meta.attachmentName : existing.attachment_name,
      nowIso(),
      req.params.id,
      family.id
    );

    return ok(res, { message: "Despesa atualizada." });
  } catch (error) {
    next(error);
  }
});

appRouter.delete("/expenses/:id", (req, res, next) => {
  try {
    const { family } = requireFamily(req.user.id, selectedFamilyId(req));
    const existing = db.prepare("SELECT created_by FROM expenses WHERE id = ? AND family_id = ?").get(req.params.id, family.id);
    if (!existing) {
      return res.status(404).json({ ok: false, message: "Despesa não encontrada." });
    }
    if (existing.created_by !== req.user.id) {
      return res.status(403).json({ ok: false, message: "Apenas quem criou a despesa pode excluir." });
    }

    db.prepare("DELETE FROM expense_comments WHERE expense_id = ?").run(req.params.id);
    db.prepare("DELETE FROM expenses WHERE id = ? AND family_id = ?").run(req.params.id, family.id);
    return ok(res, { message: "Despesa excluída." });
  } catch (error) {
    next(error);
  }
});

appRouter.get("/calendar", (req, res, next) => {
  try {
    const { family, children } = requireFamily(req.user.id, selectedFamilyId(req));
    const events = db.prepare(`
      SELECT *
      FROM schedule_events
      WHERE family_id = ?
      ORDER BY event_date ASC, start_time ASC
    `).all(family.id);
    const swaps = db.prepare(`
      SELECT sr.*, u.name AS requested_by_name
      FROM swap_requests sr
      JOIN users u ON u.id = sr.requested_by
      WHERE sr.family_id = ?
      ORDER BY sr.created_at DESC
    `).all(family.id);
    return ok(res, { events, swaps });
  } catch (error) {
    next(error);
  }
});

appRouter.post("/calendar/events", (req, res, next) => {
  try {
    const { family, children } = requireFamily(req.user.id, selectedFamilyId(req));
    const title = sanitizeText(req.body.title, 120);
    const eventDate = parseDateInput(req.body.eventDate);
    const endDate = parseDateInput(req.body.endDate) || eventDate;
    const timestamp = nowIso();
    const eventId = nanoid();
    const childIds = Array.isArray(req.body.childIds)
      ? req.body.childIds
      : typeof req.body.childIds === "string" && req.body.childIds.trim()
        ? req.body.childIds.split(",")
        : req.body.childId
          ? [req.body.childId]
          : [];
    const allowedChildIds = new Set(children.map((child) => child.id));
    const normalizedChildIds = childIds
      .map((value) => String(value || "").trim())
      .filter((value, index, list) => value && list.indexOf(value) === index && allowedChildIds.has(value));
    required(eventDate, "Data do evento");
    required(title, "Título do evento");

    db.prepare(`
      INSERT INTO schedule_events (id, family_id, child_id, child_ids, title, event_date, end_date, start_time, end_time, event_type, responsible_side, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      family.id,
      normalizedChildIds[0] || req.body.childId || null,
      normalizedChildIds.length ? JSON.stringify(normalizedChildIds) : null,
      title,
      eventDate,
      endDate,
      req.body.startTime || null,
      req.body.endTime || null,
      sanitizeText(req.body.eventType, 40) || "convivencia",
      sanitizeText(req.body.responsibleSide, 20) || "mãe",
      sanitizeText(req.body.notes, 240),
      req.user.id,
      timestamp,
      timestamp
    );

    return created(res, {
      message: "Evento criado.",
      event: {
        id: eventId,
        family_id: family.id,
        child_id: normalizedChildIds[0] || req.body.childId || null,
        child_ids: normalizedChildIds,
        title,
        event_date: eventDate,
        end_date: endDate,
        start_time: req.body.startTime || null,
        end_time: req.body.endTime || null,
        event_type: sanitizeText(req.body.eventType, 40) || "convivencia",
        responsible_side: sanitizeText(req.body.responsibleSide, 20) || "mãe",
        notes: sanitizeText(req.body.notes, 240),
        created_by: req.user.id,
        created_at: timestamp,
        updated_at: timestamp
      }
    });
  } catch (error) {
    next(error);
  }
});

appRouter.put("/calendar/events/:id", (req, res, next) => {
  try {
    const { family, children } = requireFamily(req.user.id, selectedFamilyId(req));
    const title = sanitizeText(req.body.title, 120);
    const eventDate = parseDateInput(req.body.eventDate);
    const endDate = parseDateInput(req.body.endDate) || eventDate;
    const timestamp = nowIso();
    const childIds = Array.isArray(req.body.childIds)
      ? req.body.childIds
      : typeof req.body.childIds === "string" && req.body.childIds.trim()
        ? req.body.childIds.split(",")
        : req.body.childId
          ? [req.body.childId]
          : [];
    const allowedChildIds = new Set(children.map((child) => child.id));
    const normalizedChildIds = childIds
      .map((value) => String(value || "").trim())
      .filter((value, index, list) => value && list.indexOf(value) === index && allowedChildIds.has(value));
    required(eventDate, "Data do evento");
    required(title, "Título do evento");

    const existing = db.prepare("SELECT id, created_by, created_at FROM schedule_events WHERE id = ? AND family_id = ?").get(req.params.id, family.id);
    if (!existing) {
      return res.status(404).json({ ok: false, message: "Evento não encontrado." });
    }

    if (existing.created_by !== req.user.id) {
      const forbiddenError = new Error("Apenas quem criou o evento pode editar.");
      forbiddenError.status = 403;
      throw forbiddenError;
    }

    db.prepare(`
      UPDATE schedule_events
      SET child_id = ?, child_ids = ?, title = ?, event_date = ?, end_date = ?, start_time = ?, end_time = ?, event_type = ?, responsible_side = ?, notes = ?, updated_at = ?
      WHERE id = ? AND family_id = ?
    `).run(
      normalizedChildIds[0] || req.body.childId || null,
      normalizedChildIds.length ? JSON.stringify(normalizedChildIds) : null,
      title,
      eventDate,
      endDate,
      req.body.startTime || null,
      req.body.endTime || null,
      sanitizeText(req.body.eventType, 40) || "convivencia",
      sanitizeText(req.body.responsibleSide, 20) || "mãe",
      sanitizeText(req.body.notes, 240),
      timestamp,
      req.params.id,
      family.id
    );

    return ok(res, {
      message: "Evento atualizado.",
      event: {
        id: req.params.id,
        family_id: family.id,
        child_id: normalizedChildIds[0] || req.body.childId || null,
        child_ids: normalizedChildIds,
        title,
        event_date: eventDate,
        end_date: endDate,
        start_time: req.body.startTime || null,
        end_time: req.body.endTime || null,
        event_type: sanitizeText(req.body.eventType, 40) || "convivencia",
        responsible_side: sanitizeText(req.body.responsibleSide, 20) || "mãe",
        notes: sanitizeText(req.body.notes, 240),
        created_by: existing.created_by,
        created_at: existing.created_at,
        updated_at: timestamp
      }
    });
  } catch (error) {
    next(error);
  }
});

appRouter.delete("/calendar/events/:id", (req, res, next) => {
  try {
    const { family } = requireFamily(req.user.id, selectedFamilyId(req));
    const existing = db.prepare("SELECT created_by FROM schedule_events WHERE id = ? AND family_id = ?").get(req.params.id, family.id);
    if (!existing) {
      return res.status(404).json({ ok: false, message: "Evento não encontrado." });
    }
    if (existing.created_by !== req.user.id) {
      const forbiddenError = new Error("Apenas quem criou o evento pode excluir.");
      forbiddenError.status = 403;
      throw forbiddenError;
    }
    db.prepare("DELETE FROM swap_requests WHERE schedule_event_id = ? AND family_id = ?").run(req.params.id, family.id);
    db.prepare("DELETE FROM schedule_events WHERE id = ? AND family_id = ?").run(req.params.id, family.id);
    return ok(res, { message: "Evento removido." });
  } catch (error) {
    next(error);
  }
});

appRouter.post("/calendar/swaps", (req, res, next) => {
  try {
    const { family } = requireFamily(req.user.id, selectedFamilyId(req));
    const requestedDate = parseDateInput(req.body.requestedDate);
    const targetDate = parseDateInput(req.body.targetDate);
    required(requestedDate, "Data atual");
    required(targetDate, "Nova data proposta");

    db.prepare(`
      INSERT INTO swap_requests (id, family_id, schedule_event_id, requested_by, requested_date, target_date, reason, status, decision_note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, ?)
    `).run(
      nanoid(),
      family.id,
      req.body.scheduleEventId || null,
      req.user.id,
      requestedDate,
      targetDate,
      sanitizeText(req.body.reason, 240),
      nowIso(),
      nowIso()
    );

    notifyFamilyMembers(family.id, "swap", "Nova solicitação de troca", "Uma solicitação de troca de convivência foi criada.", req.user.id);
    return created(res, { message: "Solicitação enviada." });
  } catch (error) {
    next(error);
  }
});

appRouter.post("/calendar/swaps/:id/decision", (req, res, next) => {
  try {
    const { family } = requireFamily(req.user.id, selectedFamilyId(req));
    const status = req.body.status === "approved" ? "approved" : "rejected";

    db.prepare(`
      UPDATE swap_requests
      SET status = ?, decision_note = ?, updated_at = ?
      WHERE id = ? AND family_id = ?
    `).run(status, sanitizeText(req.body.decisionNote, 240), nowIso(), req.params.id, family.id);

    notifyFamilyMembers(family.id, "swap_decision", "Solicitação atualizada", `Uma solicitação de troca foi ${status === "approved" ? "aprovada" : "recusada"}.`, req.user.id);
    return ok(res, { message: "Status da solicitação atualizado." });
  } catch (error) {
    next(error);
  }
});

appRouter.get("/chat", (req, res, next) => {
  try {
    const { family } = requireFamily(req.user.id, selectedFamilyId(req));
    const messages = db.prepare(`
      SELECT m.*, u.name AS sender_name, u.avatar_color
      FROM chat_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.family_id = ?
      ORDER BY m.created_at ASC
    `).all(family.id);
    return ok(res, { messages });
  } catch (error) {
    next(error);
  }
});

appRouter.post("/chat", upload.fields([{ name: "attachments", maxCount: 10 }, { name: "attachment", maxCount: 1 }]), (req, res, next) => {
  try {
    const { family } = requireFamily(req.user.id, selectedFamilyId(req));
    const content = sanitizeText(req.body.content, 500);
    const files = [
      ...((req.files?.attachments || [])),
      ...((req.files?.attachment || []))
    ];

    if (!content && !files.length) {
      return res.status(400).json({ ok: false, message: "Escreva uma mensagem ou anexe um arquivo." });
    }

    const insertMessage = db.prepare(`
      INSERT INTO chat_messages (id, family_id, sender_id, content, attachment_path, attachment_name, created_at, read_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `);
    const timestamp = nowIso();

    if (content) {
      insertMessage.run(nanoid(), family.id, req.user.id, content, null, null, timestamp);
    }

    for (const file of files) {
      const meta = getUploadMeta(file);
      insertMessage.run(nanoid(), family.id, req.user.id, "", meta.attachmentPath, meta.attachmentName, nowIso());
    }

    notifyFamilyMembers(family.id, "chat", "Nova mensagem", content || (files.length > 1 ? `${files.length} arquivos enviados no chat.` : "Arquivo enviado no chat."), req.user.id);
    return created(res, { message: "Mensagem enviada." });
  } catch (error) {
    next(error);
  }
});

appRouter.post("/chat/read", (req, res, next) => {
  try {
    const { family } = requireFamily(req.user.id, selectedFamilyId(req));
    const timestamp = nowIso();

    db.prepare(`
      UPDATE chat_messages
      SET read_at = ?
      WHERE family_id = ? AND sender_id != ? AND read_at IS NULL
    `).run(timestamp, family.id, req.user.id);

    db.prepare(`
      UPDATE notifications
      SET is_read = 1
      WHERE family_id = ? AND user_id = ? AND type = 'chat' AND is_read = 0
    `).run(family.id, req.user.id);

    return ok(res, { message: "Mensagens marcadas como lidas." });
  } catch (error) {
    next(error);
  }
});

appRouter.get("/notifications", (req, res) => {
  const rows = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
  return ok(res, { notifications: rows });
});

appRouter.post("/notifications/read-all", (req, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(req.user.id);
  return ok(res, { message: "Notificações marcadas como lidas." });
});

appRouter.post("/notifications/pensao-atrasada/test", requireAdmin, async (req, res) => {
  const result = await runSupportReminderCycle({
    todayDate: sanitizeText(req.body.date, 20) || undefined,
    familyId: sanitizeText(req.body.familyId, 40) || "",
    forceStage: "overdue_daily"
  });
  return ok(res, result);
});

appRouter.post("/notifications/pensao-atrasada/run", requireAdmin, async (req, res) => {
  const result = await runSupportReminderCycle({
    todayDate: sanitizeText(req.body.date, 20) || undefined,
    familyId: sanitizeText(req.body.familyId, 40) || "",
    forceStage: ""
  });
  return ok(res, result);
});

appRouter.get("/push/public-key", (_req, res) => {
  return ok(res, { publicKey: getPushPublicKey(), enabled: isPushConfigured() });
});

appRouter.post("/push/subscribe", (req, res) => {
  savePushSubscription(req.user.id, req.body.subscription, req.headers["user-agent"] || "");
  return ok(res, { message: "Push ativado." });
});

appRouter.delete("/push/subscribe", (req, res) => {
  deletePushSubscription(req.user.id, req.body.endpoint || "");
  return ok(res, { message: "Push removido." });
});

appRouter.post("/notifications/test-chat", (req, res, next) => {
  try {
    if (env.isProduction || !req.user?.is_admin) {
      return res.status(404).json({ ok: false, message: "Rota não disponível." });
    }
    const context = getFamilyContext(req.user.id, selectedFamilyId(req));
    if (!context?.family?.id) {
      return res.status(400).json({ ok: false, message: "Nenhum painel familiar ativo para criar notificacao de teste." });
    }

    notifyFamilyMembers(
      context.family.id,
      "chat",
      "Nova mensagem de teste",
      "Teste de notificacao do chat para validar badge no web e mobile."
    );

    return created(res, { message: "Notificacao de teste criada." });
  } catch (error) {
    next(error);
  }
});

appRouter.get("/reports/:type", (req, res, next) => {
  try {
    const { family } = requireFamily(req.user.id, selectedFamilyId(req));
    if (req.params.type === "support") {
      const payments = db.prepare("SELECT * FROM support_payments WHERE family_id = ? ORDER BY month_ref DESC").all(family.id);
      return sendPdf(res, "relatorio-pensao-copais", [{
        heading: "Histórico de pensão",
        lines: payments.map((item) => `${item.month_ref} | status: ${item.status} | valor: R$ ${item.amount.toFixed(2)} | vencimento: ${item.due_date}`)
      }]);
    }

    if (req.params.type === "expenses") {
      const expenses = db.prepare("SELECT category, amount, expense_date, description FROM expenses WHERE family_id = ? ORDER BY expense_date DESC").all(family.id);
      return sendPdf(res, "relatorio-despesas-copais", [{
        heading: "Despesas por período",
        lines: expenses.map((item) => `${item.expense_date} | ${item.category} | R$ ${item.amount.toFixed(2)} | ${item.description}`)
      }]);
    }

    const events = db.prepare("SELECT event_date, title, event_type, notes FROM schedule_events WHERE family_id = ? ORDER BY event_date DESC").all(family.id);
    return sendPdf(res, "relatorio-calendario-copais", [{
      heading: "Calendário e ocorrências",
      lines: events.map((item) => `${item.event_date} | ${item.event_type} | ${item.title} | ${item.notes || "Sem observações"}`)
    }]);
  } catch (error) {
    next(error);
  }
});

appRouter.get("/info", (_req, res) => {
  return ok(res, {
    items: [
      "O CoParental organiza registros, comunicação e rotina da coparentalidade.",
      "A plataforma não substitui acompanhamento jurídico individual.",
      "Mantenha comprovantes, observações e dados da criança sempre atualizados.",
      "O histórico centralizado pode ajudar na organização documental da família."
    ]
  });
});

appRouter.get("/uploads/:filename", (req, res) => {
  const filePath = path.resolve(env.uploadDir, req.params.filename);
  const downloadName = sanitizeText(req.query.name, 180) || req.params.filename;

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, message: "Arquivo não encontrado." });
  }

  if (String(req.query.download || "") === "1") {
    return res.download(filePath, downloadName);
  }

  return res.sendFile(filePath);
});
