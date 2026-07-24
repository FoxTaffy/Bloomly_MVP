-- Group event lifecycle: admin-set event_date gates SOON badges + participation;
-- past-due event groups demote plain members to notification-only subscribers

ALTER TABLE "Group" ADD COLUMN "event_date" TIMESTAMP(3);
ALTER TABLE "Group" ADD COLUMN "event_expired_at" TIMESTAMP(3);

CREATE TABLE "GroupSubscriber" (
  "group_id"   UUID NOT NULL,
  "user_id"    UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupSubscriber_pkey" PRIMARY KEY ("group_id","user_id")
);
ALTER TABLE "GroupSubscriber" ADD CONSTRAINT "GroupSubscriber_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupSubscriber" ADD CONSTRAINT "GroupSubscriber_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "GroupSubscriber_user_id_idx" ON "GroupSubscriber"("user_id");
