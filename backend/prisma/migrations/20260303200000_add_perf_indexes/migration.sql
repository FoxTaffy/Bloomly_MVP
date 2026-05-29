-- Performance indexes added for faster query execution
-- Vote(post_id): speeds up rating recalculation aggregate
CREATE INDEX IF NOT EXISTS "Vote_post_id_idx" ON "Vote"("post_id");

-- Comment(post_id): speeds up fetching comments for a post
CREATE INDEX IF NOT EXISTS "Comment_post_id_idx" ON "Comment"("post_id");

-- Comment(parent_id): speeds up nested reply lookups
CREATE INDEX IF NOT EXISTS "Comment_parent_id_idx" ON "Comment"("parent_id");

-- CommentVote(comment_id): speeds up comment vote lookups
CREATE INDEX IF NOT EXISTS "CommentVote_comment_id_idx" ON "CommentVote"("comment_id");
