-- Add optional written proof text to verification requests, alongside (or instead of) uploaded evidence files.
ALTER TABLE "VerificationRequest" ADD COLUMN "evidence_text" VARCHAR(2000);
