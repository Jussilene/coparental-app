export const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  role_label TEXT DEFAULT 'Responsável',
  avatar_color TEXT DEFAULT '#6aa6a3',
  is_admin INTEGER NOT NULL DEFAULT 0,
  account_status TEXT NOT NULL DEFAULT 'active',
  activation_state TEXT NOT NULL DEFAULT 'completed',
  activated_at TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  counterpart_name TEXT,
  counterpart_email TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS family_members (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  relation_label TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (family_id, user_id),
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS children (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  name TEXT NOT NULL,
  birth_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  email TEXT,
  relation_label TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id)
);

CREATE TABLE IF NOT EXISTS support_settings (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL UNIQUE,
  amount REAL NOT NULL,
  due_day INTEGER NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id)
);

CREATE TABLE IF NOT EXISTS support_payments (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  month_ref TEXT NOT NULL,
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,
  paid_at TEXT,
  status TEXT NOT NULL,
  justification TEXT,
  attachment_path TEXT,
  attachment_name TEXT,
  last_notification_at TEXT,
  notification_status TEXT,
  notification_error TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (family_id, month_ref),
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  child_id TEXT,
  child_ids TEXT,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  expense_date TEXT NOT NULL,
  description TEXT NOT NULL,
  paid_by_user_id TEXT NOT NULL,
  is_shared INTEGER NOT NULL DEFAULT 0,
  attachment_path TEXT,
  attachment_name TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (child_id) REFERENCES children(id),
  FOREIGN KEY (paid_by_user_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS expense_comments (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (expense_id) REFERENCES expenses(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS schedule_events (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  child_id TEXT,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  end_date TEXT,
  start_time TEXT,
  end_time TEXT,
  event_type TEXT NOT NULL,
  responsible_side TEXT NOT NULL,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (child_id) REFERENCES children(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS swap_requests (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  schedule_event_id TEXT,
  requested_by TEXT NOT NULL,
  requested_date TEXT NOT NULL,
  target_date TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  decision_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (schedule_event_id) REFERENCES schedule_events(id),
  FOREIGN KEY (requested_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT,
  attachment_path TEXT,
  attachment_name TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (sender_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS support_reminder_dispatches (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  month_ref TEXT NOT NULL,
  stage TEXT NOT NULL,
  channel TEXT NOT NULL,
  dispatched_for TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (family_id, user_id, month_ref, stage, channel, dispatched_for),
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  hotmart_purchase_id TEXT,
  hotmart_transaction TEXT,
  hotmart_subscriber_code TEXT,
  product_id TEXT,
  product_name TEXT,
  plan_name TEXT,
  status TEXT NOT NULL,
  billing_status TEXT NOT NULL,
  amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  purchase_date TEXT,
  renewal_date TEXT,
  last_event_type TEXT,
  last_event_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_purchase ON subscriptions(hotmart_purchase_id);

CREATE TABLE IF NOT EXISTS account_activation_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS hotmart_events (
  id TEXT PRIMARY KEY,
  external_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  hotmart_transaction TEXT,
  customer_email TEXT,
  payload_json TEXT NOT NULL,
  processing_status TEXT NOT NULL,
  processed_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`;
