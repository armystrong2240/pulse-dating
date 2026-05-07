-- Migration 0004: Roses currency, login streaks, phone verification

-- ── New User columns ─────────────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "roseBalance"    INTEGER  NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginStreak"    INTEGER  NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginDate"  TEXT     NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneNumber"    TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneVerified"  BOOLEAN  NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "autoHidden"     BOOLEAN  NOT NULL DEFAULT false;

-- Unique index on phoneNumber (nullable — only enforced when NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS "User_phoneNumber_key" ON "User"("phoneNumber");

-- ── RoseLedger ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RoseLedger" (
  "id"        TEXT      NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"    TEXT      NOT NULL,
  "amount"    INTEGER   NOT NULL,
  "reason"    TEXT      NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoseLedger_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "RoseLedger_userId_idx" ON "RoseLedger"("userId");

-- ── PhoneVerification ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PhoneVerification" (
  "id"        TEXT      NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"    TEXT      NOT NULL,
  "phone"     TEXT      NOT NULL,
  "code"      TEXT      NOT NULL,
  "verified"  BOOLEAN   NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoneVerification_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PhoneVerification_userId_idx" ON "PhoneVerification"("userId");

-- ── ScheduledBoost ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ScheduledBoost" (
  "id"           TEXT      NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId"       TEXT      NOT NULL,
  "scheduledAt"  TIMESTAMP NOT NULL,
  "durationMin"  INTEGER   NOT NULL DEFAULT 30,
  "fired"        BOOLEAN   NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduledBoost_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ScheduledBoost_userId_idx"    ON "ScheduledBoost"("userId");
CREATE INDEX IF NOT EXISTS "ScheduledBoost_scheduled_idx" ON "ScheduledBoost"("scheduledAt", "fired");

-- ── Geo bounding box index on User ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS "User_lat_lng_idx" ON "User"("latitude", "longitude");
