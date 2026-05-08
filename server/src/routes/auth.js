import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { ADMIN_EMAILS, BCRYPT_ROUNDS, CLIENT_URL, FACEBOOK_APP_SECRET, isProduction } from "../config/env.js";
import { parseInterests, prisma, serializeInterests } from "../db.js";
import { awardLoginStreak } from "../lib/backgroundJobs.js";
import {
  decryptSensitiveUserFields,
  encryptSensitiveUserFields,
} from "../lib/dataProtection.js";
import { logSecurityEvent } from "../lib/securityEvents.js";
import { JWT_SECRET, REFRESH_SECRET, requireAuth } from "../middleware/auth.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../mailer.js";

const router = Router();
const REFRESH_COOKIE = "pd_refresh";
const REFRESH_EXPIRY_DAYS = 30;

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 8 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Please try again later." },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 8 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many failed login attempts. Please wait before trying again." },
});

const refreshLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: isProduction ? 20 : 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many token refresh requests. Please try again shortly." },
});

const toPublic = ({ passwordHash: _, ...pub }) => {
  const safe = parseInterests(decryptSensitiveUserFields(pub));
  return {
    ...safe,
    isAdmin: ADMIN_EMAILS.has(String(safe.email || "").toLowerCase()),
  };
};

const PasswordSchema = z.string().superRefine((value, ctx) => {
  const minLength = 8;
  if (value.length < minLength) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Password must be at least ${minLength} characters`,
    });
    return;
  }
  if (isProduction) {
    const strong = /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);
    if (!strong) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password must include uppercase, lowercase, and a number",
      });
    }
  }
});

const RegisterSchema = z.object({
  email: z.string().email(),
  password: PasswordSchema,
  name: z.string().min(1),
  age: z.coerce.number().int().min(18, "Must be 18 or older").max(120),
  city: z.string().min(1),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  sexualOrientation: z.string().optional(),
  polyPreference: z.string().optional(),
  bio: z.string().min(1),
  interests: z.union([z.array(z.string()), z.string()]).optional(),
  lookingFor: z.string().optional(),
  avatar: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const DeleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

function issueTokens(userId, email) {
  const accessToken = jwt.sign({ id: userId, email }, JWT_SECRET, {
    expiresIn: "15m",
  });
  const refreshToken = jwt.sign({ id: userId }, REFRESH_SECRET, {
    expiresIn: `${REFRESH_EXPIRY_DAYS}d`,
  });
  return { accessToken, refreshToken };
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    maxAge: REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  });
}

router.post("/register", registerLimiter, async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    await logSecurityEvent(req, {
      eventType: "auth.register.validation_failed",
      severity: "warn",
      metadata: { reason: parsed.error.issues[0].message },
    });
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const {
    email,
    password,
    name,
    age,
    city,
    state = "",
    zipCode = "",
    sexualOrientation = "",
    polyPreference = "",
    bio,
    interests = [],
    lookingFor = "Open to meeting people",
    avatar = "",
    latitude = 0,
    longitude = 0,
  } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existing) {
    await logSecurityEvent(req, {
      email: email.toLowerCase(),
      eventType: "auth.register.email_exists",
      severity: "warn",
    });
    return res.status(409).json({ error: "Email already registered" });
  }

  const interestList = Array.isArray(interests)
    ? interests.map(String).filter(Boolean)
    : String(interests)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  const verifyToken = crypto.randomBytes(32).toString("hex");
  const user = await prisma.user.create({
    data: encryptSensitiveUserFields({
      email: email.toLowerCase(),
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      name,
      age: Number(age),
      city,
      state,
      zipCode,
      sexualOrientation,
      polyPreference,
      bio,
      interests: serializeInterests(interestList),
      lookingFor,
      avatar,
      latitude,
      longitude,
      verifyToken,
    }),
  });

  const baseUrl = CLIENT_URL.split(",")[0].trim() || `${req.protocol}://${req.get("host")}`;
  sendVerificationEmail(user.email, user.name, verifyToken, baseUrl).catch((err) => console.error("[mailer] verification email failed:", err?.message || err));

  const { accessToken, refreshToken } = issueTokens(user.id, user.email);
  const refreshTokenHash = hashRefreshToken(refreshToken);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshTokenHash,
      expiresAt: new Date(Date.now() + REFRESH_EXPIRY_DAYS * 86400 * 1000),
    },
  });

  await logSecurityEvent(req, {
    userId: user.id,
    email: user.email,
    eventType: "auth.register.success",
    severity: "info",
  });

  setRefreshCookie(res, refreshToken);
  return res.status(201).json({ token: accessToken, user: toPublic(user) });
});

