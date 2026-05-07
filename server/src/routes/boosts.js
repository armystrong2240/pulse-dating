/**
 * Boost scheduling — let users schedule a 30-minute profile boost
 * for a future time (e.g. Friday 8 PM peak hours).
 *
 * A background job in index.js polls every minute and fires due boosts.
 */
import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const ScheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
  durationMin: z.number().int().min(15).max(120).default(30),
});

// ── GET /boosts — list pending scheduled boosts ──────────────────────────
router.get("/", requireAuth, async (req, res) => {
  const boosts = await prisma.scheduledBoost.findMany({
    where: { userId: req.user.id, fired: false, scheduledAt: { gt: new Date() } },
    orderBy: { scheduledAt: "asc" },
  });
  return res.json(boosts);
});

// ── POST /boosts — schedule a new boost ──────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const parsed = ScheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { scheduledAt, durationMin } = parsed.data;
  const scheduled = new Date(scheduledAt);

  if (scheduled <= new Date()) {
    return res.status(400).json({ error: "scheduledAt must be in the future" });
  }

  // Check user has boost credits or is premium
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { boostCredits: true, premiumTier: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  const hasAccess = user.premiumTier !== "free" || user.boostCredits > 0;
  if (!hasAccess) {
    return res.status(402).json({
      error: "Boost requires Plus/Gold subscription or a boost credit",
      requiresUpgrade: true,
    });
  }

  // Deduct a credit for free-tier users
  if (user.premiumTier === "free") {
    await prisma.user.update({ where: { id: req.user.id }, data: { boostCredits: { decrement: 1 } } });
  }

  const boost = await prisma.scheduledBoost.create({
    data: {
      id: crypto.randomUUID(),
      userId: req.user.id,
      scheduledAt: scheduled,
      durationMin,
    },
  });

  return res.status(201).json(boost);
});

// ── DELETE /boosts/:id — cancel a scheduled boost ────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  const boost = await prisma.scheduledBoost.findUnique({ where: { id: req.params.id } });
  if (!boost || boost.userId !== req.user.id) {
    return res.status(404).json({ error: "Boost not found" });
  }
  if (boost.fired) {
    return res.status(400).json({ error: "Cannot cancel a boost that already fired" });
  }

  await prisma.scheduledBoost.delete({ where: { id: req.params.id } });

  // Refund the boost credit for free-tier users
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { premiumTier: true } });
  if (user?.premiumTier === "free") {
    await prisma.user.update({ where: { id: req.user.id }, data: { boostCredits: { increment: 1 } } });
  }

  return res.json({ ok: true });
});

export default router;
