ALTER TABLE "RefreshToken" ADD COLUMN "device_id" VARCHAR(64);
CREATE INDEX "RefreshToken_user_id_device_id_idx" ON "RefreshToken"("user_id", "device_id");
