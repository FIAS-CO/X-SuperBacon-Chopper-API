-- CreateTable
CREATE TABLE "IpAccessControl" (
    "id" SERIAL NOT NULL,
    "ip" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpAccessControl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IpAccessControl_ip_key" ON "IpAccessControl"("ip");
