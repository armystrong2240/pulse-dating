import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "crypto";
import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseInterests, prisma, serializeInterests } from "../db.js";
import {
  decryptSensitiveUserFields,
  encryptSensitiveUserFields,
} from "../lib/dataProtection.js";
import { computeProfileQuality } from "../lib/profileQuality.js";
import { requireAuth } from "../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Storage: S3 if configured, otherwise local disk
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
if (!useS3 && !fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Always use memory storage; we handle persistence in the route
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const router = Router();

async function syncProfileScore(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { media: { select: { id: true } } },
  });
  if (!user) return;

  const quality = computeProfileQuality(user, user.media.length);
  await prisma.user.update({
    where: { id: userId },
    data: { profileScore: quality.score },
  });
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Fields users are allowed to hide from other members
const HIDEABLE_FIELDS = [
  "sexualOrientation", "genderIdentity", "pronouns", "polyPreference",
  "age", "city", "lookingFor", "interests", "bio", "profilePrompts",
];

const toPublic = (user, media = [], viewerId = null) => {
  const decrypted = decryptSensitiveUserFields(user);
  const { passwordHash: _, email: __, latitude: _lat, longitude: _lon, ...pub } = decrypted;
  const parsed = parseInterests(pub);
  // Parse profilePrompts JSON
  try { parsed.profilePrompts = JSON.parse(pub.profilePrompts || "[]"); } catch { parsed.profilePrompts = []; }

  // Apply visibility preferences — owner always sees their own full profile
  if (viewerId !== user.id) {
    let hidden = {};
    try { hidden = JSON.parse(pub.profileVisibility || "{}"); } catch { hidden = {}; }
    for (const field of HIDEABLE_FIELDS) {
      if (hidden[field]) {
        if (Array.isArray(parsed[field])) parsed[field] = [];
        else if (typeof parsed[field] === "number") parsed[field] = null;
        else parsed[field] = "";
      }
    }
  }

  return { ...parsed, media };
};

router.get("/", requireAuth, async (req, res) => {
  const {
    search = "",
    city = "",
    state = "",
    zipCode = "",
    ageMin,
    ageMax,
    lookingFor,
    lat,
    lng,
    radiusMi,
  } = req.query;
  const userLat = lat ? Number(lat) : null;
  const userLng = lng ? Number(lng) : null;
  const radius = radiusMi ? Number(radiusMi) : 50;
  const myId = req.user.id;

  const [myLikes, me, myBlocks] = await Promise.all([
    prisma.like.findMany({ where: { fromId: myId } }),
    prisma.user.findUnique({ where: { id: myId } }),
    prisma.blockedUser.findMany({ where: { blockerId: myId } }),
  ]);
  const alreadyActed = new Set(myLikes.map((l) => l.toId));
  alreadyActed.add(myId);
  myBlocks.forEach((b) => alreadyActed.add(b.blockedId));

  const where = { id: { notIn: [...alreadyActed] }, paused: false };
  if (ageMin || ageMax) {
    where.age = {};
    if (ageMin) where.age.gte = Number(ageMin);
    if (ageMax) where.age.lte = Number(ageMax);
  }

  const users = await prisma.user.findMany({
    where,
    include: { media: { orderBy: [{ sortOrder: "asc" }, { uploadedAt: "asc" }] } },
  });

  const myInterests = (() => { try { return JSON.parse(me.interests); } catch { return []; } })();

  const s = search.toLowerCase();
  const c = city.toLowerCase();
  const st = state.toLowerCase();
  const z = zipCode.toLowerCase();
  const lf = lookingFor?.toLowerCase();
  const useGeo = userLat !== null && userLng !== null;

  const results = users.filter((u) => {
    const clear = decryptSensitiveUserFields(u);
    const interests = (() => { try { return JSON.parse(u.interests); } catch { return []; } })();
    const matchSearch = !s ||
      u.name.toLowerCase().includes(s) ||
      u.bio.toLowerCase().includes(s) ||
      interests.join(" ").toLowerCase().includes(s);
    const matchCity = !c || u.city.toLowerCase().includes(c);
    const matchState = !st || (clear.state || "").toLowerCase().includes(st);
    const matchZip = !z || (clear.zipCode || "").toLowerCase().includes(z);
    const matchLf = !lf || u.lookingFor.toLowerCase().includes(lf);
    const matchRadius = !useGeo || (u.latitude !== 0 || u.longitude !== 0)
      ? !useGeo || haversineMiles(userLat, userLng, u.latitude, u.longitude) <= radius
      : false;
    return matchSearch && matchCity && matchState && matchZip && matchLf && matchRadius;
  });

  const mapped = results.map((u) => {
    const theirInterests = (() => { try { return JSON.parse(u.interests); } catch { return []; } })();
    const shared = myInterests.filter((i) => theirInterests.includes(i)).length;
    const total = new Set([...myInterests, ...theirInterests]).size;
    const interestScore = total > 0 ? Math.round((shared / total) * 60) : 0;
    const lfScore = me.lookingFor === u.lookingFor ? 25
      : (me.lookingFor.toLowerCase().includes("open") || u.lookingFor.toLowerCase().includes("open") ? 10 : 0);
    const cityScore = me.city.toLowerCase() === u.city.toLowerCase() ? 15 : 0;
    const compatScore = Math.min(100, interestScore + lfScore + cityScore);
    const distanceMi = useGeo && (u.latitude !== 0 || u.longitude !== 0)
      ? Math.round(haversineMiles(userLat, userLng, u.latitude, u.longitude))
      : null;
    return { ...toPublic(u, u.media, myId), compatScore, distanceMi };
  });

  // Sort by distance when geo-search is active
  if (useGeo) mapped.sort((a, b) => (a.distanceMi ?? 9999) - (b.distanceMi ?? 9999));

  return res.json(mapped);
});

