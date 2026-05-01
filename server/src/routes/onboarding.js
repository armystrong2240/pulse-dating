import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { computeProfileQuality } from "../lib/profileQuality.js";

const router = Router();

const stepSchema = z.object({
  step: z.enum(["basics", "photos", "prompts", "vibe", "finish"]),
});

router.get("/status", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({
    onboardingStep: user.onboardingStep,
    onboardingCompleted: user.onboardingCompleted,
  });
});

router.post("/complete-step", requireAuth, async (req, res) => {
  const parsed = stepSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { onboardingStep: parsed.data.step },
    select: { onboardingStep: true, onboardingCompleted: true },
  });
  return res.json(user);
});

router.post("/finish", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { media: { select: { id: true } } },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  const quality = computeProfileQuality(user, user.media.length);
  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      onboardingCompleted: quality.unlocked,
      onboardingStep: quality.unlocked ? "finish" : user.onboardingStep,
      profileScore: quality.score,
    },
    select: { onboardingStep: true, onboardingCompleted: true, profileScore: true },
  });

  return res.json({
    ...updated,
    unlocked: quality.unlocked,
    threshold: quality.threshold,
    tips: quality.tips,
  });
});

export default router;
