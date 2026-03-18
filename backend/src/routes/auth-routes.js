import express from "express";
import { nanoid } from "nanoid";
import { db } from "../db/database.js";
import { requireAuth } from "../middleware/auth.js";
import { ok, created } from "../utils/http.js";
import { comparePassword, hashPassword, signToken } from "../utils/security.js";
import { assertEmail, assertPassword, normalizeEmail, required, sanitizeText } from "../utils/validation.js";
import { nowIso } from "../utils/date.js";
import { writeAuditLog } from "../services/audit-service.js";
import { sendEmail } from "../services/email-service.js";
import { createActivationToken, createPasswordResetCode, createPasswordResetToken, consumeActivationToken, consumePasswordResetCode, consumePasswordResetToken } from "../services/token-service.js";
import { env } from "../config/env.js";
import { markLogin } from "../services/subscription-service.js";
import { acceptInvitation, getInvitationPreview } from "../services/family-service.js";

export const authRouter = express.Router();

function setSessionCookie(res, token, remember) {
  res.cookie("copais_token", token, {
    httpOnly: true,
    sameSite: env.cookieSameSite,
    secure: env.cookieSecure,
    maxAge: remember ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 8
  });
}

authRouter.post("/register", async (req, res, next) => {
  try {
    const name = sanitizeText(req.body.name, 80);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    required(name, "Nome");
    assertEmail(email);
    assertPassword(password);

    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (exists) {
      return res.status(409).json({ ok: false, message: "Este e-mail já está cadastrado." });
    }

    const timestamp = nowIso();
    const userId = nanoid();
    const passwordHash = await hashPassword(password);

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, phone, role_label, avatar_color, is_admin, account_status, activation_state, activated_at, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, '', 'Responsável', '#5aa3c7', 0, 'active', 'completed', ?, NULL, ?, ?)
    `).run(userId, name, email, passwordHash, timestamp, timestamp, timestamp);

    const token = signToken({ userId });
    setSessionCookie(res, token, true);
    writeAuditLog({ userId, action: "user_registered", entityType: "user", entityId: userId });

    return created(res, { user: { id: userId, name, email }, needsOnboarding: true });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/subscription-register", async (req, res, next) => {
  try {
    const name = sanitizeText(req.body.name, 80);
    const email = normalizeEmail(req.body.email);
    const phone = sanitizeText(req.body.phone, 40);
    const password = String(req.body.password || "");

    required(name, "Nome");
    assertEmail(email);
    assertPassword(password);

    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (exists) {
      return res.status(409).json({ ok: false, message: "Este e-mail já está cadastrado." });
    }

    const timestamp = nowIso();
    const userId = nanoid();
    const passwordHash = await hashPassword(password);

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, phone, role_label, avatar_color, is_admin, account_status, activation_state, activated_at, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Responsável', '#5aa3c7', 0, 'active', 'completed', ?, NULL, ?, ?)
    `).run(userId, name, email, passwordHash, phone, timestamp, timestamp, timestamp);

    const token = signToken({ userId });
    setSessionCookie(res, token, true);
    writeAuditLog({ userId, action: "user_registered_after_payment", entityType: "user", entityId: userId });

    return created(res, {
      user: { id: userId, name, email, phone },
      needsOnboarding: true
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/invitations/:token", (req, res) => {
  const token = String(req.params.token || "").trim();
  required(token, "Token do convite");
  const invitation = getInvitationPreview(token);
  if (!invitation) {
    return res.status(404).json({ ok: false, message: "Convite não encontrado ou expirado." });
  }
  return ok(res, { invitation });
});

authRouter.post("/invitations/register", async (req, res, next) => {
  try {
    const token = String(req.body.token || "").trim();
    const name = sanitizeText(req.body.name, 80);
    const email = normalizeEmail(req.body.email);
    const phone = sanitizeText(req.body.phone, 40);
    const password = String(req.body.password || "");

    required(token, "Token do convite");
    required(name, "Nome");
    assertEmail(email);
    assertPassword(password);

    const invitation = getInvitationPreview(token);
    if (!invitation) {
      return res.status(404).json({ ok: false, message: "Convite não encontrado ou expirado." });
    }

    if (invitation.email && normalizeEmail(invitation.email) !== email) {
      return res.status(400).json({ ok: false, message: "Use o mesmo e-mail informado no convite." });
    }

    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (exists) {
      return res.status(409).json({ ok: false, message: "Este e-mail já está cadastrado." });
    }

    const timestamp = nowIso();
    const userId = nanoid();
    const passwordHash = await hashPassword(password);

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, phone, role_label, avatar_color, is_admin, account_status, activation_state, activated_at, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Responsável vinculado', '#5aa3c7', 0, 'active', 'completed', ?, NULL, ?, ?)
    `).run(userId, name, email, passwordHash, phone, timestamp, timestamp, timestamp);

    acceptInvitation(userId, token);

    const sessionToken = signToken({ userId });
    setSessionCookie(res, sessionToken, true);
    writeAuditLog({ userId, action: "user_registered_by_invite", entityType: "user", entityId: userId, details: { familyId: invitation.familyId } });

    return created(res, {
      user: { id: userId, name, email, phone },
      familyId: invitation.familyId,
      message: "Conta criada e convite aceito com sucesso."
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const remember = Boolean(req.body.remember);

    assertEmail(email);
    required(password, "Senha");

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user) {
      const pendingEvent = db.prepare("SELECT id FROM hotmart_events WHERE customer_email = ? ORDER BY created_at DESC LIMIT 1").get(email);
      if (pendingEvent) {
        return res.status(202).json({ ok: false, message: "Sua compra foi aprovada e sua conta ainda está em processamento. Tente novamente em instantes." });
      }
      return res.status(401).json({ ok: false, message: "E-mail ou senha inválidos." });
    }

    if (user.activation_state === "pending") {
      return res.status(403).json({ ok: false, message: "Sua conta foi criada. Verifique seu e-mail para ativar a senha inicial." });
    }

    if (user.account_status === "suspended") {
      return res.status(403).json({ ok: false, message: "Seu acesso está suspenso. Fale com o suporte responsável." });
    }

    if (!(await comparePassword(password, user.password_hash))) {
      return res.status(401).json({ ok: false, message: "E-mail ou senha inválidos." });
    }

    const token = signToken({ userId: user.id });
    setSessionCookie(res, token, remember);
    markLogin(user.id);
    writeAuditLog({ userId: user.id, action: "user_login", entityType: "user", entityId: user.id });

    return ok(res, {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        roleLabel: user.role_label,
        avatarColor: user.avatar_color,
        isAdmin: Boolean(user.is_admin)
      }
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", (req, res) => {
  if (req.user?.id) {
    writeAuditLog({ userId: req.user.id, action: "user_logout", entityType: "user", entityId: req.user.id });
  }
  res.clearCookie("copais_token", {
    httpOnly: true,
    sameSite: env.cookieSameSite,
    secure: env.cookieSecure
  });
  return ok(res, { message: "Sessão encerrada." });
});

authRouter.get("/me", requireAuth, (req, res) => ok(res, { user: req.user }));

authRouter.put("/profile", requireAuth, async (req, res, next) => {
  try {
    const name = sanitizeText(req.body.name, 80);
    const email = normalizeEmail(req.body.email);
    const phone = sanitizeText(req.body.phone, 30);
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    required(name, "Nome");
    assertEmail(email);

    const existing = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, req.user.id);
    if (existing) {
      return res.status(409).json({ ok: false, message: "Este e-mail já está em uso por outro perfil." });
    }

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    let passwordHash = user.password_hash;

    if (newPassword) {
      required(currentPassword, "Senha atual");
      const matches = await comparePassword(currentPassword, user.password_hash);
      if (!matches) {
        return res.status(400).json({ ok: false, message: "A senha atual não confere." });
      }
      assertPassword(newPassword);
      passwordHash = await hashPassword(newPassword);
    }

    db.prepare(`
      UPDATE users
      SET name = ?, email = ?, phone = ?, password_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(name, email, phone, passwordHash, nowIso(), req.user.id);

    writeAuditLog({ userId: req.user.id, action: "profile_updated", entityType: "user", entityId: req.user.id });
    return ok(res, { message: "Perfil atualizado com sucesso." });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/forgot-password", (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    assertEmail(email);
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user) {
      return ok(res, { message: "Se existir uma conta vinculada a este e-mail, enviaremos as instruções de acesso." });
    }

    const code = createPasswordResetCode(user.id);
    sendEmail({
      to: user.email,
      subject: "Redefinição de senha CoParental",
      html: `<p>Olá, ${user.name}.</p><p>Use este código para redefinir sua senha no CoParental:</p><p><strong style="font-size:20px;letter-spacing:4px;">${code}</strong></p><p>O código expira em 1 hora.</p>`,
      meta: { code, type: "password-reset-code" }
    });
    writeAuditLog({ userId: user.id, action: "password_reset_requested", entityType: "user", entityId: user.id });
    return ok(res, { message: "Se existir uma conta vinculada a este e-mail, enviaremos um código de redefinição." });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/reset-password", async (req, res, next) => {
  try {
    const token = String(req.body.token || "");
    const email = normalizeEmail(req.body.email || "");
    const code = String(req.body.code || "").trim();
    const password = String(req.body.password || "");
    assertPassword(password);
    let row = null;

    if (token) {
      row = consumePasswordResetToken(token);
    } else {
      assertEmail(email);
      required(code, "Código");
      const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (user) {
        row = consumePasswordResetCode(user.id, code);
      }
    }

    if (!row) {
      return res.status(400).json({ ok: false, message: token ? "O link de redefinição é inválido ou expirou." : "O código de redefinição é inválido ou expirou." });
    }

    const passwordHash = await hashPassword(password);
    db.prepare("UPDATE users SET password_hash = ?, activation_state = 'completed', activated_at = COALESCE(activated_at, ?), updated_at = ? WHERE id = ?")
      .run(passwordHash, nowIso(), nowIso(), row.user_id);
    writeAuditLog({ userId: row.user_id, action: "password_reset_completed", entityType: "user", entityId: row.user_id });
    return ok(res, { message: "Senha redefinida com sucesso." });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/activate-account", async (req, res, next) => {
  try {
    const token = String(req.body.token || "");
    const password = String(req.body.password || "");
    required(token, "Token");
    assertPassword(password);
    const row = consumeActivationToken(token);
    if (!row) {
      return res.status(400).json({ ok: false, message: "O link de ativação é inválido ou expirou." });
    }

    const passwordHash = await hashPassword(password);
    db.prepare(`
      UPDATE users
      SET password_hash = ?, activation_state = 'completed', account_status = CASE WHEN account_status = 'pending' THEN 'active' ELSE account_status END,
          activated_at = ?, updated_at = ?
      WHERE id = ?
    `).run(passwordHash, nowIso(), nowIso(), row.user_id);
    writeAuditLog({ userId: row.user_id, action: "account_activated", entityType: "user", entityId: row.user_id });
    return ok(res, { message: "Conta ativada com sucesso. Você já pode entrar." });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/resend-activation", (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    assertEmail(email);
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user) {
      return ok(res, { message: "Se a conta existir, o e-mail de ativação será reenviado." });
    }

    const token = createActivationToken(user.id);
    const activationLink = `${env.appBaseUrl}/ativar-conta?token=${token}`;
    sendEmail({
      to: user.email,
      subject: "Ative sua conta CoParental",
      html: `<p>Olá, ${user.name}.</p><p>Defina sua senha inicial em: <a href="${activationLink}">${activationLink}</a></p>`,
      meta: { activationLink, type: "activation" }
    });
    writeAuditLog({ userId: user.id, action: "activation_resent", entityType: "user", entityId: user.id });
    return ok(res, { message: "Se a conta existir, o e-mail de ativação será reenviado." });
  } catch (error) {
    next(error);
  }
});
