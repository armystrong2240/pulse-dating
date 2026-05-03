import { Router } from "express";
import webpush from "web-push";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails("mailto:noreply@pulsedate.net", VAPID_PUBLIC, VAPID_PRIVATE);
}

// GET /api/push/vapid-public — client needs this to subscribe
router.get("/vapid-public", (_req, res) => {
  if (!VAPID_PUBLIC) return res.status(503).json({ error: "Push not configured" });
  res.json({ publicKey: VAPID_PUBLIC });
});

// POST /api/push/subscribe — save push subscription for user
router.post("/subscribe", requireAuth, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription) return res.status(400).json({ error: "No subscription" });
  await prisma.user.update({
    where: { id: req.user.id },
    data: { pushSubscription: JSON.stringify(subscription) },
  });
  res.json({ ok: true });
});

// POST /api/push/unsubscribe — remove push subscription
router.post("/unsubscribe", requireAuth, async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { pushSubscription: null },
  });
  res.json({ ok: true });
});

// Internal helper (not an HTTP route) — send push to a user by id
export async function sendPushToUser(userId, title, body, url = "/") {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushSubscription: true },
    });
    if (!user?.pushSubscription) return;
    const subscription = JSON.parse(user.pushSubscription);
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title, body, url })
    );
  } catch (err) {
    if (err.statusCode === 410) {
      // Subscription expired — clean it up
      await prisma.user.update({ where: { id: userId }, data: { pushSubscription: null } });
    }
  }
}

export default router;
