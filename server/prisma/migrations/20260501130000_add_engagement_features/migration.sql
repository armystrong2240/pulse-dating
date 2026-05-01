-- Profile prompts, verification, pause, boost, premium
ALTER TABLE "User" ADD COLUMN "profilePrompts" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "User" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "verifiedStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "paused" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "boostedUntil" DATETIME;
ALTER TABLE "User" ADD COLUMN "isPremium" BOOLEAN NOT NULL DEFAULT 0;

-- Message read receipts
ALTER TABLE "Message" ADD COLUMN "readAt" DATETIME;

-- Message reactions
CREATE TABLE "MessageReaction" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "messageId" TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "emoji"     TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MessageReaction_messageId_userId_key" ON "MessageReaction"("messageId", "userId");

-- Block system
CREATE TABLE "BlockedUser" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "blockerId" TEXT NOT NULL,
  "blockedId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlockedUser_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BlockedUser_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BlockedUser_blockerId_blockedId_key" ON "BlockedUser"("blockerId", "blockedId");

-- Report system
CREATE TABLE "Report" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "reporterId" TEXT NOT NULL,
  "reportedId" TEXT NOT NULL,
  "reason"     TEXT NOT NULL,
  "details"    TEXT NOT NULL DEFAULT '',
  "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
