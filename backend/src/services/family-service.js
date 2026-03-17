import { nanoid } from "nanoid";
import { db } from "../db/database.js";
import { nowIso } from "../utils/date.js";
import { assertEmail, required, sanitizeText } from "../utils/validation.js";

function normalizeBrokenText(value) {
  if (typeof value !== "string") {
    return value;
  }

  return value
    .replaceAll("Fam?lia", "Família")
    .replaceAll("ResponsÃ¡vel", "Responsável")
    .replaceAll("MÃ£e", "Mãe")
    .replaceAll("Ã¡rea", "área")
    .replaceAll("crianÃ§a", "criança")
    .replaceAll("nÃ£o", "não");
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
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

function mapFamilySummary(family) {
  const children = db.prepare(`
    SELECT id, name, birth_date, notes
    FROM children
    WHERE family_id = ?
    ORDER BY created_at ASC
  `).all(family.id);

  const members = db.prepare(`
    SELECT u.id AS user_id, u.name, u.email, fm.relation_label
    FROM family_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE fm.family_id = ?
    ORDER BY fm.created_at ASC
  `).all(family.id);

  return {
    id: family.id,
    name: normalizeBrokenText(family.name),
    counterpartName: normalizeBrokenText(family.counterpart_name || ""),
    counterpartEmail: family.counterpart_email || "",
    createdAt: family.created_at,
    childCount: children.length,
    childNames: children.map((item) => item.name),
    children,
    memberCount: members.length,
    members
  };
}

function normalizeChildren(children) {
  const source = Array.isArray(children) ? children : [];
  return source
    .map((child) => ({
      name: sanitizeText(child?.name, 80),
      birthDate: normalizeDate(child?.birthDate || child?.birth_date || null),
      notes: sanitizeText(child?.notes, 240)
    }))
    .filter((child) => child.name);
}

function normalizeGroups(payload) {
  if (Array.isArray(payload?.groups) && payload.groups.length) {
    return payload.groups.map((group, index) => ({
      id: group?.id || null,
      familyName: sanitizeText(group?.familyName || payload.familyName, 120),
      relationLabel: sanitizeText(group?.relationLabel || payload.relationLabel || "Responsável 1", 60),
      inviteEmail: sanitizeText(group?.inviteEmail, 120) || null,
      inviteRelationLabel: sanitizeText(group?.inviteRelationLabel || "Responsável 2", 60),
      children: normalizeChildren(group?.children).map((child, childIndex) => ({
        ...child,
        id: group?.children?.[childIndex]?.id || null
      })),
      sortIndex: index
    }));
  }

  return [{
    id: payload?.id || null,
    familyName: sanitizeText(payload?.familyName, 120),
    relationLabel: sanitizeText(payload?.relationLabel || "Responsável 1", 60),
    inviteEmail: sanitizeText(payload?.inviteEmail, 120) || null,
    inviteRelationLabel: sanitizeText(payload?.inviteRelationLabel || "Responsável 2", 60),
    children: normalizeChildren([
      {
        name: payload?.childName,
        birthDate: payload?.childBirthDate
      }
    ]),
    sortIndex: 0
  }];
}

export function getUserFamilies(userId) {
  const rows = db.prepare(`
    SELECT DISTINCT f.*
    FROM families f
    JOIN family_members fm ON fm.family_id = f.id
    WHERE fm.user_id = ? AND fm.status = 'active'
    ORDER BY f.created_at ASC
  `).all(userId);

  return rows.map(mapFamilySummary);
}

export function resolveFamilyId(userId, requestedFamilyId) {
  const requested = requestedFamilyId
    ? db.prepare(`
        SELECT f.id
        FROM families f
        JOIN family_members fm ON fm.family_id = f.id
        WHERE f.id = ? AND fm.user_id = ? AND fm.status = 'active'
      `).get(requestedFamilyId, userId)
    : null;

  if (requested?.id) {
    return requested.id;
  }

  const family = db.prepare(`
        SELECT f.id
        FROM families f
        JOIN family_members fm ON fm.family_id = f.id
        WHERE fm.user_id = ? AND fm.status = 'active'
        ORDER BY f.created_at ASC
        LIMIT 1
      `).get(userId);

  return family?.id || null;
}

export function getFamilyContext(userId, requestedFamilyId) {
  const activeFamilyId = resolveFamilyId(userId, requestedFamilyId);
  const families = getUserFamilies(userId);

  if (!activeFamilyId) {
    return null;
  }

  const family = db.prepare("SELECT * FROM families WHERE id = ?").get(activeFamilyId);
  const members = db.prepare(`
    SELECT fm.id, fm.relation_label, fm.status, u.id AS user_id, u.name, u.email, u.phone, u.role_label, u.avatar_color
    FROM family_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE fm.family_id = ?
    ORDER BY fm.created_at ASC
  `).all(activeFamilyId);

  const children = db.prepare(`
    SELECT *
    FROM children
    WHERE family_id = ?
    ORDER BY created_at ASC
  `).all(activeFamilyId);

  const invitation = db.prepare(`
    SELECT id, email, relation_label, token, status, expires_at
    FROM invitations
    WHERE family_id = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(activeFamilyId);

  return {
    family,
    families,
    members,
    children,
    invitation
  };
}

export function requireFamily(userId, requestedFamilyId) {
  const context = getFamilyContext(userId, requestedFamilyId);
  if (!context) {
    const error = new Error("Finalize o onboarding para acessar esta área.");
    error.status = 400;
    throw error;
  }
  return context;
}

function ensureOwnedFamily(userId, familyId) {
  if (!familyId) {
    return null;
  }

  return db.prepare(`
    SELECT f.*
    FROM families f
    JOIN family_members fm ON fm.family_id = f.id
    WHERE f.id = ? AND fm.user_id = ? AND fm.status = 'active'
  `).get(familyId, userId);
}

function syncChildrenForFamily(familyId, children, timestamp) {
  const existingChildren = db.prepare(`
    SELECT id
    FROM children
    WHERE family_id = ?
    ORDER BY created_at ASC
  `).all(familyId);

  const keptIds = new Set();

  for (const child of children) {
    if (child.id) {
      const exists = existingChildren.find((item) => item.id === child.id);
      if (exists) {
        db.prepare(`
          UPDATE children
          SET name = ?, birth_date = ?, notes = ?, updated_at = ?
          WHERE id = ? AND family_id = ?
        `).run(child.name, child.birthDate, child.notes || "", timestamp, child.id, familyId);
        keptIds.add(child.id);
        continue;
      }
    }

    const childId = nanoid();
    db.prepare(`
      INSERT INTO children (id, family_id, name, birth_date, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(childId, familyId, child.name, child.birthDate, child.notes || "", timestamp, timestamp);
    keptIds.add(childId);
  }

  for (const existing of existingChildren) {
    if (keptIds.has(existing.id)) {
      continue;
    }

    const hasUsage = db.prepare(`
      SELECT
        EXISTS(SELECT 1 FROM expenses WHERE child_id = ?) AS expense_used,
        EXISTS(SELECT 1 FROM schedule_events WHERE child_id = ?) AS event_used
    `).get(existing.id, existing.id);

    if (!hasUsage.expense_used && !hasUsage.event_used) {
      db.prepare("DELETE FROM children WHERE id = ? AND family_id = ?").run(existing.id, familyId);
    }
  }
}

function upsertInvitation(familyId, inviteEmail, inviteRelationLabel, timestamp) {
  const activeMember = inviteEmail
    ? db.prepare(`
        SELECT u.id
        FROM family_members fm
        JOIN users u ON u.id = fm.user_id
        WHERE fm.family_id = ? AND LOWER(u.email) = LOWER(?) AND fm.status = 'active'
      `).get(familyId, inviteEmail)
    : null;

  if (activeMember) {
    return null;
  }

  const pendingInvite = db.prepare(`
    SELECT *
    FROM invitations
    WHERE family_id = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(familyId);

  if (!inviteEmail) {
    if (pendingInvite) {
      db.prepare("UPDATE invitations SET status = 'canceled' WHERE id = ?").run(pendingInvite.id);
    }
    return null;
  }

  if (pendingInvite) {
    db.prepare(`
      UPDATE invitations
      SET email = ?, relation_label = ?, created_at = ?
      WHERE id = ?
    `).run(inviteEmail, inviteRelationLabel, timestamp, pendingInvite.id);

    return {
      id: pendingInvite.id,
      familyId,
      email: inviteEmail,
      relationLabel: inviteRelationLabel,
      token: pendingInvite.token,
      expiresAt: pendingInvite.expires_at
    };
  }

  const token = nanoid(18);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const invitationId = nanoid();
  db.prepare(`
    INSERT INTO invitations (id, family_id, email, relation_label, token, status, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(invitationId, familyId, inviteEmail, inviteRelationLabel, token, expiresAt, timestamp);

  return {
    id: invitationId,
    familyId,
    email: inviteEmail,
    relationLabel: inviteRelationLabel,
    token,
    expiresAt
  };
}

export function createFamilySetup(userId, payload) {
  const timestamp = nowIso();
  const groups = normalizeGroups(payload);
  const createdFamilies = [];
  const invitations = [];

  if (!groups.length) {
    const error = new Error("Adicione pelo menos um painel familiar.");
    error.status = 400;
    throw error;
  }

  for (const group of groups) {
    required(group.familyName, "Nome do painel familiar");
    if (!group.children.length) {
      const error = new Error("Cada painel precisa ter pelo menos uma criança.");
      error.status = 400;
      throw error;
    }

    if (group.inviteEmail) {
      assertEmail(group.inviteEmail);
    }

    const existingFamily = ensureOwnedFamily(userId, group.id);
    const familyId = existingFamily?.id || nanoid();

    if (existingFamily) {
      db.prepare(`
        UPDATE families
        SET name = ?, counterpart_name = ?, counterpart_email = ?, updated_at = ?
        WHERE id = ?
      `).run(group.familyName, group.inviteRelationLabel, group.inviteEmail, timestamp, familyId);

      db.prepare(`
        UPDATE family_members
        SET relation_label = ?
        WHERE family_id = ? AND user_id = ?
      `).run(group.relationLabel, familyId, userId);
    } else {
      db.prepare(`
        INSERT INTO families (id, name, counterpart_name, counterpart_email, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(familyId, group.familyName, group.inviteRelationLabel, group.inviteEmail, userId, timestamp, timestamp);

      db.prepare(`
        INSERT INTO family_members (id, family_id, user_id, relation_label, status, created_at)
        VALUES (?, ?, ?, ?, 'active', ?)
      `).run(nanoid(), familyId, userId, group.relationLabel, timestamp);
    }

    syncChildrenForFamily(familyId, group.children, timestamp);
    createdFamilies.push({ id: familyId, name: group.familyName, children: group.children });

    const invitation = upsertInvitation(familyId, group.inviteEmail, group.inviteRelationLabel, timestamp);
    if (invitation) {
      invitations.push(invitation);
    }
  }

  return { families: createdFamilies, invitations };
}

export function acceptInvitation(userId, token) {
  const invite = db.prepare("SELECT * FROM invitations WHERE token = ? AND status = 'pending'").get(token);
  if (!invite) {
    const error = new Error("Convite não encontrado ou expirado.");
    error.status = 404;
    throw error;
  }

  const exists = db.prepare("SELECT id FROM family_members WHERE family_id = ? AND user_id = ?").get(invite.family_id, userId);
  if (!exists) {
    db.prepare(`
      INSERT INTO family_members (id, family_id, user_id, relation_label, status, created_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(nanoid(), invite.family_id, userId, invite.relation_label, nowIso());
  }

  db.prepare("UPDATE invitations SET status = 'accepted' WHERE id = ?").run(invite.id);
  return { familyId: invite.family_id };
}

export function getInvitationPreview(token) {
  const invite = db.prepare(`
    SELECT i.*, f.name AS family_name
    FROM invitations i
    JOIN families f ON f.id = i.family_id
    WHERE i.token = ? AND i.status = 'pending'
  `).get(token);

  if (!invite) {
    return null;
  }

  return {
    id: invite.id,
    familyId: invite.family_id,
    familyName: normalizeBrokenText(invite.family_name),
    email: invite.email || "",
    relationLabel: normalizeBrokenText(invite.relation_label),
    status: invite.status,
    expiresAt: invite.expires_at
  };
}

export function deleteFamilyPanel(userId, familyId) {
  const membership = db.prepare(`
    SELECT fm.id, f.id AS family_id
    FROM family_members fm
    JOIN families f ON f.id = fm.family_id
    WHERE fm.family_id = ? AND fm.user_id = ? AND fm.status = 'active'
  `).get(familyId, userId);

  if (!membership) {
    const error = new Error("Painel não encontrado.");
    error.status = 404;
    throw error;
  }

  const remainingFamilies = db.prepare(`
    SELECT COUNT(*) AS total
    FROM family_members
    WHERE user_id = ? AND status = 'active'
  `).get(userId);

  if (Number(remainingFamilies?.total || 0) <= 1) {
    const error = new Error("Mantenha pelo menos um painel ativo no cadastro.");
    error.status = 400;
    throw error;
  }

  const expenseIds = db.prepare("SELECT id FROM expenses WHERE family_id = ?").all(familyId).map((row) => row.id);

  if (expenseIds.length) {
    const placeholders = expenseIds.map(() => "?").join(", ");
    db.prepare(`DELETE FROM expense_comments WHERE expense_id IN (${placeholders})`).run(...expenseIds);
  }

  db.prepare("DELETE FROM notifications WHERE family_id = ?").run(familyId);
  db.prepare("DELETE FROM chat_messages WHERE family_id = ?").run(familyId);
  db.prepare("DELETE FROM swap_requests WHERE family_id = ?").run(familyId);
  db.prepare("DELETE FROM schedule_events WHERE family_id = ?").run(familyId);
  db.prepare("DELETE FROM expenses WHERE family_id = ?").run(familyId);
  db.prepare("DELETE FROM support_payments WHERE family_id = ?").run(familyId);
  db.prepare("DELETE FROM support_settings WHERE family_id = ?").run(familyId);
  db.prepare("DELETE FROM invitations WHERE family_id = ?").run(familyId);
  db.prepare("DELETE FROM children WHERE family_id = ?").run(familyId);
  db.prepare("DELETE FROM family_members WHERE family_id = ?").run(familyId);
  db.prepare("DELETE FROM families WHERE id = ?").run(familyId);
}
