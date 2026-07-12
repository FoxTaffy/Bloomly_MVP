-- AlterTable: User gets an optional avatar_video_url (animated WebM counterpart of a GIF avatar)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatar_video_url" TEXT;

-- AlterTable: MediaHistory gets an optional video_url alongside url (for archived GIF/WebM avatars)
ALTER TABLE "MediaHistory" ADD COLUMN IF NOT EXISTS "video_url" TEXT;
