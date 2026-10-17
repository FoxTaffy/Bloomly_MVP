-- CreateIndex
CREATE INDEX "Post_media_urls_idx" ON "Post" USING GIN ("media_urls");

-- CreateIndex
CREATE INDEX "Post_media_original_urls_idx" ON "Post" USING GIN ("media_original_urls");

-- CreateIndex
CREATE INDEX "Story_image_url_idx" ON "Story"("image_url");

-- CreateIndex
CREATE INDEX "Story_video_url_idx" ON "Story"("video_url");

-- CreateIndex
CREATE INDEX "Comment_file_url_idx" ON "Comment"("file_url");

-- CreateIndex
CREATE INDEX "MediaHistory_url_idx" ON "MediaHistory"("url");

-- CreateIndex
CREATE INDEX "Message_file_url_idx" ON "Message"("file_url");

-- CreateIndex
CREATE INDEX "FursonaReferenceImage_image_url_idx" ON "FursonaReferenceImage"("image_url");

-- CreateIndex
CREATE INDEX "Fursuit_image_url_idx" ON "Fursuit"("image_url");

-- CreateIndex
CREATE INDEX "AlbumItem_media_url_idx" ON "AlbumItem"("media_url");

