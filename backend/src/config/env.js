import "dotenv/config";
import path from "node:path";

const rootDir = process.cwd();
const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const rawClientUrls = process.env.CLIENT_URLS || process.env.CLIENT_URL || "http://localhost:5173";
const clientUrls = rawClientUrls
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

export const env = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "copais-dev-secret",
  clientUrl: clientUrls[0] || "http://localhost:5173",
  clientUrls,
  dbPath: process.env.DB_PATH || path.join(rootDir, "data", "copais.db"),
  uploadDir: process.env.UPLOAD_DIR || path.join(rootDir, "uploads"),
  whatsappLogPath: process.env.WHATSAPP_LOG_PATH || path.join(rootDir, "data", "whatsapp-log.json"),
  zapiBaseUrl: process.env.ZAPI_BASE_URL || "https://api.z-api.io",
  zapiInstanceId: process.env.ZAPI_INSTANCE_ID || "",
  zapiInstanceToken: process.env.ZAPI_INSTANCE_TOKEN || "",
  zapiClientToken: process.env.ZAPI_CLIENT_TOKEN || "",
  hotmartWebhookSecret: process.env.HOTMART_WEBHOOK_SECRET || "",
  hotmartDefaultPlan: process.env.HOTMART_DEFAULT_PLAN || "CoParental Premium",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:5173",
  mailMode: process.env.MAIL_MODE || "log",
  mailFrom: process.env.MAIL_FROM || "no-reply@copais.local",
  mailLogPath: process.env.MAIL_LOG_PATH || path.join(rootDir, "data", "mail-log.json"),
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: String(process.env.SMTP_SECURE || "false") === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  vapidSubject: process.env.VAPID_SUBJECT || "mailto:jvr.solucoes8@gmail.com",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || "",
  cookieSecure: String(process.env.COOKIE_SECURE || (isProduction ? "true" : "false")) === "true",
  cookieSameSite: process.env.COOKIE_SAME_SITE || (isProduction ? "none" : "lax")
};
