import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import axios from "axios";
import crypto from "crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import {
  CLIENT_URL,
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  NODE_ENV,
} from "../config/env.js";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLATFORM_CUT = 0.25; // platform keeps 25%, creator gets 75%
const PAYPAL_BASE =
  NODE_ENV === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const useS3 = !!(process.env.AWS_S3_BUCKET && process.env.AWS_ACCESS_KEY_ID);
let s3;
if (useS3) {
  s3 = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

const uploadsDir = path.resolve(__dirname, "..", "..", "uploads");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

const router = Router();

// ── PayPal helpers ─────────────────────────────────────────────────────────────

async function getPayPalToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal credentials are not configured");
  }
  const creds = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await axios.post(
    `${PAYPAL_BASE}/v1/oauth2/token`,
    "grant_type=client_credentials",
    { headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" } },
  );
  return res.data.access_token;
}

async function createPayPalOrder(token, amount, description, returnUrl, cancelUrl) {
  const res = await axios.post(
    `${PAYPAL_BASE}/v2/checkout/orders`,
    {
      intent: "CAPTURE",
      purchase_units: [{ amount: { currency_code: "USD", value: amount.toFixed(2) }, description }],
      application_context: { return_url: returnUrl, cancel_url: cancelUrl, user_action: "PAY_NOW" },
    },
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
  );
  return res.data;
}

async function capturePayPalOrder(token, orderId) {
  const res = await axios.post(
    `${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`,
    {},
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } },
  );
  return res.data;
}

// ── Media upload helper ────────────────────────────────────────────────────────

