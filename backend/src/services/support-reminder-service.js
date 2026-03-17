import dayjs from "dayjs";
import { nanoid } from "nanoid";
import { db } from "../db/database.js";
import { notifyFamilyMembers } from "./notification-service.js";
import { sendWhatsAppMessage } from "./whatsapp-service.js";
import { sendEmail } from "./email-service.js";
import { buildDueDate, monthRef, nowIso } from "../utils/date.js";

const dispatchInsert = db.prepare(`
  INSERT OR IGNORE INTO support_reminder_dispatches (
    id, family_id, user_id, month_ref, stage, channel, dispatched_for, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const paymentLookup = db.prepare(`
  SELECT *
  FROM support_payments
  WHERE family_id = ? AND month_ref = ?
`);

const paymentInsert = db.prepare(`
  INSERT INTO support_payments (
    id, family_id, month_ref, amount, due_date, paid_at, status, justification,
    attachment_path, attachment_name, last_notification_at, notification_status,
    notification_error, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, NULL, 'overdue', '', NULL, NULL, NULL, NULL, NULL, ?, ?, ?)
`);

const paymentNotificationUpdate = db.prepare(`
  UPDATE support_payments
  SET last_notification_at = ?, notification_status = ?, notification_error = ?, updated_at = ?
  WHERE id = ?
`);

function isPaidStatus(status) {
  return status === "paid" || status === "paid_late";
}

function buildReminderContent({ familyName, ref, dueDate, amount, stage }) {
  const amountText = Number(amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dueText = dayjs(dueDate).format("DD/MM/YYYY");

  if (stage === "before_5") {
    return {
      title: "Lembrete de pensão",
      content: `Faltam 5 dias para o vencimento da pensão do painel ${familyName}. Referência ${ref}, valor ${amountText}, vencimento em ${dueText}.`
    };
  }

  if (stage === "before_1") {
    return {
      title: "Lembrete de pensão",
      content: `A pensão do painel ${familyName} vence amanhã. Referência ${ref}, valor ${amountText}, vencimento em ${dueText}.`
    };
  }

  if (stage === "due_today") {
    return {
      title: "Pensão vence hoje",
      content: `A pensão do painel ${familyName} vence hoje. Referência ${ref}, valor ${amountText}. Envie o comprovante no app assim que efetuar o pagamento.`
    };
  }

  return {
    title: "Pensão em atraso",
    content: `Olá, identificamos uma pensão em atraso no painel ${familyName}. Valor ${amountText}, vencimento em ${dueText}. Pedimos que verifique a pendência no CoParental para regularização. A falta de pagamento pode gerar cobrança judicial, protesto do débito e prisão civil, nos termos do art. 528 do CPC e da Lei 5.478/1968.`
  };
}

function buildEmailHtml({ name, familyName, amount, dueDate, content }) {
  const amountText = Number(amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dueText = dayjs(dueDate).format("DD/MM/YYYY");

  return [
    `<p>Olá, ${name}.</p>`,
    `<p>${content}</p>`,
    `<p><strong>Painel:</strong> ${familyName}</p>`,
    `<p><strong>Valor:</strong> ${amountText}</p>`,
    `<p><strong>Vencimento:</strong> ${dueText}</p>`,
    "<p>Acesse o CoParental para verificar a pendência e registrar o comprovante, caso o pagamento já tenha sido realizado.</p>"
  ].join("");
}

function resolveStage(todayDate, dueDate, forcedStage = "") {
  if (forcedStage) {
    return forcedStage;
  }

  const diff = dayjs(dueDate).startOf("day").diff(dayjs(todayDate).startOf("day"), "day");
  if (diff === 5) {
    return "before_5";
  }
  if (diff === 1) {
    return "before_1";
  }
  if (diff === 0) {
    return "due_today";
  }
  if (diff < 0) {
    return "overdue_daily";
  }
  return "";
}

function markDispatch({ familyId, userId, ref, stage, channel, dispatchedFor }) {
  const result = dispatchInsert.run(nanoid(), familyId, userId, ref, stage, channel, dispatchedFor, nowIso());
  return result.changes > 0;
}

function ensureSupportPaymentRecord({ payment, familyId, ref, dueDate, amount, createdBy }) {
  if (payment) {
    return payment;
  }

  const timestamp = nowIso();
  const id = nanoid();
  paymentInsert.run(id, familyId, ref, amount, dueDate, createdBy, timestamp, timestamp);
  return paymentLookup.get(familyId, ref);
}

function updatePaymentNotificationState(paymentId, details) {
  const timestamp = nowIso();
  paymentNotificationUpdate.run(timestamp, details.status, details.error || null, timestamp, paymentId);
}

async function notifyFather({ familyId, userId, phone, email, name, title, content, emailHtml, ref, stage, dispatchedFor }) {
  const errors = [];

  const appCreated = markDispatch({ familyId, userId, ref, stage, channel: "app", dispatchedFor });
  if (appCreated) {
    notifyFamilyMembers(familyId, stage.startsWith("overdue") ? "support_overdue" : "support_reminder", title, content, null, [userId]);
  }

  let whatsappCreated = false;
  let whatsappResult = null;
  if (!phone) {
    errors.push("missing_phone");
  } else {
    whatsappCreated = markDispatch({ familyId, userId, ref, stage, channel: "whatsapp", dispatchedFor });
    if (whatsappCreated) {
      whatsappResult = await sendWhatsAppMessage({
        to: phone,
        message: `${title}\n\n${content}`,
        meta: { familyId, userId, monthRef: ref, stage, channel: "whatsapp" }
      });

      if (!whatsappResult.ok && !whatsappResult.skipped) {
        errors.push(`whatsapp:${whatsappResult.error || "send_failed"}`);
      }
    }
  }

  let emailCreated = false;
  let emailResult = { ok: false, skipped: true };
  if (stage === "overdue_daily") {
    if (!email) {
      errors.push("missing_email");
    } else {
      emailCreated = markDispatch({ familyId, userId, ref, stage, channel: "email", dispatchedFor });
      if (emailCreated) {
        try {
          await sendEmail({
            to: email,
            subject: title,
            html: emailHtml,
            meta: { familyId, userId, monthRef: ref, stage, type: "support-overdue-email" }
          });
          emailResult = { ok: true };
        } catch (error) {
          emailResult = { ok: false, error: error instanceof Error ? error.message : "email_send_failed" };
          errors.push(`email:${emailResult.error}`);
        }
      }
    }
  }

  if (!appCreated && !whatsappCreated && !emailCreated && !errors.length) {
    return {
      appCreated,
      whatsappCreated,
      whatsappOk: Boolean(whatsappResult?.ok),
      whatsappMode: whatsappResult?.mode || "",
      emailCreated,
      emailOk: Boolean(emailResult?.ok),
      notificationStatus: "duplicate_skip",
      notificationError: ""
    };
  }

  const sentChannels = [
    appCreated ? "app" : "",
    whatsappCreated && whatsappResult?.ok ? "whatsapp" : "",
    emailCreated && emailResult?.ok ? "email" : ""
  ].filter(Boolean);

  return {
    appCreated,
    whatsappCreated,
    whatsappOk: Boolean(whatsappResult?.ok),
    whatsappMode: whatsappResult?.mode || "",
    emailCreated,
    emailOk: Boolean(emailResult?.ok),
    notificationStatus: sentChannels.length ? (errors.length ? "partial" : "sent") : "error",
    notificationError: errors.join(" | ")
  };
}

export async function runSupportReminderCycle({ todayDate = dayjs().format("YYYY-MM-DD"), familyId = "", forceStage = "" } = {}) {
  const settingsRows = db.prepare(`
    SELECT s.family_id, s.amount, s.due_day, f.name AS family_name, f.created_by
    FROM support_settings s
    JOIN families f ON f.id = s.family_id
    ${familyId ? "WHERE s.family_id = ?" : ""}
  `).all(...(familyId ? [familyId] : []));

  const results = [];

  for (const settings of settingsRows) {
    const targetMonthRef = monthRef(todayDate);
    const dueDate = buildDueDate(targetMonthRef, settings.due_day);
    const stage = resolveStage(todayDate, dueDate, forceStage);
    if (!stage) {
      continue;
    }

    const existingPayment = paymentLookup.get(settings.family_id, targetMonthRef);
    if (existingPayment && isPaidStatus(existingPayment.status)) {
      continue;
    }

    if (!forceStage && dayjs(todayDate).startOf("day").isBefore(dayjs(dueDate).startOf("day")) && stage === "overdue_daily") {
      continue;
    }

    const payment = ensureSupportPaymentRecord({
      payment: existingPayment,
      familyId: settings.family_id,
      ref: targetMonthRef,
      dueDate,
      amount: settings.amount,
      createdBy: settings.created_by
    });

    const fathers = db.prepare(`
      SELECT u.id, u.name, u.phone, u.email
      FROM family_members fm
      JOIN users u ON u.id = fm.user_id
      WHERE fm.family_id = ? AND fm.status = 'active' AND LOWER(fm.relation_label) LIKE '%pai%'
    `).all(settings.family_id);

    if (!fathers.length) {
      updatePaymentNotificationState(payment.id, {
        status: "error",
        error: "missing_responsible"
      });
      results.push({
        familyId: settings.family_id,
        familyName: settings.family_name,
        userId: null,
        userName: "",
        monthRef: targetMonthRef,
        stage,
        notificationStatus: "error",
        notificationError: "missing_responsible"
      });
      continue;
    }

    const reminder = buildReminderContent({
      familyName: settings.family_name,
      ref: targetMonthRef,
      dueDate,
      amount: settings.amount,
      stage
    });

    for (const father of fathers) {
      const dispatch = await notifyFather({
        familyId: settings.family_id,
        userId: father.id,
        phone: father.phone,
        email: father.email,
        name: father.name,
        title: reminder.title,
        content: reminder.content,
        emailHtml: buildEmailHtml({
          name: father.name,
          familyName: settings.family_name,
          amount: settings.amount,
          dueDate,
          content: reminder.content
        }),
        ref: targetMonthRef,
        stage,
        dispatchedFor: todayDate
      });

      if (dispatch.notificationStatus !== "duplicate_skip") {
        updatePaymentNotificationState(payment.id, {
          status: dispatch.notificationStatus,
          error: dispatch.notificationError
        });
      }

      results.push({
        familyId: settings.family_id,
        familyName: settings.family_name,
        userId: father.id,
        userName: father.name,
        phone: father.phone,
        email: father.email,
        monthRef: targetMonthRef,
        dueDate,
        amount: settings.amount,
        stage,
        ...dispatch
      });
    }
  }

  return { total: results.length, results };
}
