-- CreateTable
CREATE TABLE "TwitterCheck" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwitterCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TwitterCheck_username_idx" ON "TwitterCheck"("username");

-- CreateIndex
CREATE INDEX "TwitterCheck_date_idx" ON "TwitterCheck"("date");
