ALTER TABLE "ChallengeParticipant" ADD COLUMN "finalizationError" TEXT;
CREATE INDEX "ChallengeParticipant_finalizedAt_idx" ON "ChallengeParticipant" ("challengeId", "finalizedAt");
