-- Add job_title and pinned_post_id to User
ALTER TABLE "User" ADD COLUMN "job_title" VARCHAR(80);
ALTER TABLE "User" ADD COLUMN "pinned_post_id" UUID;

ALTER TABLE "User"
  ADD CONSTRAINT "User_pinned_post_id_fkey"
  FOREIGN KEY ("pinned_post_id")
  REFERENCES "Post"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
