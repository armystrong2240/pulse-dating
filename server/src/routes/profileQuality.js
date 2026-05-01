import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { computeProfileQuality } from "../lib/profileQuality.js";

const router = Router();

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { media: { select: { id: true } } },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  const quality = computeProfileQuality(user, user.media.length);

  if (user.profileScore !== quality.score) {
    await prisma.user.update({
      where: { id: user.id },
      data: { profileScore: quality.score },
    });
  }

  return res.json({
    score: quality.score,
    threshold: quality.threshold,
    unlocked: quality.unlocked,
    checks: quality.checks,
    tips: quality.tips,
    onboardingStep: user.onboardingStep,
    onboardingCompleted: user.onboardingCompleted,
  });
});

router.post("/recalculate", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { media: { select: { id: true } } },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  const quality = computeProfileQuality(user, user.media.length);
  await prisma.user.update({
    where: { id: user.id },
    data: { profileScore: quality.score },
  });

  return res.json({
    score: quality.score,
    threshold: quality.threshold,
    unlocked: quality.unlocked,
    checks: quality.checks,
    tips: quality.tips,
  });
});

export default router;
