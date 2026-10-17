-- Принятые заявки в друзья раньше не создавали подписки, а «друг» = взаимная подписка.
-- Достраиваем недостающие подписки в обе стороны (идемпотентно).
INSERT INTO "Follow" ("follower_id", "following_id")
SELECT f."requester_id", f."addressee_id" FROM "Friendship" f WHERE f."status" = 'accepted'
UNION
SELECT f."addressee_id", f."requester_id" FROM "Friendship" f WHERE f."status" = 'accepted'
ON CONFLICT ("follower_id", "following_id") DO NOTHING;