async function saveMedia(file) {
  const ext = path.extname(file.originalname);
  const filename = `creator-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  if (useS3) {
    const key = `uploads/${filename}`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));
    return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;
  }
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
  return `/uploads/${filename}`;
}

function clientUrl() {
  return (CLIENT_URL || "").split(",")[0].trim() || "http://localhost:5173";
}

// ── Creator setup ──────────────────────────────────────────────────────────────

const SetupSchema = z.object({
  price: z.coerce.number().min(1).max(500),
  bio: z.string().max(500).optional(),
});

// POST /creator/setup — enable creator mode
router.post("/setup", requireAuth, async (req, res) => {
  const parsed = SetupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { isCreator: true, creatorPrice: parsed.data.price, creatorBio: parsed.data.bio || "" },
    select: { isCreator: true, creatorPrice: true, creatorBio: true, creatorCover: true, creatorEarnings: true },
  });
  return res.json({ ok: true, ...user });
});

// PATCH /creator/me — update creator settings
router.patch("/me", requireAuth, async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { isCreator: true } });
  if (!me?.isCreator) return res.status(403).json({ error: "Creator mode not enabled." });
  const parsed = z.object({
    price: z.coerce.number().min(1).max(500).optional(),
    bio: z.string().max(500).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const data = {};
  if (parsed.data.price !== undefined) data.creatorPrice = parsed.data.price;
  if (parsed.data.bio !== undefined) data.creatorBio = parsed.data.bio;
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data,
    select: { creatorPrice: true, creatorBio: true },
  });
  return res.json({ ok: true, ...user });
});

// POST /creator/me/cover — upload cover photo
router.post("/me/cover", requireAuth, upload.single("cover"), async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { isCreator: true } });
  if (!me?.isCreator) return res.status(403).json({ error: "Creator mode not enabled." });
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  const url = await saveMedia(req.file);
  await prisma.user.update({ where: { id: req.user.id }, data: { creatorCover: url } });
  return res.json({ ok: true, coverUrl: url });
});

// ── Creator dashboard ──────────────────────────────────────────────────────────

// GET /creator/me/dashboard
router.get("/me/dashboard", requireAuth, async (req, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { isCreator: true, creatorPrice: true, creatorBio: true, creatorCover: true, creatorEarnings: true },
  });
  if (!me?.isCreator) return res.status(403).json({ error: "Creator mode not enabled." });

  const now = new Date();
  const [activeSubscribers, totalPosts, recentTips, recentSubs] = await Promise.all([
    prisma.creatorSubscription.count({
      where: { creatorId: req.user.id, status: "active", expiresAt: { gt: now } },
    }),
    prisma.creatorPost.count({ where: { creatorId: req.user.id } }),
    prisma.creatorTip.findMany({
      where: { toId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, fromId: true, amount: true, message: true, context: true, createdAt: true },
    }),
    prisma.creatorSubscription.findMany({
      where: { creatorId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { fan: { select: { id: true, name: true, avatar: true } } },
    }),
  ]);

  return res.json({
    ok: true,
    settings: me,
    stats: { activeSubscribers, totalPosts, pendingEarnings: me.creatorEarnings },
    recentTips,
    recentSubscribers: recentSubs.map((s) => ({
      id: s.id,
      fan: s.fan,
      status: s.status,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
    })),
    platformCut: PLATFORM_CUT,
  });
});

// ── Fan feed ───────────────────────────────────────────────────────────────────

// GET /creator/me/feed
router.get("/me/feed", requireAuth, async (req, res) => {
  const now = new Date();
  const subs = await prisma.creatorSubscription.findMany({
    where: { fanId: req.user.id, status: "active", expiresAt: { gt: now } },
    select: { creatorId: true },
  });
  const creatorIds = subs.map((s) => s.creatorId);
  if (creatorIds.length === 0) return res.json([]);

  const posts = await prisma.creatorPost.findMany({
    where: { creatorId: { in: creatorIds } },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { creator: { select: { id: true, name: true, avatar: true } } },
  });

  return res.json(posts.map((p) => ({
    id: p.id,
    creator: p.creator,
    caption: p.caption,
    mediaUrl: p.mediaUrl,
    mediaType: p.mediaType,
    isPPV: p.isPPV,
    ppvPrice: p.ppvPrice,
    createdAt: p.createdAt,
  })));
});

// ── Payout request ─────────────────────────────────────────────────────────────

// POST /creator/me/payout-request
router.post("/me/payout-request", requireAuth, async (req, res) => {
  const me = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { isCreator: true, creatorEarnings: true },
  });
  if (!me?.isCreator) return res.status(403).json({ error: "Creator mode not enabled." });
  if (me.creatorEarnings < 10) {
    return res.status(400).json({ error: "Minimum payout is $10.00. Current balance: $" + me.creatorEarnings.toFixed(2) });
  }
  const amount = me.creatorEarnings;
  await prisma.user.update({ where: { id: req.user.id }, data: { creatorEarnings: 0 } });
  return res.json({
    ok: true,
    requestedAmount: amount,
    message: "Payout request submitted. You will receive payment to your PayPal within 3–5 business days.",
  });
});

// ── Posts ──────────────────────────────────────────────────────────────────────

// POST /creator/posts
router.post("/posts", requireAuth, upload.single("media"), async (req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { isCreator: true } });
  if (!me?.isCreator) return res.status(403).json({ error: "Creator mode not enabled." });

  const parsed = z.object({
    caption: z.string().max(2000).optional(),
    isPPV: z.union([z.boolean(), z.string().transform((v) => v === "true")]).optional(),
    ppvPrice: z.coerce.number().min(0).max(500).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  let mediaUrl = "";
  let mediaType = "text";
  if (req.file) {
    mediaUrl = await saveMedia(req.file);
    mediaType = req.file.mimetype.startsWith("video/") ? "video" : "image";
  }

  const post = await prisma.creatorPost.create({
    data: {
      id: crypto.randomUUID(),
      creatorId: req.user.id,
      caption: parsed.data.caption || "",
      mediaUrl,
      mediaType,
      isPPV: parsed.data.isPPV ?? false,
      ppvPrice: parsed.data.ppvPrice ?? 0,
    },
  });

  return res.status(201).json(post);
});

// DELETE /creator/posts/:id
router.delete("/posts/:id", requireAuth, async (req, res) => {
  const post = await prisma.creatorPost.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: "Post not found." });
  if (post.creatorId !== req.user.id) return res.status(403).json({ error: "Forbidden." });
  await prisma.creatorPost.delete({ where: { id: req.params.id } });
  return res.json({ ok: true });
});

// ── PPV unlock ─────────────────────────────────────────────────────────────────

// POST /creator/posts/:id/unlock — initiate PayPal order (or unlock free for subscribers)
router.post("/posts/:id/unlock", requireAuth, async (req, res) => {
  const post = await prisma.creatorPost.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: "Post not found." });
  if (!post.isPPV) return res.status(400).json({ error: "This post is not pay-per-view." });
  if (post.creatorId === req.user.id) return res.status(400).json({ error: "Cannot unlock your own post." });

  const existing = await prisma.creatorPostUnlock.findUnique({
    where: { postId_userId: { postId: req.params.id, userId: req.user.id } },
  });
  if (existing) return res.json({ ok: true, alreadyUnlocked: true, mediaUrl: post.mediaUrl });

  // Subscribers get PPV content for free
  const now = new Date();
  const sub = await prisma.creatorSubscription.findFirst({
    where: { fanId: req.user.id, creatorId: post.creatorId, status: "active", expiresAt: { gt: now } },
  });
  if (sub) {
    await prisma.creatorPostUnlock.create({
      data: { id: crypto.randomUUID(), postId: req.params.id, userId: req.user.id },
    });
    return res.json({ ok: true, alreadyUnlocked: false, free: true, mediaUrl: post.mediaUrl });
  }

  const creator = await prisma.user.findUnique({ where: { id: post.creatorId }, select: { name: true } });
  try {
    const token = await getPayPalToken();
    const order = await createPayPalOrder(
      token,
      post.ppvPrice,
      `Unlock post by ${creator?.name || "creator"} on PulseDate`,
      `${clientUrl()}/creator/${post.creatorId}?action=ppv_capture&postId=${req.params.id}`,
      `${clientUrl()}/creator/${post.creatorId}`,
    );
    const approveUrl = order.links.find((l) => l.rel === "approve")?.href;
    return res.json({ ok: true, orderId: order.id, approveUrl });
  } catch {
    return res.status(502).json({ error: "Payment system error. Please try again." });
  }
});

// POST /creator/posts/:id/unlock/capture
router.post("/posts/:id/unlock/capture", requireAuth, async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: "orderId required." });
  const post = await prisma.creatorPost.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: "Post not found." });

  try {
    const token = await getPayPalToken();
    const capture = await capturePayPalOrder(token, orderId);
    if (capture.status !== "COMPLETED") return res.status(400).json({ error: "Payment not completed." });

    await prisma.creatorPostUnlock.upsert({
      where: { postId_userId: { postId: req.params.id, userId: req.user.id } },
      update: { paypalOrderId: orderId },
      create: { id: crypto.randomUUID(), postId: req.params.id, userId: req.user.id, paypalOrderId: orderId },
    });
    const creatorCut = post.ppvPrice * (1 - PLATFORM_CUT);
    await prisma.user.update({ where: { id: post.creatorId }, data: { creatorEarnings: { increment: creatorCut } } });

    return res.json({ ok: true, mediaUrl: post.mediaUrl });
  } catch {
    return res.status(502).json({ error: "Failed to capture payment. Please try again." });
  }
});

// ── Public creator profile ─────────────────────────────────────────────────────

// GET /creator/:id
router.get("/:id", requireAuth, async (req, res) => {
  const creator = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, avatar: true, city: true, isCreator: true, creatorPrice: true, creatorBio: true, creatorCover: true },
  });
  if (!creator?.isCreator) return res.status(404).json({ error: "Creator not found." });

  const now = new Date();
  const [subscriberCount, mySubscription] = await Promise.all([
    prisma.creatorSubscription.count({
      where: { creatorId: req.params.id, status: "active", expiresAt: { gt: now } },
    }),
    req.user.id !== req.params.id
      ? prisma.creatorSubscription.findFirst({
          where: { fanId: req.user.id, creatorId: req.params.id, status: "active", expiresAt: { gt: now } },
        })
      : Promise.resolve({ id: "self" }),
  ]);

  const isSubscribed = !!mySubscription;

  const posts = await prisma.creatorPost.findMany({
    where: { creatorId: req.params.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: isSubscribed
      ? false
      : { unlocks: { where: { userId: req.user.id }, select: { id: true } } },
  });

  const visiblePosts = posts.map((p) => {
    const unlocked = isSubscribed || !p.isPPV || (p.unlocks?.length > 0);
    return {
      id: p.id,
      caption: p.caption,
      mediaType: p.mediaType,
      isPPV: p.isPPV,
      ppvPrice: p.ppvPrice,
      createdAt: p.createdAt,
      unlocked,
      mediaUrl: unlocked ? p.mediaUrl : null,
    };
  });

  return res.json({
    creator,
    subscriberCount,
    isSubscribed,
    isOwnProfile: req.user.id === req.params.id,
    subscriptionExpiry: mySubscription?.expiresAt ?? null,
    posts: visiblePosts,
  });
});

// ── Subscribe ──────────────────────────────────────────────────────────────────

// POST /creator/:id/subscribe — initiate PayPal order
router.post("/:id/subscribe", requireAuth, async (req, res) => {
  if (req.user.id === req.params.id) return res.status(400).json({ error: "Cannot subscribe to yourself." });
  const creator = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { isCreator: true, creatorPrice: true, name: true },
  });
  if (!creator?.isCreator) return res.status(404).json({ error: "Creator not found." });
  if (!creator.creatorPrice || creator.creatorPrice <= 0) {
    return res.status(400).json({ error: "Creator has not set a subscription price." });
  }

  try {
    const token = await getPayPalToken();
    const order = await createPayPalOrder(
      token,
      creator.creatorPrice,
      `1 month subscription to ${creator.name} on PulseDate`,
      `${clientUrl()}/creator/${req.params.id}?action=sub_capture`,
      `${clientUrl()}/creator/${req.params.id}`,
    );
    const approveUrl = order.links.find((l) => l.rel === "approve")?.href;
    return res.json({ ok: true, orderId: order.id, approveUrl });
  } catch {
    return res.status(502).json({ error: "Payment system error. Please try again." });
  }
});

// POST /creator/:id/subscribe/capture
router.post("/:id/subscribe/capture", requireAuth, async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: "orderId required." });
  if (req.user.id === req.params.id) return res.status(400).json({ error: "Cannot subscribe to yourself." });

  const creator = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { isCreator: true, creatorPrice: true },
  });
  if (!creator?.isCreator) return res.status(404).json({ error: "Creator not found." });

  try {
    const token = await getPayPalToken();
    const capture = await capturePayPalOrder(token, orderId);
    if (capture.status !== "COMPLETED") return res.status(400).json({ error: "Payment not completed." });

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.creatorSubscription.upsert({
      where: { fanId_creatorId: { fanId: req.user.id, creatorId: req.params.id } },
      update: { status: "active", expiresAt, paypalOrderId: orderId },
      create: { id: crypto.randomUUID(), fanId: req.user.id, creatorId: req.params.id, paypalOrderId: orderId, status: "active", expiresAt },
    });
    const creatorCut = creator.creatorPrice * (1 - PLATFORM_CUT);
    await prisma.user.update({ where: { id: req.params.id }, data: { creatorEarnings: { increment: creatorCut } } });

    return res.json({ ok: true, expiresAt });
  } catch {
    return res.status(502).json({ error: "Failed to capture payment. Please try again." });
  }
});

// ── Tips ───────────────────────────────────────────────────────────────────────

// POST /creator/tip/:id — initiate tip PayPal order
router.post("/tip/:id", requireAuth, async (req, res) => {
  if (req.user.id === req.params.id) return res.status(400).json({ error: "Cannot tip yourself." });
  const parsed = z.object({
    amount: z.coerce.number().min(1).max(500),
    message: z.string().max(200).optional(),
    context: z.enum(["profile", "post", "dm"]).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const creator = await prisma.user.findUnique({ where: { id: req.params.id }, select: { name: true, isCreator: true } });
  if (!creator?.isCreator) return res.status(404).json({ error: "Creator not found." });

  try {
    const token = await getPayPalToken();
    const order = await createPayPalOrder(
      token,
      parsed.data.amount,
      `Tip for ${creator.name} on PulseDate`,
      `${clientUrl()}/creator/${req.params.id}?action=tip_capture&tipAmount=${parsed.data.amount}&tipMsg=${encodeURIComponent(parsed.data.message || "")}&tipCtx=${parsed.data.context || "profile"}`,
      `${clientUrl()}/creator/${req.params.id}`,
    );
    const approveUrl = order.links.find((l) => l.rel === "approve")?.href;
    return res.json({ ok: true, orderId: order.id, approveUrl });
  } catch {
    return res.status(502).json({ error: "Payment system error. Please try again." });
  }
});

// POST /creator/tip/:id/capture
router.post("/tip/:id/capture", requireAuth, async (req, res) => {
  const { orderId, amount, message, context } = req.body;
  if (!orderId || !amount) return res.status(400).json({ error: "orderId and amount required." });
  if (req.user.id === req.params.id) return res.status(400).json({ error: "Cannot tip yourself." });

  try {
    const token = await getPayPalToken();
    const capture = await capturePayPalOrder(token, orderId);
    if (capture.status !== "COMPLETED") return res.status(400).json({ error: "Payment not completed." });

    const tipAmount = Number(amount);
    const creatorCut = tipAmount * (1 - PLATFORM_CUT);
    await prisma.$transaction([
      prisma.creatorTip.create({
        data: {
          id: crypto.randomUUID(),
          fromId: req.user.id,
          toId: req.params.id,
          amount: tipAmount,
          message: message || "",
          context: context || "profile",
          paypalOrderId: orderId,
        },
      }),
      prisma.user.update({
        where: { id: req.params.id },
        data: { creatorEarnings: { increment: creatorCut } },
      }),
    ]);

    return res.json({ ok: true });
  } catch {
    return res.status(502).json({ error: "Failed to capture tip. Please try again." });
  }
});

export default router;
