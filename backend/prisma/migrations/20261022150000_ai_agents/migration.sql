-- Агент верификации: решение, уверенность, отчёт и хэши доказательств в заявке.
ALTER TABLE "VerificationRequest"
    ADD COLUMN "decided_by_agent" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "agent_confidence" INTEGER,
    ADD COLUMN "agent_report" JSONB,
    ADD COLUMN "agent_attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "agent_last_error" VARCHAR(300),
    ADD COLUMN "agent_checked_at" TIMESTAMP(3),
    ADD COLUMN "evidence_hashes" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "VerificationRequest_evidence_hashes_idx" ON "VerificationRequest" USING GIN ("evidence_hashes");

-- Журнал агентов-наблюдателей админ-панели.
CREATE TABLE "AgentLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent" VARCHAR(40) NOT NULL,
    "tab" VARCHAR(30) NOT NULL,
    "level" VARCHAR(10) NOT NULL,
    "summary" VARCHAR(300) NOT NULL,
    "details" JSONB,
    "fingerprint" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentLog_agent_created_at_idx" ON "AgentLog"("agent", "created_at" DESC);
CREATE INDEX "AgentLog_created_at_idx" ON "AgentLog"("created_at");
