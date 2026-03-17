import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { nowIso } from "../utils/date.js";

function appendMailLog(entry) {
  fs.mkdirSync(path.dirname(env.mailLogPath), { recursive: true });
  const existing = fs.existsSync(env.mailLogPath) ? JSON.parse(fs.readFileSync(env.mailLogPath, "utf8")) : [];
  existing.push(entry);
  fs.writeFileSync(env.mailLogPath, JSON.stringify(existing, null, 2));
}

function hasSmtpConfig() {
  return Boolean(env.smtpHost && env.smtpPort && env.smtpUser && env.smtpPass);
}

let transporter = null;

function getTransporter() {
  if (!hasSmtpConfig()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass
      }
    });
  }

  return transporter;
}

export async function sendEmail({ to, subject, html, meta = {} }) {
  const entry = {
    to,
    subject,
    html,
    meta,
    from: env.mailFrom,
    createdAt: nowIso()
  };

  if (env.mailMode === "smtp") {
    const mailer = getTransporter();

    if (!mailer) {
      throw new Error("SMTP não configurado. Defina SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS.");
    }

    await mailer.sendMail({
      from: env.mailFrom,
      to,
      subject,
      html
    });

    appendMailLog({ ...entry, delivery: "smtp" });
    console.log(`[mail:smtp] ${subject} -> ${to}`);
    return;
  }

  appendMailLog({ ...entry, delivery: "log" });
  console.log(`[mail:log] ${subject} -> ${to}`);
}
