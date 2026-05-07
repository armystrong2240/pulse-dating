/**
 * Roses — PulseDate's premium virtual currency.
 *
 * Earn:  daily login streak bonuses, referrals
 * Spend: Super Like (costs 1 Rose), profile boosts
 *
 * Balance is stored on User.roseBalance; every transaction is
 * recorded in RoseLedger for transparency.
 */
import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ── GET /roses — current balance + recent ledger ──────────────────────────
router.get("/", requireAuth, async (req, res) => {
  const userId = req.user.id;
  const [user, ledger] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { roseBalance: true } }),
    prisma.roseLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return res.json({ balance: user?.roseBalance ?? 0, ledger });
});

// ── POST /roses/earn — internal helper also called on login streak ────────
// Public endpoint: earn roses from a referral reward claim
router.post("/claim-referral", requireAuth, async (req, res) => {
  const userId = req.user.id;
  // Check if user has unclaimed referral rewards
  const referrals = await prisma.referral.findMany({
    where: { referrerId: userId, rewardGiven: false },
  });
  if (!referrals.length) {
    return res.status(400).json({ error: "No pending referral rewards" });
  }

  const roseReward = referrals.length * 5; // 5 roses per referral
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { roseBalance: { increment: roseReward } },
    }),
    ...referrals.map((r) =>
      prisma.referral.update({ where: { id: r.id }, data: { rewardGiven: true } })
    ),
    prisma.roseLedger.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        delta: roseReward,
        reason: "referral",
      },
    }),
  ]);

  const updated = await prisma.user.findUnique({ where: { id: userId }, select: { roseBalance: true } });
  return res.json({ balance: updated.roseBalance, earned: roseReward });
});

// ── POST /roses/spend — spend roses on a feature ──────────────────────────
const SpendSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.enum(["superlike", "boost", "gift_premium"]),
  refId: z.string().optional(),
});

router.post("/spend", requireAuth, async (req, res) => {
  const parsed = SpendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { amount, reason, refId } = parsed.data;
  const userId = req.user.id;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { roseBalance: true } });
  if ((user?.roseBalance ?? 0) < amount) {
    return res.status(402).json({ error: "Insufficient roses", balance: user?.roseBalance ?? 0 });
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { roseBalance: { decrement: amount } } }),
    prisma.roseLedger.create({
      data: { id: crypto.randomUUID(), userId, delta: -amount, reason, refId: refId || null },
    }),
  ]);

  const updated = await prisma.user.findUnique({ where: { id: userId }, select: { roseBalance: true } });
  return res.json({ balance: updated.roseBalance });
});

export default router;
