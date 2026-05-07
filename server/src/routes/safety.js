import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ── Block ────────────────────────────────────────────────────────────────────

router.post("/block/:targetId", requireAuth, async (req, res) => {
  const blockerId = req.user.id;
  const blockedId = req.params.targetId;
  if (blockerId === blockedId) return res.status(400).json({ error: "Cannot block yourself" });

  await prisma.blockedUser.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    update: {},
    create: { id: crypto.randomUUID(), blockerId, blockedId },
  });
  return res.json({ blocked: true });
});

router.delete("/block/:targetId", requireAuth, async (req, res) => {
  await prisma.blockedUser.deleteMany({
    where: { blockerId: req.user.id, blockedId: req.params.targetId },
  });
  return res.json({ blocked: false });
});

router.get("/blocks", requireAuth, async (req, res) => {
  const rows = await prisma.blockedUser.findMany({
    where: { blockerId: req.user.id },
    include: { blocked: { select: { id: true, name: true, avatar: true } } },
  });
  return res.json(rows.map((r) => r.blocked));
});

// ── Report ───────────────────────────────────────────────────────────────────

const ReportSchema = z.object({
  reason: z.string().min(1),
  details: z.string().max(500).optional(),
});

router.post("/report/:targetId", requireAuth, async (req, res) => {
  const reporterId = req.user.id;
  const reportedId = req.params.targetId;
  if (reporterId === reportedId) return res.status(400).json({ error: "Cannot report yourself" });

  const parsed = ReportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  await prisma.report.create({
    data: {
      id: crypto.randomUUID(),
      reporterId,
      reportedId,
      reason: parsed.data.reason,
      details: parsed.data.details || "",
    },
  });

  // Auto-hide check: if this user now has 3+ reports, hide them immediately
  const reportCount = await prisma.report.count({ where: { reportedId } });
  if (reportCount >= 3) {
    await prisma.user.update({
      where: { id: reportedId },
      data: { autoHidden: true, paused: true },
    });
  }

  return res.json({ reported: true });
});

// ── Pause profile ─────────────────────────────────────────────────────────────

router.post("/pause", requireAuth, async (req, res) => {
  const { paused } = req.body;
  await prisma.user.update({
    where: { id: req.user.id },
    data: { paused: !!paused },
  });
  return res.json({ paused: !!paused });
});

// ── Boost ─────────────────────────────────────────────────────────────────────

router.post("/boost", requireAuth, async (req, res) => {
  const boostedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min
  await prisma.user.update({
    where: { id: req.user.id },
    data: { boostedUntil },
  });
  return res.json({ boostedUntil });
});

// ── Premium (demo toggle) ─────────────────────────────────────────────────────

router.post("/premium", requireAuth, async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { isPremium: true },
  });
  return res.json({ isPremium: user.isPremium });
});

// ── Verification selfie (demo: just flip status) ──────────────────────────────

router.post("/verify/request", requireAuth, async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { verifiedStatus: "pending" },
  });
  return res.json({ verifiedStatus: "pending" });
});

// Admin approve — in real app this is gated; demo uses open endpoint
router.post("/verify/approve/:userId", requireAuth, async (req, res) => {
  await prisma.user.update({
    where: { id: req.params.userId },
    data: { verifiedStatus: "verified", verified: true },
  });
  return res.json({ verified: true });
});

export default router;
