-- Минутные замеры числа пользователей онлайн для суточной аналитики активности.
CREATE TABLE "OnlineSample" (
    "id" SERIAL NOT NULL,
    "sampled_at" TIMESTAMP(3) NOT NULL,
    "online" INTEGER NOT NULL,

    CONSTRAINT "OnlineSample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnlineSample_sampled_at_key" ON "OnlineSample"("sampled_at");
CREATE INDEX "OnlineSample_online_idx" ON "OnlineSample"("online");
