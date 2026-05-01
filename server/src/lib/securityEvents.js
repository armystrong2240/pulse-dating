import { prisma } from "../db.js";

function normalizeIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || null;
}

export async function logSecurityEvent(req, {
  userId = null,
  email = null,
  eventType,
  severity = "info",
  metadata = {},
}) {
  if (!eventType) return;

  try {
    const mergedMetadata = {
      ...(metadata || {}),
      requestId: req?.requestId || null,
    };
    await prisma.securityEvent.create({
      data: {
        userId,
        email,
        eventType,
        severity,
        ip: normalizeIp(req),
        userAgent: req.headers["user-agent"] || null,
        metadata: JSON.stringify(mergedMetadata),
      },
    });
  } catch {
    // Security audit logging must never block user flows.
  }
}
