import { nanoid } from "nanoid";
import { db } from "./database.js";
import { hashPassword } from "../utils/security.js";
import { nowIso, monthRef, buildDueDate } from "../utils/date.js";

async function seed() {
  const exists = db.prepare("SELECT COUNT(*) AS total FROM users").get().total;
  if (exists > 0) {
    console.log("Seed ignorado: o banco já possui dados.");
    return;
  }

  const timestamp = nowIso();
  const familyId = nanoid();
  const user1 = { id: nanoid(), email: "maria@copais.app", name: "Maria Alves" };
  const user2 = { id: nanoid(), email: "joao@copais.app", name: "João Santos" };
  const childId = nanoid();

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, phone, role_label, avatar_color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(user1.id, user1.name, user1.email, await hashPassword("123456"), "(11) 99999-1111", "Responsável 1", "#4f9dc7", timestamp, timestamp);

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, phone, role_label, avatar_color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(user2.id, user2.name, user2.email, await hashPassword("123456"), "(11) 99999-2222", "Responsável 2", "#58b38c", timestamp, timestamp);

  db.prepare("INSERT INTO families (id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(familyId, "Família CoParental", user1.id, timestamp, timestamp);
  db.prepare("INSERT INTO family_members (id, family_id, user_id, relation_label, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)").run(nanoid(), familyId, user1.id, "Mãe", timestamp);
  db.prepare("INSERT INTO family_members (id, family_id, user_id, relation_label, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)").run(nanoid(), familyId, user2.id, "Pai", timestamp);
  db.prepare("INSERT INTO children (id, family_id, name, birth_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(childId, familyId, "Lia Alves Santos", "2018-05-04", "Alergia leve a amendoim.", timestamp, timestamp);
  db.prepare("INSERT INTO support_settings (id, family_id, amount, due_day, description, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(nanoid(), familyId, 950, 10, "Pensão mensal referente às despesas fixas da criança.", timestamp);

  const ref = monthRef();
  db.prepare(`
    INSERT INTO support_payments (id, family_id, month_ref, amount, due_date, paid_at, status, justification, attachment_path, attachment_name, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'paid', '', NULL, NULL, ?, ?, ?)
  `).run(nanoid(), familyId, ref, 950, buildDueDate(ref, 10), timestamp.slice(0, 10), user2.id, timestamp, timestamp);

  db.prepare(`
    INSERT INTO expenses (id, family_id, child_id, category, amount, expense_date, description, paid_by_user_id, is_shared, attachment_path, attachment_name, created_by, created_at, updated_at)
    VALUES (?, ?, ?, 'saude', 180, ?, 'Consulta pediátrica trimestral', ?, 1, NULL, NULL, ?, ?, ?)
  `).run(nanoid(), familyId, childId, timestamp.slice(0, 10), user1.id, user1.id, timestamp, timestamp);

  db.prepare(`
    INSERT INTO schedule_events (id, family_id, child_id, title, event_date, start_time, end_time, event_type, responsible_side, notes, created_by, created_at, updated_at)
    VALUES (?, ?, ?, 'Fim de semana com o pai', ?, '09:00', '18:00', 'convivencia', 'pai', 'Buscar na escola.', ?, ?, ?)
  `).run(nanoid(), familyId, childId, timestamp.slice(0, 10), user1.id, timestamp, timestamp);

  db.prepare(`
    INSERT INTO chat_messages (id, family_id, sender_id, content, attachment_path, attachment_name, created_at, read_at)
    VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL)
  `).run(nanoid(), familyId, user1.id, "Olá. Registrei a consulta de hoje na área de despesas.", timestamp);

  db.prepare(`
    INSERT INTO notifications (id, family_id, user_id, type, title, content, is_read, created_at)
    VALUES (?, ?, ?, 'welcome', 'Ambiente pronto', 'Seu ambiente inicial do CoParental foi criado para testes.', 0, ?)
  `).run(nanoid(), familyId, user1.id, timestamp);

  console.log("Seed concluído.");
  console.log("Usuário 1: maria@copais.app / 123456");
  console.log("Usuário 2: joao@copais.app / 123456");
}

seed();
