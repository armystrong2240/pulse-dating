import crypto from "crypto";
import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Generate a short alphanumeric referral code
function generateCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase(); // e.g. "A3F8B1C2"
}

// GET /api/referrals/my-code — get (or create) the user's referral code
router.get("/my-code", requireAuth, async (req, res) => {
  let user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, referralCode: true },
  });

  if (!user.referralCode) {
    let code;
    let attempts = 0;
    // Ensure unique code
    while (attempts < 10) {
      code = generateCode();
      const existing = await prisma.user.findUnique({ where: { referralCode: code } });
      if (!existing) break;
      attempts++;
    }
    user = await prisma.user.update({
      where: { id: req.user.id },
      data: { referralCode: code },
      select: { id: true, referralCode: true },
    });
  }

  const referralCount = await prisma.referral.count({ where: { referrerId: req.user.id } });
  const rewardedCount = await prisma.referral.count({ where: { referrerId: req.user.id, rewardGiven: true } });

  return res.json({
    code: user.referralCode,
    shareUrl: `https://pulsedate.net/join?ref=${user.referralCode}`,
    referralCount,
    rewardedCount,
  });
});

// POST /api/referrals/redeem — redeem a referral code when registering (called from auth route after registration)
router.post("/redeem", requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Referral code required" });
  }

  const refereeId = req.user.id;

  // Check if user already used a referral
  const existingReferral = await prisma.referral.findUnique({ where: { refereeId } });
  if (existingReferral) {
    return res.status(409).json({ error: "You have already used a referral code" });
  }

  // Find referrer
  const referrer = await prisma.user.findUnique({
    where: { referralCode: code.toUpperCase() },
    select: { id: true, name: true },
  });

  if (!referrer) return res.status(404).json({ error: "Referral code not found" });
  if (referrer.id === refereeId) return res.status(400).json({ error: "Cannot use your own referral code" });

  // Create referral record
  await prisma.referral.create({
    data: {
      id: crypto.randomUUID(),
      referrerId: referrer.id,
      refereeId,
    },
  });

  // Update referredBy on the user
  await prisma.user.update({ where: { id: refereeId }, data: { referredById: referrer.id } });

  // Reward referrer: +5 daily likes (boost credits)
  await prisma.user.update({
    where: { id: referrer.id },
    data: { boostCredits: { increment: 1 } },
  });

  // Mark reward given
  await prisma.referral.update({
    where: { refereeId },
    data: { rewardGiven: true },
  });

  // Real-time notify referrer
  const { io, userSockets } = req.app.locals;
  const referrerSockets = userSockets.get(referrer.id);
  if (referrerSockets) {
    for (const socketId of referrerSockets) {
      io.to(socketId).emit("referral:reward", {
        message: `Someone joined using your invite! You earned a free Boost.`,
      });
    }
  }

  return res.json({ ok: true, message: "Referral redeemed! You both got a bonus." });
});

// GET /api/referrals/leaderboard — top referrers (public fun feature)
router.get("/leaderboard", async (_req, res) => {
  const leaders = await prisma.referral.groupBy({
    by: ["referrerId"],
    _count: { referrerId: true },
    orderBy: { _count: { referrerId: "desc" } },
    take: 10,
  });

  const withNames = await Promise.all(
    leaders.map(async (entry) => {
      const user = await prisma.user.findUnique({
        where: { id: entry.referrerId },
        select: { name: true, avatar: true },
      });
      return { name: user?.name || "Unknown", avatar: user?.avatar || "", count: entry._count.referrerId };
    }),
  );

  return res.json({ leaderboard: withNames });
});

export default router;
