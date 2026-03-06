-- AlterTable: email_verified + nullable password
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;

-- CreateTable: OAuthAccount
CREATE TABLE IF NOT EXISTS "OAuthAccount" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"     UUID         NOT NULL,
    "provider"    VARCHAR(50)  NOT NULL,
    "provider_id" TEXT         NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OAuthAccount_provider_provider_id_key" ON "OAuthAccount"("provider", "provider_id");

-- AddForeignKey
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: EmailOtp
CREATE TABLE IF NOT EXISTS "EmailOtp" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "email"      TEXT         NOT NULL,
    "code"       VARCHAR(10)  NOT NULL,
    "purpose"    VARCHAR(30)  NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used"       BOOLEAN      NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailOtp_email_purpose_idx" ON "EmailOtp"("email", "purpose");
