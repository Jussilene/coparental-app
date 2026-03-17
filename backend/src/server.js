import "dotenv/config";
import fs from "node:fs";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth-routes.js";
import { appRouter } from "./routes/app-routes.js";
import { adminRouter } from "./routes/admin-routes.js";
import { webhookRouter } from "./routes/webhook-routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { runSupportReminderCycle } from "./services/support-reminder-service.js";
import "./db/database.js";

fs.mkdirSync(env.uploadDir, { recursive: true });

function validateProductionEnv() {
  if (!env.isProduction) {
    return;
  }

  const problems = [];
  if (!process.env.JWT_SECRET || env.jwtSecret === "copais-dev-secret") {
    problems.push("JWT_SECRET de produção não configurado.");
  }
  if (env.clientUrls.some((url) => url.includes("localhost"))) {
    problems.push("CLIENT_URL/CLIENT_URLS ainda aponta para localhost.");
  }
  if (env.appBaseUrl.includes("localhost")) {
    problems.push("APP_BASE_URL ainda aponta para localhost.");
  }
  if (env.cookieSameSite === "none" && !env.cookieSecure) {
    problems.push("COOKIE_SAME_SITE=none exige COOKIE_SECURE=true.");
  }

  if (problems.length) {
    throw new Error(`Configuração de produção inválida:\n- ${problems.join("\n- ")}`);
  }
}

validateProductionEnv();

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.set("trust proxy", 1);
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.clientUrls.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origem não permitida pelo CORS."));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/webhooks", webhookRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api", appRouter);
app.use(errorHandler);

(async () => {
  try {
    await runSupportReminderCycle();
  } catch (error) {
    console.error("Falha ao rodar lembretes iniciais de pensao:", error);
  }
})();

setInterval(async () => {
  try {
    await runSupportReminderCycle();
  } catch (error) {
    console.error("Falha ao rodar lembretes de pensao:", error);
  }
}, 1000 * 60 * 60);

app.listen(env.port, () => {
  console.log(`CoParental backend em http://localhost:${env.port}`);
  console.log(`Ambiente: ${env.nodeEnv}`);
});
