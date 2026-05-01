import jwt from "jsonwebtoken";
import { ADMIN_EMAILS, JWT_SECRET, REFRESH_SECRET } from "../config/env.js";

export { JWT_SECRET, REFRESH_SECRET };

export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

export const requireAdmin = (req, res, next) => {
  const email = req.user?.email?.toLowerCase?.() || "";
  if (!email || !ADMIN_EMAILS.has(email)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  return next();
};

