-- Admin platform tools: staff action audit trail, broadcast notifications, site settings

ALTER TABLE "AutoModLog" ADD COLUMN "actor_id" UUID;
ALTER TABLE "AutoModLog" ADD CONSTRAINT "AutoModLog_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AdminBroadcast" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_id"        UUID NOT NULL,
  "title"           VARCHAR(200) NOT NULL,
  "body"            VARCHAR(2000) NOT NULL,
  "audience"        VARCHAR(30) NOT NULL,
  "recipient_count" INTEGER NOT NULL DEFAULT 0,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminBroadcast_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "AdminBroadcast" ADD CONSTRAINT "AdminBroadcast_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AdminBroadcast_created_at_idx" ON "AdminBroadcast"("created_at");

CREATE TABLE "SiteSetting" (
  "key"        VARCHAR(50) NOT NULL,
  "value"      BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);
