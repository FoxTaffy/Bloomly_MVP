-- Add fursona gender and description fields to User
ALTER TABLE "User" ADD COLUMN "fursona_gender" VARCHAR(50);
ALTER TABLE "User" ADD COLUMN "fursona_description" TEXT;

-- Add verification type and evidence fields to VerificationRequest
ALTER TABLE "VerificationRequest" ADD COLUMN "verification_type" VARCHAR(30) DEFAULT 'general';
ALTER TABLE "VerificationRequest" ADD COLUMN "evidence_urls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "VerificationRequest" ADD COLUMN "badge_type" VARCHAR(30);

-- Add verification badge to User (specific type: artist, master, event)
ALTER TABLE "User" ADD COLUMN "verification_type" VARCHAR(30);
