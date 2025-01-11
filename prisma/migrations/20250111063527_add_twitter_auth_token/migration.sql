/*
  Warnings:

  - You are about to drop the `twitter_auth_token` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "twitter_auth_token";

-- CreateTable
CREATE TABLE "TwitterAuthToken" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "token" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwitterAuthToken_pkey" PRIMARY KEY ("id")
);
