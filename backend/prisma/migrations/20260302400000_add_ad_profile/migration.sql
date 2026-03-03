-- CreateTable
CREATE TABLE "AdProfile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(50),
    "bio" VARCHAR(300),
    "avatar_url" TEXT,
    "banner_url" TEXT,
    "accent_color" VARCHAR(20),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdProfile_user_id_key" ON "AdProfile"("user_id");

-- CreateIndex
CREATE INDEX "AdProfile_user_id_idx" ON "AdProfile"("user_id");

-- AddForeignKey
ALTER TABLE "AdProfile" ADD CONSTRAINT "AdProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
