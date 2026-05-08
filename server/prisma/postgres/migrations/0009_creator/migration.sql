-- Creator feature: add fields to User and new models

ALTER TABLE "User" ADD COLUMN "isCreator" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "creatorPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "creatorBio" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "creatorCover" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "creatorEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "CreatorSubscription" (
    "id" TEXT NOT NULL,
    "fanId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "paypalOrderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorSubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreatorSubscription_fanId_fkey" FOREIGN KEY ("fanId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreatorSubscription_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CreatorSubscription_fanId_creatorId_key" ON "CreatorSubscription"("fanId", "creatorId");
CREATE INDEX "CreatorSubscription_creatorId_idx" ON "CreatorSubscription"("creatorId");

CREATE TABLE "CreatorPost" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "mediaUrl" TEXT NOT NULL DEFAULT '',
    "mediaType" TEXT NOT NULL DEFAULT 'image',
    "isPPV" BOOLEAN NOT NULL DEFAULT false,
    "ppvPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorPost_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreatorPost_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CreatorPost_creatorId_idx" ON "CreatorPost"("creatorId");

CREATE TABLE "CreatorPostUnlock" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paypalOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorPostUnlock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreatorPostUnlock_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CreatorPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CreatorPostUnlock_postId_userId_key" ON "CreatorPostUnlock"("postId", "userId");

CREATE TABLE "CreatorTip" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "context" TEXT NOT NULL DEFAULT 'profile',
    "paypalOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorTip_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreatorTip_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreatorTip_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
