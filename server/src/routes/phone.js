/**
 * Phone verification via Twilio Verify.
 * If TWILIO_* env vars are not set, responds with a 503 gracefully.
 */
import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
} from "../config/env.js";

const router = Router();

// Lazy-load Twilio client so the server boots even without keys
let twilioClient = null;
async function getTwilio() {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
  if (!twilioClient) {
    const { default: Twilio } = await import("twilio");
    twilioClient = new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

const PhoneSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format (+1234567890)"),
});

const VerifySchema = z.object({
  phone: z.string(),
  code: z.string().length(6),
});

// ── POST /phone/send — send a 6-digit code ───────────────────────────────
router.post("/send", requireAuth, async (req, res) => {
  const parsed = PhoneSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { phone } = parsed.data;

  // Check phone not already taken
  const existing = await prisma.user.findUnique({ where: { phoneNumber: phone }, select: { id: true } });
  if (existing && existing.id !== req.user.id) {
    return res.status(409).json({ error: "Phone number already linked to another account" });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  // Invalidate old codes for this user
  await prisma.phoneVerification.updateMany({
    where: { userId: req.user.id, verified: false },
    data: { expiresAt: new Date(0) },
  });

  await prisma.phoneVerification.create({
    data: {
      id: crypto.randomUUID(),
      userId: req.user.id,
      phone,
      code,
      expiresAt,
    },
  });

  const twilio = await getTwilio();
  if (twilio && TWILIO_PHONE_NUMBER) {
    try {
      await twilio.messages.create({
        body: `Your PulseDate verification code is: ${code}. Expires in 10 minutes.`,
        from: TWILIO_PHONE_NUMBER,
        to: phone,
      });
    } catch (e) {
      return res.status(502).json({ error: "Failed to send SMS. Please try again." });
    }
  } else {
    // Dev mode — log code to server console only
    console.info(`[phone-verify DEV] code for ${phone}: ${code}`);
  }

  return res.json({ ok: true, message: "Verification code sent" });
});

// ── POST /phone/verify — confirm the code ────────────────────────────────
router.post("/verify", requireAuth, async (req, res) => {
  const parsed = VerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { phone, code } = parsed.data;

  const record = await prisma.phoneVerification.findFirst({
    where: {
      userId: req.user.id,
      phone,
      code,
      verified: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    return res.status(400).json({ error: "Invalid or expired verification code" });
  }

  await prisma.$transaction([
    prisma.phoneVerification.update({ where: { id: record.id }, data: { verified: true } }),
    prisma.user.update({ where: { id: req.user.id }, data: { phoneNumber: phone, phoneVerified: true } }),
  ]);

  return res.json({ ok: true, phoneVerified: true });
});

// ── DELETE /phone — unlink phone number ──────────────────────────────────
router.delete("/", requireAuth, async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { phoneNumber: null, phoneVerified: false },
  });
  return res.json({ ok: true });
});

export default router;
