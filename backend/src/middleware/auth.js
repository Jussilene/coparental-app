import { db } from "../db/database.js";
import { verifyToken } from "../utils/security.js";

export function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.copais_token;
    if (!token) {
      return res.status(401).json({ ok: false, message: "Sessão expirada. Faça login novamente." });
    }

    const payload = verifyToken(token);
    const user = db.prepare(`
      SELECT
        u.id, u.name, u.email, u.phone, u.role_label, u.avatar_color, u.is_admin, u.account_status, u.activation_state, u.activated_at, u.last_login_at,
        s.status AS subscription_status, s.billing_status, s.plan_name, s.purchase_date, s.renewal_date
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
      WHERE u.id = ?
    `).get(payload.userId);

    if (!user) {
      return res.status(401).json({ ok: false, message: "Usuário não encontrado." });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "Autenticação inválida." });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ ok: false, message: "Acesso restrito ao CRM administrativo." });
  }
  next();
}

export function requireActiveSubscription(req, res, next) {
  if (req.user?.is_admin) {
    return next();
  }

  const blocked = new Set(["late", "canceled", "expired", "suspended"]);
  const status = req.user?.subscription_status || req.user?.account_status;
  if (blocked.has(status)) {
    return res.status(402).json({
      ok: false,
      code: "SUBSCRIPTION_REQUIRED",
      message: "Sua assinatura está pendente. Regularize para continuar usando o CoParental."
    });
  }

  next();
}
