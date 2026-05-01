import crypto from "crypto";
import { logger } from "../lib/logger.js";

function normalizeIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || null;
}

export function requestContext(req, res, next) {
  const incoming = req.headers["x-request-id"];
  const requestId =
    (typeof incoming === "string" && incoming.trim()) || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  const startedAt = Date.now();
  res.on("finish", () => {
    logger.info("http.request.completed", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: normalizeIp(req),
      userAgent: req.headers["user-agent"] || null,
    });
  });

  next();
}
