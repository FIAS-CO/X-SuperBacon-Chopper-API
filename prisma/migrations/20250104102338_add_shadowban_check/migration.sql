-- CreateTable
CREATE TABLE "ShadowBanCheck" (
    "id" SERIAL NOT NULL,
    "screen_name" TEXT NOT NULL,
    "not_found" BOOLEAN NOT NULL DEFAULT false,
    "suspend" BOOLEAN NOT NULL DEFAULT false,
    "protect" BOOLEAN NOT NULL DEFAULT false,
    "search_ban" BOOLEAN NOT NULL DEFAULT false,
    "search_suggestion_ban" BOOLEAN NOT NULL DEFAULT false,
    "ghost_ban" BOOLEAN NOT NULL DEFAULT false,
    "reply_deboosting" BOOLEAN NOT NULL DEFAULT false,
    "sessionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowBanCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShadowBanCheck_screen_name_idx" ON "ShadowBanCheck"("screen_name");

-- CreateIndex
CREATE INDEX "ShadowBanCheck_date_idx" ON "ShadowBanCheck"("date");
