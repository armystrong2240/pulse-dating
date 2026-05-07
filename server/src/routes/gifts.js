import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { sendPushToUser } from "./push.js";

const router = Router();

const GIFT_TYPES = ["rose", "heart", "coffee", "star", "fire", "diamond"];

// Gift cost in credits: free users pay 0 (basic), gold gets 5 free/month
// For now gifts are free to send — can gate later with a credit system
const GiftSchema = z.object({
  giftType: z.enum(["rose", "heart", "coffee", "star", "fire", "diamond"]),
  message: z.string().max(200).optional().default(""),
});

// POST /api/gifts/send/:toId — send a gift
router.post("/send/:toId", requireAuth, async (req, res) => {
  const fromId = req.user.id;
  const toId = req.params.toId;

  if (fromId === toId) return res.status(400).json({ error: "Cannot send a gift to yourself" });

  const parsed = GiftSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  // Verify recipient exists
  const recipient = await prisma.user.findUnique({ where: { id: toId }, select: { id: true, name: true } });
  if (!recipient) return res.status(404).json({ error: "User not found" });

  // Gold tier gets 5 free gifts/month, Plus gets 1, Free gets 0
  const sender = await prisma.user.findUnique({ where: { id: fromId }, select: { premiumTier: true, name: true } });
  const tier = sender?.premiumTier || "free";

  if (tier === "free") {
    return res.status(403).json({
      error: "Sending gifts requires PulsDate Plus or Gold.",
      requiresUpgrade: true,
      minTier: "plus",
    });
  }

  if (tier === "plus") {
    // Plus: 1 gift per user per day
    const today = new Date().toISOString().slice(0, 10);
    const todayStart = new Date(today);
    const giftCount = await prisma.gift.count({
      where: { fromId, toId, createdAt: { gte: todayStart } },
    });
    if (giftCount >= 1) {
      return res.status(429).json({ error: "Plus members can send 1 gift per person per day. Upgrade to Gold for more." });
    }
  } else if (tier === "gold") {
    // Gold: 5 gifts per user per day
    const today = new Date().toISOString().slice(0, 10);
    const todayStart = new Date(today);
    const giftCount = await prisma.gift.count({
      where: { fromId, toId, createdAt: { gte: todayStart } },
    });
    if (giftCount >= 5) {
      return res.status(429).json({ error: "You've reached today's gift limit for this person." });
    }
  }

  const gift = await prisma.gift.create({
    data: {
      id: crypto.randomUUID(),
      fromId,
      toId,
      giftType: parsed.data.giftType,
      message: parsed.data.message,
    },
  });

  // Push notification to recipient
  try {
    const giftEmoji = { rose: "🌹", heart: "💖", coffee: "☕", star: "⭐", fire: "🔥", diamond: "💎" };
    await sendPushToUser(toId, {
      title: `${sender.name} sent you a ${parsed.data.giftType}! ${giftEmoji[parsed.data.giftType] || "🎁"}`,
      body: parsed.data.message || "Open PulsDate to see your gift",
      data: { type: "gift", giftId: gift.id, fromId },
    });
  } catch (_) { /* non-critical */ }

  // Real-time notification
  const { io, userSockets } = req.app.locals;
  const recipientSockets = userSockets.get(toId);
  if (recipientSockets) {
    for (const socketId of recipientSockets) {
      io.to(socketId).emit("gift:received", { gift, from: { id: fromId, name: sender.name } });
    }
  }

  return res.status(201).json({ gift });
});

// GET /api/gifts/received — gifts the current user received (unseen)
router.get("/received", requireAuth, async (req, res) => {
  const gifts = await prisma.gift.findMany({
    where: { toId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      from: { select: { id: true, name: true, avatar: true } },
    },
  });
  return res.json({ gifts });
});

// POST /api/gifts/seen/:giftId — mark gift as seen
router.post("/seen/:giftId", requireAuth, async (req, res) => {
  await prisma.gift.updateMany({
    where: { id: req.params.giftId, toId: req.user.id },
    data: { seen: true },
  });
  return res.json({ ok: true });
});

// GET /api/gifts/catalog — list available gift types
router.get("/catalog", (_req, res) => {
  const catalog = [
    { type: "rose",    emoji: "🌹", name: "Rose",    description: "A classic symbol of affection",  minTier: "plus" },
    { type: "heart",   emoji: "💖", name: "Heart",   description: "Show them you care",              minTier: "plus" },
    { type: "coffee",  emoji: "☕", name: "Coffee",  description: "Buy them a virtual coffee",       minTier: "plus" },
    { type: "star",    emoji: "⭐", name: "Star",    description: "They're a star to you",           minTier: "plus" },
    { type: "fire",    emoji: "🔥", name: "Fire",    description: "Things are heating up",           minTier: "plus" },
    { type: "diamond", emoji: "💎", name: "Diamond", description: "For your most special connection", minTier: "gold" },
  ];
  return res.json({ catalog });
});

export default router;
