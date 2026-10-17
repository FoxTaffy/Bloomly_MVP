-- CreateTable: синонимы хештегов (alias → canonical), задаются в админке
CREATE TABLE "TagSynonym" (
    "alias"      VARCHAR(100) NOT NULL,
    "canonical"  VARCHAR(100) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TagSynonym_pkey" PRIMARY KEY ("alias")
);

CREATE INDEX "TagSynonym_canonical_idx" ON "TagSynonym"("canonical");
