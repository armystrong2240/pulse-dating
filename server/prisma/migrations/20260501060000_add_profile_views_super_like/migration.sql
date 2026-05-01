-- Add superLike column to Like table
ALTER TABLE "Like" ADD COLUMN "superLike" BOOLEAN NOT NULL DEFAULT 0;

-- Create ProfileView table
CREATE TABLE "ProfileView" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "viewerId" TEXT NOT NULL,
  "viewedId" TEXT NOT NULL,
  "viewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProfileView_viewedId_fkey" FOREIGN KEY ("viewedId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProfileView_viewerId_viewedId_key" ON "ProfileView"("viewerId", "viewedId");
