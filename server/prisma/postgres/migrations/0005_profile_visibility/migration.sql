-- Migration 0005: per-field profile visibility preferences
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileVisibility" TEXT NOT NULL DEFAULT '{}';
