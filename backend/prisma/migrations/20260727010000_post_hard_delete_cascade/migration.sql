-- Posts belonging to a deleted group are now hard-deleted (see groupService.delete), which
-- requires the tables below to cascade instead of RESTRICT so Post rows can actually be removed.
-- Comment.post_id needs the same treatment; CommentVote must cascade from Comment for the same reason.
-- GroupTransaction/Order intentionally keep RESTRICT-equivalent behavior via an application-level
-- check (a group with financial history cannot be deleted at all) rather than a DB-level change.

ALTER TABLE "Comment" DROP CONSTRAINT "Comment_post_id_fkey";
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommentVote" DROP CONSTRAINT "CommentVote_comment_id_fkey";
ALTER TABLE "CommentVote" ADD CONSTRAINT "CommentVote_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Favourite" DROP CONSTRAINT "Favourite_post_id_fkey";
ALTER TABLE "Favourite" ADD CONSTRAINT "Favourite_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PostTag" DROP CONSTRAINT "PostTag_post_id_fkey";
ALTER TABLE "PostTag" ADD CONSTRAINT "PostTag_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PostView" DROP CONSTRAINT "PostView_post_id_fkey";
ALTER TABLE "PostView" ADD CONSTRAINT "PostView_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Repaw" DROP CONSTRAINT "Repaw_post_id_fkey";
ALTER TABLE "Repaw" ADD CONSTRAINT "Repaw_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserActivity" DROP CONSTRAINT "UserActivity_post_id_fkey";
ALTER TABLE "UserActivity" ADD CONSTRAINT "UserActivity_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Vote" DROP CONSTRAINT "Vote_post_id_fkey";
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
