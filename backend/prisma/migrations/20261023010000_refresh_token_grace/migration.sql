ALTER TABLE "RefreshToken" ADD COLUMN "prev_token_hash" VARCHAR(64), ADD COLUMN "rotated_at" TIMESTAMPTZ(6);
CREATE INDEX "RefreshToken_prev_token_hash_idx" ON "RefreshToken"("prev_token_hash");
