-- CreateTable: Friendship
CREATE TABLE "Friendship" (
  "id"          TEXT     NOT NULL PRIMARY KEY,
  "requesterId" TEXT     NOT NULL,
  "addresseeId" TEXT     NOT NULL,
  "status"      TEXT     NOT NULL DEFAULT 'pending',
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key"
  ON "Friendship"("requesterId", "addresseeId");
