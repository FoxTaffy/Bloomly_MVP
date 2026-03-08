-- Add perks and description to TicketTier
ALTER TABLE "TicketTier" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "TicketTier" ADD COLUMN IF NOT EXISTS "perks" TEXT[] NOT NULL DEFAULT '{}';

-- Add sponsors (JSON array) to Group
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "sponsors" JSONB NOT NULL DEFAULT '[]';

-- Add volunteers info to Group
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "volunteers_info" TEXT;
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "is_looking_for_volunteers" BOOLEAN NOT NULL DEFAULT false;
