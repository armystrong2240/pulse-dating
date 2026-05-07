-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentPeriodEnd" DATETIME,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Gift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "giftType" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Gift_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Gift_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "rewardGiven" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("createdAt", "id", "imageUrl", "readAt", "roomId", "senderId", "senderName", "text") SELECT "createdAt", "id", "imageUrl", "readAt", "roomId", "senderId", "senderName", "text" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT '',
    "zipCode" TEXT NOT NULL DEFAULT '',
    "pronouns" TEXT NOT NULL DEFAULT '',
    "genderIdentity" TEXT NOT NULL DEFAULT '',
    "sexualOrientation" TEXT NOT NULL DEFAULT '',
    "polyPreference" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL,
    "interests" TEXT NOT NULL DEFAULT '[]',
    "lookingFor" TEXT NOT NULL DEFAULT 'Open to meeting people',
    "profileTheme" TEXT NOT NULL DEFAULT 'sunset',
    "profileGraphic" TEXT NOT NULL DEFAULT 'none',
    "musicUrl" TEXT NOT NULL DEFAULT '',
    "profileMotto" TEXT NOT NULL DEFAULT '',
    "dreamDate" TEXT NOT NULL DEFAULT '',
    "avatar" TEXT NOT NULL DEFAULT '',
    "latitude" REAL NOT NULL DEFAULT 0,
    "longitude" REAL NOT NULL DEFAULT 0,
    "profilePrompts" TEXT NOT NULL DEFAULT '[]',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedStatus" TEXT NOT NULL DEFAULT '',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "boostedUntil" DATETIME,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "premiumTier" TEXT NOT NULL DEFAULT 'free',
    "boostCredits" INTEGER NOT NULL DEFAULT 0,
    "profileScore" INTEGER NOT NULL DEFAULT 0,
    "onboardingStep" TEXT NOT NULL DEFAULT 'basics',
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifyToken" TEXT,
    "referralCode" TEXT,
    "referredById" TEXT,
    "lastSeen" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("age", "avatar", "bio", "boostedUntil", "city", "createdAt", "dreamDate", "email", "emailVerified", "genderIdentity", "id", "interests", "isPremium", "latitude", "longitude", "lookingFor", "musicUrl", "name", "onboardingCompleted", "onboardingStep", "passwordHash", "paused", "polyPreference", "profileGraphic", "profileMotto", "profilePrompts", "profileScore", "profileTheme", "pronouns", "sexualOrientation", "state", "verified", "verifiedStatus", "verifyToken", "zipCode") SELECT "age", "avatar", "bio", "boostedUntil", "city", "createdAt", "dreamDate", "email", "emailVerified", "genderIdentity", "id", "interests", "isPremium", "latitude", "longitude", "lookingFor", "musicUrl", "name", "onboardingCompleted", "onboardingStep", "passwordHash", "paused", "polyPreference", "profileGraphic", "profileMotto", "profilePrompts", "profileScore", "profileTheme", "pronouns", "sexualOrientation", "state", "verified", "verifiedStatus", "verifyToken", "zipCode" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Gift_toId_idx" ON "Gift"("toId");

-- CreateIndex
CREATE INDEX "Gift_fromId_idx" ON "Gift"("fromId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_refereeId_key" ON "Referral"("refereeId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");
