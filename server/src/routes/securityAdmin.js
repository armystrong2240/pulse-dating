import { Router } from "express";
import { prisma } from "../db.js";
import { logger } from "../lib/logger.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function parseMetadata(text) {
  if (!text || typeof text !== "string") return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

router.get("/summary", requireAuth, requireAdmin, async (req, res) => {
  const hours = clampInt(req.query.hours, 24, 1, 24 * 30);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const events = await prisma.securityEvent.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      eventType: true,
      severity: true,
      ip: true,
      email: true,
      userId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const byType = {};
  const bySeverity = {};
  const failedLoginByIp = {};
  const failedLoginByEmail = {};

  for (const event of events) {
    byType[event.eventType] = (byType[event.eventType] || 0) + 1;
    bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;

    if (event.eventType === "auth.login.failed") {
      if (event.ip) failedLoginByIp[event.ip] = (failedLoginByIp[event.ip] || 0) + 1;
      if (event.email) {
        failedLoginByEmail[event.email] = (failedLoginByEmail[event.email] || 0) + 1;
      }
    }
  }

  const top = (dict) =>
    Object.entries(dict)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

  logger.info("security.admin.summary.viewed", {
    requestId: req.requestId,
    adminEmail: req.user.email,
    hours,
    eventCount: events.length,
  });

  return res.json({
    ok: true,
    requestId: req.requestId,
    windowHours: hours,
    since: since.toISOString(),
    totals: {
      events: events.length,
      bySeverity,
      byType,
    },
    topFailedLogins: {
      byIp: top(failedLoginByIp),
      byEmail: top(failedLoginByEmail),
    },
  });
});

router.get("/events", requireAuth, requireAdmin, async (req, res) => {
  const hours = clampInt(req.query.hours, 24, 1, 24 * 30);
  const limit = clampInt(req.query.limit, 100, 1, 500);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const where = {
    createdAt: { gte: since },
  };

  if (req.query.severity) {
    where.severity = String(req.query.severity);
  }
  if (req.query.eventType) {
    where.eventType = String(req.query.eventType);
  }

  const events = await prisma.securityEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  logger.info("security.admin.events.viewed", {
    requestId: req.requestId,
    adminEmail: req.user.email,
    hours,
    limit,
    eventCount: events.length,
  });

  return res.json({
    ok: true,
    requestId: req.requestId,
    windowHours: hours,
    count: events.length,
    events: events.map((event) => ({
      ...event,
      metadata: parseMetadata(event.metadata),
    })),
  });
});

export default router;
