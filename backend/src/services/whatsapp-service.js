import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

function readLog() {
  try {
    return JSON.parse(fs.readFileSync(env.whatsappLogPath, "utf8"));
  } catch {
    return [];
  }
}

function appendLog(entry) {
  fs.mkdirSync(path.dirname(env.whatsappLogPath), { recursive: true });
  const log = readLog();
  log.push({
    ...entry,
    created_at: new Date().toISOString()
  });
  fs.writeFileSync(env.whatsappLogPath, JSON.stringify(log, null, 2));
}

function normalizeWhatsAppPhone(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  const withoutIntl = digits.replace(/^00/, "");
  if (/^55\d{10,11}$/.test(withoutIntl)) {
    return withoutIntl;
  }

  if (/^\d{10,11}$/.test(withoutIntl)) {
    return `55${withoutIntl}`;
  }

  return "";
}

export function isZApiConfigured() {
  return Boolean(env.zapiInstanceId && env.zapiInstanceToken && env.zapiClientToken);
}

export async function sendWhatsAppMessage({ to, message, meta = {} }) {
  const phone = normalizeWhatsAppPhone(to);
  if (!phone) {
    const result = { ok: false, mode: "validation", error: "invalid_phone", to };
    appendLog({ ...result, message, meta });
    console.error("[whatsapp] numero invalido", { to, meta });
    return result;
  }

  if (!isZApiConfigured()) {
    const result = { ok: false, skipped: true, mode: "disabled", to: phone, error: "whatsapp_disabled" };
    console.log("[whatsapp] envio ignorado porque a Z-API está desativada", { to: phone, meta });
    return result;
  }

  const url = `${env.zapiBaseUrl.replace(/\/$/, "")}/instances/${env.zapiInstanceId}/token/${env.zapiInstanceToken}/send-text`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.zapiClientToken
          ? {
              "Client-Token": env.zapiClientToken,
              "client-token": env.zapiClientToken
            }
          : {})
      },
      body: JSON.stringify({
        phone,
        message
      })
    });

    const rawBody = await response.text();
    let parsedBody = null;

    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsedBody = rawBody || null;
    }

    if (!response.ok) {
      const result = {
        ok: false,
        mode: "zapi",
        to: phone,
        statusCode: response.status,
        error: typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody || {})
      };
      appendLog({ ...result, message, meta });
      console.error("[whatsapp] falha no envio Z-API", { to: phone, statusCode: response.status, meta });
      return result;
    }

    const result = {
      ok: true,
      mode: "zapi",
      to: phone,
      statusCode: response.status,
      response: parsedBody
    };
    appendLog({ ...result, message, meta });
    console.log("[whatsapp] mensagem enviada com sucesso", { to: phone, meta });
    return result;
  } catch (error) {
    const result = {
      ok: false,
      mode: "zapi",
      to: phone,
      error: error instanceof Error ? error.message : "unknown_error"
    };
    appendLog({ ...result, message, meta });
    console.error("[whatsapp] erro inesperado no envio", { to: phone, meta, error: result.error });
    return result;
  }
}
