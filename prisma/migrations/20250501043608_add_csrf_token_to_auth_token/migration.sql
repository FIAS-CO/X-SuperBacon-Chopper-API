/*
  Warnings:

  - A unique constraint covering the columns `[csrf_token]` on the table `AuthToken` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `csrf_token` to the `AuthToken` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AuthToken" ADD COLUMN     "csrf_token" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_csrf_token_key" ON "AuthToken"("csrf_token");
