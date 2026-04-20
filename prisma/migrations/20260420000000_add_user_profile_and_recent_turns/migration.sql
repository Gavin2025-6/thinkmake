-- AddColumn: userProfile and recentTurns to Conversation
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "userProfile" JSONB;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "recentTurns" JSONB;
