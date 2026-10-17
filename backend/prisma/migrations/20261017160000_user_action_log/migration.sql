-- Журнал действий пользователей для разбора жалоб (заявки в друзья, подписки).
CREATE TABLE "UserActionLog" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    UUID         NOT NULL,
  "action"     VARCHAR(50)  NOT NULL,
  "target_id"  UUID,
  "ok"         BOOLEAN      NOT NULL DEFAULT true,
  "error"      VARCHAR(300),
  "before"     JSONB,
  "after"      JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserActionLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UserActionLog_user_id_created_at_idx"   ON "UserActionLog"("user_id", "created_at");
CREATE INDEX "UserActionLog_target_id_created_at_idx" ON "UserActionLog"("target_id", "created_at");
CREATE INDEX "UserActionLog_action_created_at_idx"    ON "UserActionLog"("action", "created_at");
