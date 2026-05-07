import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import {
  ADMIN_BOOTSTRAP_PASSWORD,
  ADMIN_EMAILS,
  BCRYPT_ROUNDS,
  CLIENT_URL,
  PORT,
  isProduction,
} from "./config/env.js";
import { initDb, prisma } from "./db.js";
import { logger } from "./lib/logger.js";
import { requestContext } from "./middleware/requestContext.js";
import authRoutes from "./routes/auth.js";
import billingRoutes from "./routes/billing.js";
import friendRoutes from "./routes/friends.js";
import giftRoutes from "./routes/gifts.js";
import liveRoutes from "./routes/live.js";
import matchRoutes from "./routes/matches.js";
import messageRoutes from "./routes/messages.js";
import onboardingRoutes from "./routes/onboarding.js";
import profileQualityRoutes from "./routes/profileQuality.js";
import profileRoutes from "./routes/profiles.js";
import referralRoutes from "./routes/referrals.js";
import securityAdminRoutes from "./routes/securityAdmin.js";
import adminRoutes from "./routes/admin.js";
import safetyRoutes from "./routes/safety.js";
import pushRoutes from "./routes/push.js";

const app = express();
const server = http.createServer(app);

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    logger.error("server.bind.eaddrinuse", {
      port: PORT,
      error: logger.serializeError(error),
    });
    process.exit(1);
  }
  logger.error("server.error", { error: logger.serializeError(error) });
  process.exit(1);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "..", "uploads");

// Allow Capacitor + web origins (include common Vite fallback ports for dev)
const allowedOrigins = CLIENT_URL
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .concat([
    "capacitor://localhost",
    "ionic://localhost",
    "http://localhost",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5176",
  ]);
const uniqueAllowedOrigins = [...new Set(allowedOrigins)];

// Socket.IO — chat + WebRTC signaling relay
const roomHosts = new Map(); // roomId → hostSocketId
const userSockets = new Map(); // userId → Set<socketId>

const io = new Server(server, {
  cors: { origin: uniqueAllowedOrigins, credentials: true },
});

// Make io + userSockets available to route handlers
app.locals.io = io;
app.locals.userSockets = userSockets;

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // allow /uploads images from browser
  }),
);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || uniqueAllowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
if (isProduction) {
  app.set("trust proxy", 1);
}
app.use(requestContext);
app.use(cookieParser());
// Capture raw body for Stripe webhooks before JSON parsing
app.use((req, _res, next) => {
  if (req.originalUrl === "/api/billing/webhook") {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => { req.rawBody = raw; next(); });
  } else {
    next();
  }
});
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(uploadsDir));

// Rate limiting — tighter on auth, loose on general API
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 30 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 120 : 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/billing", apiLimiter, billingRoutes);
app.use("/api/profiles", apiLimiter, profileRoutes);
app.use("/api/matches", apiLimiter, matchRoutes);
app.use("/api/messages", apiLimiter, messageRoutes);
app.use("/api/live", apiLimiter, liveRoutes);
app.use("/api/safety", apiLimiter, safetyRoutes);
app.use("/api/friends", apiLimiter, friendRoutes);
app.use("/api/gifts", apiLimiter, giftRoutes);
app.use("/api/referrals", apiLimiter, referralRoutes);
app.use("/api/profile-quality", apiLimiter, profileQualityRoutes);
app.use("/api/onboarding", apiLimiter, onboardingRoutes);
app.use("/api/security-admin", apiLimiter, securityAdminRoutes);
app.use("/api/admin", apiLimiter, adminRoutes);
app.use("/api/push", apiLimiter, pushRoutes);
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, timestamp: new Date().toISOString() }),
);
app.get("/api/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ ok: true, checks: { database: "up" } });
  } catch {
    return res.status(503).json({ ok: false, checks: { database: "down" } });
  }
});

app.use((err, req, res, next) => {
  logger.error("http.request.error", {
    requestId: req?.requestId || null,
    method: req?.method,
    path: req?.originalUrl,
    statusCode: err?.status || 500,
    error: logger.serializeError(err),
  });
  if (res.headersSent) return next(err);
  const status = err?.status || 500;
  return res.status(status).json({
    error: isProduction ? "Internal server error" : err?.message || "Internal server error",
    requestId: req?.requestId || null,
  });
});

