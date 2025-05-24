-- CreateTable
CREATE TABLE "ApiAccessLog" (
    "id" SERIAL NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "requestIp" TEXT NOT NULL,
    "connectionIp" TEXT NOT NULL,
    "userAgent" TEXT,
    "responseStatus" INTEGER NOT NULL,
    "responseTime" INTEGER NOT NULL,
    "screenName" TEXT,
    "errorCode" INTEGER,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockReason" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiAccessLog_timestamp_idx" ON "ApiAccessLog"("timestamp");

-- CreateIndex
CREATE INDEX "ApiAccessLog_requestIp_idx" ON "ApiAccessLog"("requestIp");

-- CreateIndex
CREATE INDEX "ApiAccessLog_isBlocked_idx" ON "ApiAccessLog"("isBlocked");