router.post("/login", loginLimiter, async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    await logSecurityEvent(req, {
      eventType: "auth.login.validation_failed",
      severity: "warn",
      metadata: { reason: parsed.error.issues[0].message },
    });
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    await logSecurityEvent(req, {
      email: email.toLowerCase(),
      eventType: "auth.login.failed",
      severity: "warn",
    });
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const { accessToken, refreshToken } = issueTokens(user.id, user.email);
  const refreshTokenHash = hashRefreshToken(refreshToken);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshTokenHash,
      expiresAt: new Date(Date.now() + REFRESH_EXPIRY_DAYS * 86400 * 1000),
    },
  });

  await logSecurityEvent(req, {
    userId: user.id,
    email: user.email,
    eventType: "auth.login.success",
    severity: "info",
  });

  setRefreshCookie(res, refreshToken);
  // Non-blocking streak award
  awardLoginStreak(user.id).catch(() => {});
  return res.json({ token: accessToken, user: toPublic(user) });
});

router.post("/refresh", refreshLimiter, async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) {
    await logSecurityEvent(req, {
      eventType: "auth.refresh.missing_token",
      severity: "warn",
    });
    return res.status(401).json({ error: "No refresh token" });
  }
  const tokenHash = hashRefreshToken(token);

  let payload;
  try {
    payload = jwt.verify(token, REFRESH_SECRET);
  } catch {
    await logSecurityEvent(req, {
      eventType: "auth.refresh.invalid_jwt",
      severity: "warn",
    });
    return res.status(401).json({ error: "Invalid refresh token" });
  }

  let stored = await prisma.refreshToken.findUnique({ where: { token: tokenHash } });
  // Backward compatibility: accept legacy plain-token records and rotate to hashed.
  if (!stored) {
    stored = await prisma.refreshToken.findUnique({ where: { token } });
  }
  if (!stored || stored.expiresAt < new Date()) {
    await logSecurityEvent(req, {
      userId: payload?.id,
      eventType: "auth.refresh.expired_or_missing",
      severity: "warn",
    });
    return res.status(401).json({ error: "Refresh token expired" });
  }

  // Rotate: delete old, issue new
  await prisma.refreshToken.delete({ where: { token: stored.token } });

  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user) {
    await logSecurityEvent(req, {
      userId: payload.id,
      eventType: "auth.refresh.user_not_found",
      severity: "warn",
    });
    return res.status(401).json({ error: "User not found" });
  }

  const { accessToken, refreshToken: newRefresh } = issueTokens(
    user.id,
    user.email,
  );
  const newRefreshHash = hashRefreshToken(newRefresh);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: newRefreshHash,
      expiresAt: new Date(Date.now() + REFRESH_EXPIRY_DAYS * 86400 * 1000),
    },
  });

  await logSecurityEvent(req, {
    userId: user.id,
    email: user.email,
    eventType: "auth.refresh.success",
    severity: "info",
  });

  setRefreshCookie(res, newRefresh);
  return res.json({ token: accessToken });
});

router.post("/logout", requireAuth, async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    const tokenHash = hashRefreshToken(token);
    await prisma.refreshToken.deleteMany({
      where: { OR: [{ token: tokenHash }, { token }] },
    });
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  }
  await logSecurityEvent(req, {
    userId: req.user.id,
    email: req.user.email,
    eventType: "auth.logout",
    severity: "info",
  });
  return res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json(toPublic(user));
});

router.get("/me/export", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: {
      media: true,
      likesSent: true,
      likesReceived: true,
      viewsGiven: true,
      viewsReceived: true,
      messages: true,
      friendRequestsSent: true,
      friendRequestsReceived: true,
      reports: true,
      blocksGiven: true,
      blocksReceived: true,
    },
  });

  if (!user) return res.status(404).json({ error: "User not found" });

  const { passwordHash: _, verifyToken: __, ...safeUser } = user;
  return res.json({
    exportedAt: new Date().toISOString(),
    user: parseInterests(decryptSensitiveUserFields(safeUser)),
  });
});

router.delete("/me", requireAuth, async (req, res) => {
  const parsed = DeleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const isValidPassword = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!isValidPassword) {
    await logSecurityEvent(req, {
      userId: req.user.id,
      email: user.email,
      eventType: "auth.account_delete.invalid_password",
      severity: "warn",
    });
    return res.status(401).json({ error: "Invalid password" });
  }

  await logSecurityEvent(req, {
    userId: req.user.id,
    email: user.email,
    eventType: "auth.account_delete.success",
    severity: "info",
  });
  await prisma.user.delete({ where: { id: user.id } });
  res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  return res.json({ ok: true, message: "Account deleted" });
});

router.get("/verify-email", async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Missing token" });

  const user = await prisma.user.findFirst({ where: { verifyToken: token } });
  if (!user) return res.status(400).json({ error: "Invalid or expired token" });

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verifyToken: null },
  });

  return res.json({ ok: true, message: "Email verified! You can close this tab." });
});

