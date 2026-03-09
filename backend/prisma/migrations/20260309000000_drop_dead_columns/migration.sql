-- Drop ghost table (no Prisma model, 1 orphaned row)
DROP TABLE IF EXISTS "AdProfile" CASCADE;

-- Drop SubscriptionPlan (0 rows, never queried in any service)
ALTER TABLE "User" DROP COLUMN IF EXISTS "subscriptionPlans_ref"; -- just in case
DROP TABLE IF EXISTS "SubscriptionPlan" CASCADE;

-- CommissionInfo.queue_count — never written or read in code
ALTER TABLE "CommissionInfo" DROP COLUMN IF EXISTS "queue_count";

-- AutoModLog.report_id — always NULL, no FK, never assigned
ALTER TABLE "AutoModLog" DROP COLUMN IF EXISTS "report_id";

-- RefreshToken.deleted_at — always NULL, revoked field covers the same purpose
ALTER TABLE "RefreshToken" DROP COLUMN IF EXISTS "deleted_at";

-- Group dead columns — never set by any service or frontend
ALTER TABLE "Group" DROP COLUMN IF EXISTS "mascot_url";
ALTER TABLE "Group" DROP COLUMN IF EXISTS "recent_works";
ALTER TABLE "Group" DROP COLUMN IF EXISTS "subscriber_count";
ALTER TABLE "Group" DROP COLUMN IF EXISTS "volunteers_info";
ALTER TABLE "Group" DROP COLUMN IF EXISTS "is_looking_for_volunteers";
