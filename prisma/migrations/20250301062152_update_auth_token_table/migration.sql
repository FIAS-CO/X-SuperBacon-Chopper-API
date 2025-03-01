-- CreateTable
CREATE TABLE "AuthToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT '2000-01-01 00:00:00 +00:00',
    "resetTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_token_key" ON "AuthToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_accountId_key" ON "AuthToken"("accountId");
