-- AlterTable: add nearby opt-in fields to User
ALTER TABLE "User" ADD COLUMN "showInNearby" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "nearbyPrivacy" TEXT NOT NULL DEFAULT 'approximate';
