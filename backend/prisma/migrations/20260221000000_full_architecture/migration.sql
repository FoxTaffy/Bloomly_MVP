-- AlterTable: Add new columns to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status_text" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "persona" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "header_url" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "likes_list" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dislikes_list" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "is_blocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add new columns to Post
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "original_post_id" UUID;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "group_id" UUID;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- Add Vote table timestamp column if missing
ALTER TABLE "Vote" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable: Follow
CREATE TABLE IF NOT EXISTS "Follow" (
    "id" UUID NOT NULL,
    "follower_id" UUID NOT NULL,
    "following_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Follow_follower_id_following_id_key" ON "Follow"("follower_id", "following_id");

-- CreateTable: Block
CREATE TABLE IF NOT EXISTS "Block" (
    "id" UUID NOT NULL,
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Block_blocker_id_blocked_id_key" ON "Block"("blocker_id", "blocked_id");

-- CreateTable: SavedPost
CREATE TABLE IF NOT EXISTS "SavedPost" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SavedPost_user_id_post_id_key" ON "SavedPost"("user_id", "post_id");

-- CreateTable: Comment
CREATE TABLE IF NOT EXISTS "Comment" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_comment_id" UUID,
    "content" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Comment_post_id_idx" ON "Comment"("post_id");
CREATE INDEX IF NOT EXISTS "Comment_user_id_idx" ON "Comment"("user_id");
CREATE INDEX IF NOT EXISTS "Comment_parent_comment_id_idx" ON "Comment"("parent_comment_id");

-- CreateTable: CommentVote
CREATE TABLE IF NOT EXISTS "CommentVote" (
    "user_id" UUID NOT NULL,
    "comment_id" UUID NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommentVote_pkey" PRIMARY KEY ("user_id","comment_id")
);

-- CreateTable: Group
CREATE TABLE IF NOT EXISTS "Group" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'creative',
    "creator_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Group_slug_key" ON "Group"("slug");

-- CreateTable: UserGroup
CREATE TABLE IF NOT EXISTS "UserGroup" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserGroup_group_id_user_id_key" ON "UserGroup"("group_id", "user_id");

-- CreateTable: Hashtag
CREATE TABLE IF NOT EXISTS "Hashtag" (
    "id" UUID NOT NULL,
    "tag" TEXT NOT NULL,
    CONSTRAINT "Hashtag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Hashtag_tag_key" ON "Hashtag"("tag");

-- CreateTable: PostHashtag
CREATE TABLE IF NOT EXISTS "PostHashtag" (
    "post_id" UUID NOT NULL,
    "hashtag_id" UUID NOT NULL,
    CONSTRAINT "PostHashtag_pkey" PRIMARY KEY ("post_id","hashtag_id")
);

-- CreateTable: Conversation
CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ConversationParticipant
CREATE TABLE IF NOT EXISTS "ConversationParticipant" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationParticipant_conversation_id_user_id_key" ON "ConversationParticipant"("conversation_id", "user_id");

-- CreateTable: Message
CREATE TABLE IF NOT EXISTS "Message" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Message_conversation_id_idx" ON "Message"("conversation_id");

-- CreateTable: MessageAttachment
CREATE TABLE IF NOT EXISTS "MessageAttachment" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Notification
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "actor_id" UUID,
    "type" TEXT NOT NULL,
    "entity_id" UUID,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_user_id_idx" ON "Notification"("user_id");

-- CreateTable: Report
CREATE TABLE IF NOT EXISTS "Report" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UserBadge
CREATE TABLE IF NOT EXISTS "UserBadge" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "badge_name" TEXT NOT NULL,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- AddForeignKeys
ALTER TABLE "Post" ADD CONSTRAINT IF NOT EXISTS "Post_original_post_id_fkey" FOREIGN KEY ("original_post_id") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT IF NOT EXISTS "Post_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Follow" ADD CONSTRAINT IF NOT EXISTS "Follow_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Follow" ADD CONSTRAINT IF NOT EXISTS "Follow_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Block" ADD CONSTRAINT IF NOT EXISTS "Block_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Block" ADD CONSTRAINT IF NOT EXISTS "Block_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SavedPost" ADD CONSTRAINT IF NOT EXISTS "SavedPost_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SavedPost" ADD CONSTRAINT IF NOT EXISTS "SavedPost_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT IF NOT EXISTS "Comment_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT IF NOT EXISTS "Comment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT IF NOT EXISTS "Comment_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommentVote" ADD CONSTRAINT IF NOT EXISTS "CommentVote_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommentVote" ADD CONSTRAINT IF NOT EXISTS "CommentVote_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "Comment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Group" ADD CONSTRAINT IF NOT EXISTS "Group_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserGroup" ADD CONSTRAINT IF NOT EXISTS "UserGroup_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserGroup" ADD CONSTRAINT IF NOT EXISTS "UserGroup_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PostHashtag" ADD CONSTRAINT IF NOT EXISTS "PostHashtag_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PostHashtag" ADD CONSTRAINT IF NOT EXISTS "PostHashtag_hashtag_id_fkey" FOREIGN KEY ("hashtag_id") REFERENCES "Hashtag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT IF NOT EXISTS "ConversationParticipant_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT IF NOT EXISTS "ConversationParticipant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT IF NOT EXISTS "Message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT IF NOT EXISTS "Message_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessageAttachment" ADD CONSTRAINT IF NOT EXISTS "MessageAttachment_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT IF NOT EXISTS "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT IF NOT EXISTS "Notification_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT IF NOT EXISTS "Report_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserBadge" ADD CONSTRAINT IF NOT EXISTS "UserBadge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