// ── Forgot Password ────────────────────────────────────────────────────────
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Always return 200 to avoid email enumeration
  if (!user) return res.json({ ok: true });

  const resetToken = crypto.randomUUID();
  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExpiry },
  });

  const baseUrl = CLIENT_URL.split(",")[0].trim() || `${req.protocol}://${req.get("host")}`;
  const url = `${baseUrl}/reset-password?token=${resetToken}`;

  sendPasswordResetEmail(user.email, user.name, url).catch((err) =>
    console.error("[mailer] reset email failed:", err?.message || err)
  );

  return res.json({ ok: true });
});

// ── Reset Password ─────────────────────────────────────────────────────────
router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "Token and password required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: { gt: new Date() },
    },
  });
  if (!user) return res.status(400).json({ error: "Invalid or expired reset link" });

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetToken: null, resetTokenExpiry: null },
  });

  // Invalidate all refresh tokens
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

  return res.json({ ok: true, message: "Password reset successfully" });
});

// ── Facebook OAuth ─────────────────────────────────────────────────────────
router.post("/facebook", loginLimiter, async (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken) return res.status(400).json({ error: "Facebook access token required" });

  // 1. Verify the token with Facebook Graph API
  let fbProfile;
  try {
    // If FACEBOOK_APP_SECRET is set, use app-token-based verification for extra security
    let verifyUrl;
    if (FACEBOOK_APP_SECRET) {
      const appTokenRes = await fetch(
        `https://graph.facebook.com/oauth/access_token?client_id=${process.env.VITE_FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID}&client_secret=${FACEBOOK_APP_SECRET}&grant_type=client_credentials`
      ).then((r) => r.json());
      const appToken = appTokenRes.access_token;
      if (appToken) {
        const inspect = await fetch(
          `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${appToken}`
        ).then((r) => r.json());
        if (!inspect.data?.is_valid) {
          return res.status(401).json({ error: "Invalid Facebook token" });
        }
      }
    }

    // Fetch user profile from Facebook
    const profileRes = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${accessToken}`
    );
    if (!profileRes.ok) return res.status(401).json({ error: "Could not fetch Facebook profile" });
    fbProfile = await profileRes.json();
    if (fbProfile.error || !fbProfile.id) {
      return res.status(401).json({ error: "Invalid Facebook access token" });
    }
  } catch {
    return res.status(502).json({ error: "Failed to reach Facebook. Please try again." });
  }

  const fbId = fbProfile.id;
  const fbEmail = fbProfile.email || null;
  const fbName = fbProfile.name || "New User";
  const fbAvatar = fbProfile.picture?.data?.url || "";

  // 2. Find existing user by facebookId first, then by email
  let user = await prisma.user.findUnique({ where: { facebookId: fbId } });

  if (!user && fbEmail) {
    user = await prisma.user.findUnique({ where: { email: fbEmail } });
    if (user) {
      // Link facebook ID to existing email account
      user = await prisma.user.update({
        where: { id: user.id },
        data: { facebookId: fbId },
      });
    }
  }

  // 3. Auto-create account if no match found
  if (!user) {
    // Use FB email or generate a placeholder (FB doesn't always share email)
    const email = fbEmail || `fb_${fbId}@facebook.noreply`;
    // Check if placeholder email is already taken (edge case: duplicate fb_id account)
    const emailTaken = await prisma.user.findUnique({ where: { email } });
    if (emailTaken) {
      return res.status(409).json({ error: "An account with this email already exists. Please log in normally." });
    }

    const passwordHash = await bcrypt.hash(crypto.randomUUID(), BCRYPT_ROUNDS);
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        facebookId: fbId,
        name: fbName,
        age: 18,           // placeholder — user completes profile during onboarding
        city: "",
        bio: "",
        avatar: fbAvatar,
        emailVerified: true, // FB verified email
        onboardingCompleted: false,
        onboardingStep: "basics",
        referralCode: crypto.randomBytes(6).toString("hex"),
      },
    });
  }

  // 4. Issue tokens — same flow as normal login
  const { accessToken: jwtToken, refreshToken } = issueTokens(user.id, user.email);
  const hashed = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { token: hashed, userId: user.id, expiresAt } });
  setRefreshCookie(res, refreshToken);

  await logSecurityEvent(user.id, "login", req, { method: "facebook" });
  await awardLoginStreak(user.id);

  const safe = parseInterests(decryptSensitiveUserFields(
    (({ passwordHash: _, ...pub }) => ({ ...pub, isAdmin: ADMIN_EMAILS.has(String(pub.email || "").toLowerCase()) }))(user)
  ));

  return res.json({ token: jwtToken, user: safe });
});

export default router;

