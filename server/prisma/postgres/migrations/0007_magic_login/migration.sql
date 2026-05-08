ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "magicLoginToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "magicLoginTokenExpiry" TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS "User_magicLoginToken_key" ON "User"("magicLoginToken");