io.on("connection", (socket) => {
  // Auth: client sends its userId on connect
  socket.on("auth:identify", async (userId) => {
    if (!userId) return;
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(socket.id);
    socket.data.userId = userId;
    // Update lastSeen on connect
    try {
      await prisma.user.update({ where: { id: userId }, data: { lastSeen: new Date() } });
    } catch { /* non-critical */ }
  });
  // Chat
  socket.on("chat:join", (roomId = "global") => {
    socket.join(roomId);
    socket.on("chat:message", async ({ roomId: rid, text, senderId, senderName }) => {
      const msg = { id: rid, senderId, senderName, roomId: rid, text, createdAt: new Date().toISOString() };
      io.to(rid).emit("chat:new_message", msg);
    });
  });

  // Typing indicators — broadcast to the room excluding sender
  socket.on("chat:typing", ({ roomId, typing }) => {
    const userId = socket.data.userId;
    if (roomId && userId) {
      socket.to(roomId).emit("chat:typing", { userId, typing });
    }
  });

  // Live — host registers room
  socket.on("live:host-room", ({ roomId }) => {
    roomHosts.set(roomId, socket.id);
    socket.join(`live:${roomId}`);
  });

  // Live — viewer joins room
  socket.on("live:join-room", async ({ roomId }) => {
    socket.join(`live:${roomId}`);
    const hostSocketId = roomHosts.get(roomId);
    if (hostSocketId) {
      io.to(hostSocketId).emit("live:viewer-joined", {
        viewerSocketId: socket.id,
      });
    }
    try {
      const room = await prisma.liveRoom.update({
        where: { id: roomId },
        data: { viewers: { increment: 1 } },
      });
      io.to(`live:${roomId}`).emit("live:viewer-count", {
        roomId,
        viewers: room.viewers,
      });
    } catch { /* room not found */ }
  });

  // WebRTC: host → viewer offer
  socket.on("live:offer", ({ viewerSocketId, sdp }) => {
    io.to(viewerSocketId).emit("live:offer", {
      hostSocketId: socket.id,
      sdp,
    });
  });

  // WebRTC: viewer → host answer
  socket.on("live:answer", ({ hostSocketId, sdp }) => {
    io.to(hostSocketId).emit("live:answer", {
      viewerSocketId: socket.id,
      sdp,
    });
  });

  // WebRTC: ICE candidate relay (bidirectional)
  socket.on("live:ice-candidate", ({ target, candidate }) => {
    io.to(target).emit("live:ice-candidate", {
      from: socket.id,
      candidate,
    });
  });

  socket.on("disconnecting", async () => {
    // Clean up user socket tracking + update lastSeen
    if (socket.data.userId) {
      const sockets = userSockets.get(socket.data.userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(socket.data.userId);
          // Update lastSeen when fully offline
          try {
            await prisma.user.update({ where: { id: socket.data.userId }, data: { lastSeen: new Date() } });
          } catch { /* non-critical */ }
        }
      }
    }
    for (const roomName of socket.rooms) {
      if (roomName.startsWith("live:")) {
        const roomId = roomName.replace("live:", "");
        try {
          const room = await prisma.liveRoom.findUnique({ where: { id: roomId } });
          if (room?.viewers > 0) {
            const updated = await prisma.liveRoom.update({
              where: { id: roomId },
              data: { viewers: { decrement: 1 } },
            });
            io.to(roomName).emit("live:viewer-count", {
              roomId,
              viewers: updated.viewers,
            });
          }
          if (roomHosts.get(roomId) === socket.id) {
            roomHosts.delete(roomId);
            await prisma.liveRoom.update({
              where: { id: roomId },
              data: { active: false },
            });
            io.to(roomName).emit("live:host-disconnected", { roomId });
          }
        } catch { /* room already gone */ }
      }
    }
  });
});

const start = async () => {
  await initDb();

  // Emergency recovery: force-reset passwords for admin emails when explicitly configured.
  if (ADMIN_BOOTSTRAP_PASSWORD) {
    const adminEmails = [...ADMIN_EMAILS];
    if (!adminEmails.length) {
      logger.warn("admin.bootstrap_password.skipped", {
        reason: "ADMIN_EMAILS is empty",
      });
    } else {
      const hash = await bcrypt.hash(ADMIN_BOOTSTRAP_PASSWORD, BCRYPT_ROUNDS);
      const result = await prisma.user.updateMany({
        where: { email: { in: adminEmails } },
        data: { passwordHash: hash },
      });
      logger.warn("admin.bootstrap_password.applied", {
        affectedUsers: result.count,
      });
    }
  }

  server.listen(PORT, () => {
    logger.info("server.started", {
      port: PORT,
      url: `http://localhost:${PORT}`,
    });
  });
};

let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn("server.shutdown.signal", { signal });

  server.close(async () => {
    try {
      await prisma.$disconnect();
      logger.info("server.shutdown.complete", { signal });
      process.exit(0);
    } catch (error) {
      logger.error("server.shutdown.error", { error: logger.serializeError(error) });
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error("server.shutdown.timeout", { timeoutMs: 10000 });
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error("process.unhandled_rejection", {
    error: logger.serializeError(reason instanceof Error ? reason : new Error(String(reason))),
  });
});
process.on("uncaughtException", (error) => {
  logger.error("process.uncaught_exception", {
    error: logger.serializeError(error),
  });
  shutdown("UNCAUGHT_EXCEPTION");
});

start().catch((error) => {
  logger.error("server.start.failed", { error: logger.serializeError(error) });
  process.exit(1);
});

