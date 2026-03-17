-- Add slug_aliases array to Group for backward-compatible slug redirects
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "slug_aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
