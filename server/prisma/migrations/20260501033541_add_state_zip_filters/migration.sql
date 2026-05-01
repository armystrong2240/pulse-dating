-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT '',
    "zipCode" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL,
    "interests" TEXT NOT NULL DEFAULT '[]',
    "lookingFor" TEXT NOT NULL DEFAULT 'Open to meeting people',
    "avatar" TEXT NOT NULL DEFAULT '',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifyToken" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("age", "avatar", "bio", "city", "createdAt", "email", "emailVerified", "id", "interests", "lookingFor", "name", "passwordHash", "verifyToken") SELECT "age", "avatar", "bio", "city", "createdAt", "email", "emailVerified", "id", "interests", "lookingFor", "name", "passwordHash", "verifyToken" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
