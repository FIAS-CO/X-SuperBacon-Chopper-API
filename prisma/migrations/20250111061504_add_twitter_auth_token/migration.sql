-- CreateTable
CREATE TABLE "twitter_auth_token" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "token" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "twitter_auth_token_pkey" PRIMARY KEY ("id")
);
