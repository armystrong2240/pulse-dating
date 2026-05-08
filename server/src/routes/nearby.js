import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { decryptSensitiveUserFields } from "../lib/dataProtection.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Haversine distance in miles
function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Fuzzy distance label to protect privacy for "approximate" mode
function fuzzyDistance(miles) {
  if (miles < 0.1) return "< 100 ft";
  if (miles < 0.5) return "< 0.5 mi";
  if (miles < 1) return "< 1 mi";
  if (miles < 2) return "~1 mi";
  if (miles < 5) return "~" + Math.round(miles) + " mi";
  if (miles < 20) return "~" + (Math.round(miles / 5) * 5) + " mi";
  return "~" + (Math.round(miles / 10) * 10) + " mi";
}

// Require premium membership
function requirePremium(req, res, next) {
  if (!req.user?.isPremium) {
    return res.status(403).json({
      error: "Nearby is a premium feature. Upgrade to Plus or Gold to access it.",
      upgradeRequired: true,
    });
  }
  next();
}

const SettingsSchema = z.object({
  showInNearby: z.boolean(),
  nearbyPrivacy: z.enum(["exact", "approximate"]).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

// PATCH /api/nearby/settings — opt in/out of nearby, set privacy, update location
router.patch("/settings", requireAuth, requirePremium, async (req, res) => {
  const parsed = SettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const { showInNearby, nearbyPrivacy, lat, lng } = parsed.data;
  const data = { showInNearby };
  if (nearbyPrivacy) data.nearbyPrivacy = nearbyPrivacy;
  if (lat !== undefined && lng !== undefined) {
    data.latitude = lat;
    data.longitude = lng;
  }
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data,
    select: { showInNearby: true, nearbyPrivacy: true, latitude: true, longitude: true },
  });
  return res.json({ ok: true, ...user });
});

// GET /api/nearby — list nearby opted-in premium users sorted by distance
router.get("/", requireAuth, requirePremium, async (req, res) => {
  const { lat, lng, radiusMi = "25" } = req.query;

  // Use provided coords or fall back to stored location
  let viewerLat = lat ? Number(lat) : null;
  let viewerLng = lng ? Number(lng) : null;

  if (viewerLat !== null && viewerLng !== null) {
    // Update the requester's own stored location while they're browsing
    await prisma.user.update({
      where: { id: req.user.id },
      data: { latitude: viewerLat, longitude: viewerLng },
    });
  } else {
    const me = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { latitude: true, longitude: true },
    });
    if (!me || (me.latitude === 0 && me.longitude === 0)) {
      return res.status(400).json({
        error: "Share your location to see who is nearby.",
        locationRequired: true,
      });
    }
    viewerLat = me.latitude;
    viewerLng = me.longitude;
  }

  const radius = Math.min(Number(radiusMi), 100); // cap at 100 miles

  // Get blocks in both directions
  const [blocks] = await Promise.all([
    prisma.blockedUser.findMany({
      where: { OR: [{ blockerId: req.user.id }, { blockedId: req.user.id }] },
      select: { blockerId: true, blockedId: true },
    }),
  ]);
  const blockedIds = new Set();
  for (const b of blocks) {
    blockedIds.add(b.blockerId);
    blockedIds.add(b.blockedId);
  }
  blockedIds.add(req.user.id); // exclude self

  // Fetch all opted-in users with a stored location
  const candidates = await prisma.user.findMany({
    where: {
      showInNearby: true,
      paused: false,
      id: { notIn: [...blockedIds] },
      NOT: { latitude: 0, longitude: 0 },
    },
    include: {
      media: { orderBy: [{ sortOrder: "asc" }, { uploadedAt: "asc" }], take: 1 },
    },
  });

  const results = [];
  for (const u of candidates) {
    const decrypted = decryptSensitiveUserFields(u);
    const miles = haversineMiles(viewerLat, viewerLng, u.latitude, u.longitude);
    if (miles > radius) continue;

    const firstPhoto = u.media[0]?.url ?? null;
    const isOnline = u.lastSeen && Date.now() - new Date(u.lastSeen).getTime() < 15 * 60 * 1000;

    // Respect their nearbyPrivacy preference
    const distanceLabel =
      u.nearbyPrivacy === "exact"
        ? miles < 0.1
          ? "< 100 ft"
          : miles.toFixed(1) + " mi"
        : fuzzyDistance(miles);

    results.push({
      id: u.id,
      name: u.name,
      age: u.age,
      city: decrypted.city,
      lookingFor: u.lookingFor,
      avatar: u.avatar,
      firstPhoto,
      isOnline: !!isOnline,
      distanceMi: Math.round(miles * 10) / 10,
      distanceLabel,
    });
  }

  results.sort((a, b) => a.distanceMi - b.distanceMi);

  return res.json(results);
});

export default router;
