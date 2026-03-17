import express from "express";
import {
  applyHotmartStatusUpdate,
  extractHotmartEvent,
  hasProcessedHotmartEvent,
  provisionFromHotmartEvent,
  registerHotmartEvent,
  updateHotmartEventStatus,
  validateHotmartSignature
} from "../services/hotmart-service.js";
import { ok } from "../utils/http.js";

export const webhookRouter = express.Router();

webhookRouter.post("/hotmart", async (req, res, next) => {
  try {
    if (!validateHotmartSignature(req)) {
      return res.status(401).json({ ok: false, message: "Assinatura do webhook Hotmart inválida." });
    }

    const event = extractHotmartEvent(req.body);
    if (!event.externalEventId || !event.eventType) {
      return res.status(400).json({ ok: false, message: "Payload Hotmart inválido." });
    }

    const existing = hasProcessedHotmartEvent(event.externalEventId);
    if (existing?.processing_status === "processed") {
      return ok(res, { duplicate: true });
    }
    if (!existing) {
      registerHotmartEvent(event, req.body);
    }

    if (["purchase_approved", "approved", "subscription_approved"].includes(event.eventType)) {
      await provisionFromHotmartEvent(event);
    } else if (["canceled", "cancelled", "late", "delayed", "renewed", "expired", "chargeback"].includes(event.eventType)) {
      applyHotmartStatusUpdate(event);
    }

    updateHotmartEventStatus(event.externalEventId, "processed");
    return ok(res, { processed: true });
  } catch (error) {
    try {
      const event = extractHotmartEvent(req.body);
      if (event?.externalEventId) {
        updateHotmartEventStatus(event.externalEventId, "failed", error.message);
      }
    } catch {
      // Ignore nested failures when building the error response.
    }
    next(error);
  }
});