// Who viewed my profile (must come before /:id)
router.get("/views/me", requireAuth, async (req, res) => {
  const myId = req.user.id;
  const views = await prisma.profileView.findMany({
    where: { viewedId: myId },
    orderBy: { viewedAt: "desc" },
    include: { viewer: { select: { id: true, name: true, avatar: true, age: true, city: true } } },
    take: 100,
  });
  // Check which viewers I have mutually liked (i.e., it's a match or I liked them)
  const iLiked = new Set(
    (await prisma.like.findMany({ where: { fromId: myId, liked: true } })).map((l) => l.toId)
  );
  return res.json(views.map((v) => ({
    id: v.viewer.id,
    name: v.viewer.name,
    avatar: v.viewer.avatar,
    age: v.viewer.age,
    city: v.viewer.city,
    viewedAt: v.viewedAt,
    iLikedThem: iLiked.has(v.viewer.id),
  })));
});

router.get("/:id", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { media: { orderBy: [{ sortOrder: "asc" }, { uploadedAt: "asc" }] } },
  });
  if (!user) return res.status(404).json({ error: "Profile not found" });

  // Record profile view (skip self-views)
  if (req.params.id !== req.user.id) {
    await prisma.profileView.upsert({
      where: { viewerId_viewedId: { viewerId: req.user.id, viewedId: req.params.id } },
      update: { viewedAt: new Date() },
      create: { id: crypto.randomUUID(), viewerId: req.user.id, viewedId: req.params.id },
    });
  }

  return res.json(toPublic(user, user.media, req.user.id));
});

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  age: z.coerce.number().int().min(18).max(120).optional(),
  city: z.string().min(1).optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  pronouns: z.string().optional(),
  genderIdentity: z.string().optional(),
  sexualOrientation: z.string().optional(),
  polyPreference: z.string().optional(),
  bio: z.string().min(1).optional(),
  interests: z.union([z.array(z.string()), z.string()]).optional(),
  lookingFor: z.string().optional(),
  profileTheme: z.string().optional(),
  profileGraphic: z.string().optional(),
  musicUrl: z.string().optional(),
  profileMotto: z.string().optional(),
  dreamDate: z.string().optional(),
  avatar: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  profilePrompts: z.array(z.object({ q: z.string(), a: z.string() })).max(5).optional(),
  profileVisibility: z.record(z.boolean()).optional(),
});

router.put("/:id", requireAuth, async (req, res) => {
  if (req.params.id !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { interests, profilePrompts, profileVisibility, ...rest } = parsed.data;
  const data = { ...rest };
  if (interests !== undefined) {
    data.interests = serializeInterests(
      Array.isArray(interests)
        ? interests
        : String(interests)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
    );
  }
  if (profilePrompts !== undefined) {
    data.profilePrompts = JSON.stringify(profilePrompts);
  }
  if (profileVisibility !== undefined) {
    data.profileVisibility = JSON.stringify(profileVisibility);
  }

  const protectedData = encryptSensitiveUserFields(data);

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: protectedData,
    include: { media: { orderBy: [{ sortOrder: "asc" }, { uploadedAt: "asc" }] } },
  });
  await syncProfileScore(req.user.id);
  return res.json(toPublic(user, user.media, req.user.id));
});

router.put("/:id/media/order", requireAuth, async (req, res) => {
  if (req.params.id !== req.user.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const parsed = z.object({ orderedIds: z.array(z.string()) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const media = await prisma.media.findMany({
    where: { userId: req.user.id },
    select: { id: true },
  });
  const mediaIds = new Set(media.map((m) => m.id));
  const incoming = parsed.data.orderedIds;
  if (incoming.length !== media.length || incoming.some((id) => !mediaIds.has(id))) {
    return res.status(400).json({ error: "orderedIds must match current media set" });
  }

  await prisma.$transaction(
    incoming.map((mediaId, idx) =>
      prisma.media.update({
        where: { id: mediaId },
        data: { sortOrder: idx },
      })
    )
  );

  const updated = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { media: { orderBy: [{ sortOrder: "asc" }, { uploadedAt: "asc" }] } },
  });
  return res.json(updated?.media || []);
});

router.post(
  "/:id/media",
  requireAuth,
  upload.single("media"),
  async (req, res) => {
    if (req.params.id !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const ext = path.extname(req.file.originalname);
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const mediaType = req.file.mimetype.startsWith("video/") ? "video" : "image";

    let url;
    if (useS3) {
      const key = `uploads/${filename}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        }),
      );
      url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;
    } else {
      fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);
      url = `/uploads/${filename}`;
    }

    const maxOrder = await prisma.media.aggregate({
      where: { userId: req.user.id },
      _max: { sortOrder: true },
    });

    const media = await prisma.media.create({
      data: {
        userId: req.user.id,
        type: mediaType,
        url,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
    await syncProfileScore(req.user.id);
    return res.status(201).json(media);
  },
);

export default router;

