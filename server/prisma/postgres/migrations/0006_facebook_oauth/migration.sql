ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "facebookId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_facebookId_key" ON "User"("facebookId");
