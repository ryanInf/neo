-- CreateTable
CREATE TABLE "ApiDoc" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "requestHeaders" JSONB NOT NULL,
    "requestBody" JSONB,
    "responseHeaders" JSONB NOT NULL,
    "responseBody" JSONB,
    "statusCode" INTEGER,
    "docMarkdown" TEXT,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionLog" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "skillVersion" INTEGER NOT NULL,
    "domain" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "error" TEXT,

    CONSTRAINT "ExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiDoc_requestHash_key" ON "ApiDoc"("requestHash");

-- CreateIndex
CREATE INDEX "ApiDoc_domain_idx" ON "ApiDoc"("domain");

-- CreateIndex
CREATE INDEX "ApiDoc_method_idx" ON "ApiDoc"("method");

-- CreateIndex
CREATE INDEX "ApiDoc_requestHash_idx" ON "ApiDoc"("requestHash");

-- CreateIndex
CREATE INDEX "Skill_domain_idx" ON "Skill"("domain");

-- CreateIndex
CREATE INDEX "Skill_version_idx" ON "Skill"("version");

-- CreateIndex
CREATE INDEX "ExecutionLog_skillId_idx" ON "ExecutionLog"("skillId");

-- CreateIndex
CREATE INDEX "ExecutionLog_domain_idx" ON "ExecutionLog"("domain");

-- CreateIndex
CREATE INDEX "ExecutionLog_timestamp_idx" ON "ExecutionLog"("timestamp");

-- AddForeignKey
ALTER TABLE "ExecutionLog" ADD CONSTRAINT "ExecutionLog_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
