-- ============================================================================
-- Baseline migration — represents the full schema as it existed before
-- migration files were introduced. This was applied via "prisma db push".
-- On the existing Render DB, mark this as already applied with:
--   npx prisma migrate resolve --applied "20260521000000_baseline"
-- ============================================================================

-- Enums
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "NodeType" AS ENUM (
  'TRIGGER_WEBHOOK', 'TRIGGER_MANUAL', 'TRIGGER_SCHEDULE',
  'AI_CLASSIFY', 'AI_SENTIMENT', 'AI_SUMMARIZE', 'AI_GENERATE_EMAIL',
  'EMAIL_SEND', 'DB_UPDATE_LEAD', 'ANALYTICS_RECORD', 'CONDITION', 'DELAY'
);
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED', 'RETRYING');
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'CHURNED');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED');
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'BOUNCED', 'OPENED', 'CLICKED');
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'RETRYING', 'DEAD');

-- User
CREATE TABLE "User" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "email"        TEXT         NOT NULL,
    "passwordHash" TEXT         NOT NULL,
    "fullName"     TEXT,
    "avatarUrl"    TEXT,
    "isActive"     BOOLEAN      NOT NULL DEFAULT true,
    "lastLoginAt"  TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    "deletedAt"    TIMESTAMP(3),
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- RefreshToken
CREATE TABLE "RefreshToken" (
    "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
    "userId"    UUID         NOT NULL,
    "tokenHash" TEXT         NOT NULL,
    "userAgent" TEXT,
    "ip"        TEXT,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- Workspace
CREATE TABLE "Workspace" (
    "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
    "name"      TEXT         NOT NULL,
    "slug"      TEXT         NOT NULL,
    "ownerId"   UUID         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");
CREATE INDEX "Workspace_deletedAt_idx" ON "Workspace"("deletedAt");

-- WorkspaceMember
CREATE TABLE "WorkspaceMember" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID         NOT NULL,
    "userId"      UUID         NOT NULL,
    "role"        "UserRole"   NOT NULL DEFAULT 'MEMBER',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- Workflow
CREATE TABLE "Workflow" (
    "id"                 UUID              NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId"        UUID              NOT NULL,
    "name"               TEXT              NOT NULL,
    "description"        TEXT,
    "status"             "WorkflowStatus"  NOT NULL DEFAULT 'DRAFT',
    "publishedVersionId" UUID,
    "webhookToken"       TEXT,
    "webhookSecret"      TEXT,
    "webhookFields"      JSONB,
    "createdAt"          TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3)      NOT NULL,
    "deletedAt"          TIMESTAMP(3),
    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Workflow_webhookToken_key" ON "Workflow"("webhookToken");
CREATE INDEX "Workflow_workspaceId_status_idx" ON "Workflow"("workspaceId", "status");
CREATE INDEX "Workflow_workspaceId_deletedAt_idx" ON "Workflow"("workspaceId", "deletedAt");

-- WorkflowVersion
CREATE TABLE "WorkflowVersion" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "workflowId"  UUID         NOT NULL,
    "version"     INTEGER      NOT NULL,
    "graph"       JSONB        NOT NULL,
    "isPublished" BOOLEAN      NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkflowVersion_workflowId_version_key" ON "WorkflowVersion"("workflowId", "version");
CREATE INDEX "WorkflowVersion_workflowId_idx" ON "WorkflowVersion"("workflowId");

-- WorkflowNode
CREATE TABLE "WorkflowNode" (
    "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
    "versionId" UUID         NOT NULL,
    "nodeKey"   TEXT         NOT NULL,
    "type"      "NodeType"   NOT NULL,
    "config"    JSONB        NOT NULL,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "WorkflowNode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkflowNode_versionId_nodeKey_key" ON "WorkflowNode"("versionId", "nodeKey");
CREATE INDEX "WorkflowNode_versionId_idx" ON "WorkflowNode"("versionId");
CREATE INDEX "WorkflowNode_type_idx" ON "WorkflowNode"("type");

-- WorkflowEdge
CREATE TABLE "WorkflowEdge" (
    "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
    "versionId" UUID         NOT NULL,
    "sourceKey" TEXT         NOT NULL,
    "targetKey" TEXT         NOT NULL,
    "label"     TEXT,
    CONSTRAINT "WorkflowEdge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkflowEdge_versionId_idx" ON "WorkflowEdge"("versionId");
CREATE INDEX "WorkflowEdge_versionId_sourceKey_idx" ON "WorkflowEdge"("versionId", "sourceKey");

-- WorkflowExecution
CREATE TABLE "WorkflowExecution" (
    "id"          UUID              NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID              NOT NULL,
    "workflowId"  UUID              NOT NULL,
    "versionId"   UUID,
    "status"      "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredBy" TEXT,
    "input"       JSONB,
    "output"      JSONB,
    "error"       TEXT,
    "startedAt"   TIMESTAMP(3),
    "finishedAt"  TIMESTAMP(3),
    "durationMs"  INTEGER,
    "createdAt"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)      NOT NULL,
    CONSTRAINT "WorkflowExecution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WorkflowExecution_workspaceId_status_idx" ON "WorkflowExecution"("workspaceId", "status");
CREATE INDEX "WorkflowExecution_workflowId_createdAt_idx" ON "WorkflowExecution"("workflowId", "createdAt");
CREATE INDEX "WorkflowExecution_status_createdAt_idx" ON "WorkflowExecution"("status", "createdAt");

-- ExecutionStep
CREATE TABLE "ExecutionStep" (
    "id"          UUID              NOT NULL DEFAULT gen_random_uuid(),
    "executionId" UUID              NOT NULL,
    "nodeKey"     TEXT              NOT NULL,
    "nodeType"    "NodeType"        NOT NULL,
    "status"      "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "attempt"     INTEGER           NOT NULL DEFAULT 0,
    "input"       JSONB,
    "output"      JSONB,
    "error"       TEXT,
    "startedAt"   TIMESTAMP(3),
    "finishedAt"  TIMESTAMP(3),
    "durationMs"  INTEGER,
    "createdAt"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)      NOT NULL,
    CONSTRAINT "ExecutionStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExecutionStep_executionId_idx" ON "ExecutionStep"("executionId");
CREATE INDEX "ExecutionStep_executionId_status_idx" ON "ExecutionStep"("executionId", "status");

-- Lead
CREATE TABLE "Lead" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId"    UUID         NOT NULL,
    "email"          TEXT         NOT NULL,
    "fullName"       TEXT,
    "company"        TEXT,
    "source"         TEXT,
    "status"         "LeadStatus" NOT NULL DEFAULT 'NEW',
    "classification" TEXT,
    "sentiment"      TEXT,
    "score"          DOUBLE PRECISION,
    "metadata"       JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "deletedAt"      TIMESTAMP(3),
    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Lead_workspaceId_email_key" ON "Lead"("workspaceId", "email");
CREATE INDEX "Lead_workspaceId_status_idx" ON "Lead"("workspaceId", "status");
CREATE INDEX "Lead_workspaceId_createdAt_idx" ON "Lead"("workspaceId", "createdAt");
CREATE INDEX "Lead_workspaceId_deletedAt_idx" ON "Lead"("workspaceId", "deletedAt");

-- EmailTemplate
CREATE TABLE "EmailTemplate" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId"  UUID         NOT NULL,
    "name"         TEXT         NOT NULL,
    "subject"      TEXT         NOT NULL,
    "bodyMarkdown" TEXT         NOT NULL,
    "variables"    TEXT[]       NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    "deletedAt"    TIMESTAMP(3),
    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailTemplate_workspaceId_idx" ON "EmailTemplate"("workspaceId");
CREATE INDEX "EmailTemplate_workspaceId_deletedAt_idx" ON "EmailTemplate"("workspaceId", "deletedAt");

-- Campaign
CREATE TABLE "Campaign" (
    "id"               UUID             NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId"      UUID             NOT NULL,
    "name"             TEXT             NOT NULL,
    "status"           "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "workflowId"       UUID,
    "templateId"       UUID,
    "scheduledAt"      TIMESTAMP(3),
    "startedAt"        TIMESTAMP(3),
    "completedAt"      TIMESTAMP(3),
    "totalRecipients"  INTEGER          NOT NULL DEFAULT 0,
    "totalSent"        INTEGER          NOT NULL DEFAULT 0,
    "totalOpened"      INTEGER          NOT NULL DEFAULT 0,
    "totalClicked"     INTEGER          NOT NULL DEFAULT 0,
    "totalFailed"      INTEGER          NOT NULL DEFAULT 0,
    "createdAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3)     NOT NULL,
    "deletedAt"        TIMESTAMP(3),
    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Campaign_workspaceId_status_idx" ON "Campaign"("workspaceId", "status");
CREATE INDEX "Campaign_workspaceId_scheduledAt_idx" ON "Campaign"("workspaceId", "scheduledAt");

-- EmailMessage
CREATE TABLE "EmailMessage" (
    "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" TEXT          NOT NULL,
    "leadId"      UUID,
    "campaignId"  UUID,
    "toEmail"     TEXT          NOT NULL,
    "subject"     TEXT          NOT NULL,
    "bodyHtml"    TEXT          NOT NULL,
    "bodyText"    TEXT,
    "status"      "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "providerId"  TEXT,
    "error"       TEXT,
    "sentAt"      TIMESTAMP(3),
    "openedAt"    TIMESTAMP(3),
    "clickedAt"   TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailMessage_workspaceId_status_idx" ON "EmailMessage"("workspaceId", "status");
CREATE INDEX "EmailMessage_campaignId_status_idx" ON "EmailMessage"("campaignId", "status");
CREATE INDEX "EmailMessage_leadId_idx" ON "EmailMessage"("leadId");

-- AnalyticsEvent
CREATE TABLE "AnalyticsEvent" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "payload"     JSONB,
    "occurredAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AnalyticsEvent_workspaceId_name_occurredAt_idx" ON "AnalyticsEvent"("workspaceId", "name", "occurredAt");

-- JobLog
CREATE TABLE "JobLog" (
    "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId"    UUID,
    "queue"          TEXT         NOT NULL,
    "jobName"        TEXT         NOT NULL,
    "idempotencyKey" TEXT,
    "status"         "JobStatus"  NOT NULL DEFAULT 'QUEUED',
    "attempts"       INTEGER      NOT NULL DEFAULT 0,
    "maxAttempts"    INTEGER      NOT NULL DEFAULT 5,
    "payload"        JSONB,
    "result"         JSONB,
    "error"          TEXT,
    "startedAt"      TIMESTAMP(3),
    "finishedAt"     TIMESTAMP(3),
    "nextRetryAt"    TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JobLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JobLog_idempotencyKey_key" ON "JobLog"("idempotencyKey");
CREATE INDEX "JobLog_queue_status_idx" ON "JobLog"("queue", "status");
CREATE INDEX "JobLog_status_nextRetryAt_idx" ON "JobLog"("status", "nextRetryAt");
CREATE INDEX "JobLog_workspaceId_createdAt_idx" ON "JobLog"("workspaceId", "createdAt");

-- Foreign Keys
ALTER TABLE "RefreshToken"     ADD CONSTRAINT "RefreshToken_userId_fkey"          FOREIGN KEY ("userId")       REFERENCES "User"("id")            ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Workspace"        ADD CONSTRAINT "Workspace_ownerId_fkey"             FOREIGN KEY ("ownerId")      REFERENCES "User"("id")            ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember"  ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey"   FOREIGN KEY ("workspaceId")  REFERENCES "Workspace"("id")       ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember"  ADD CONSTRAINT "WorkspaceMember_userId_fkey"        FOREIGN KEY ("userId")       REFERENCES "User"("id")            ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Workflow"         ADD CONSTRAINT "Workflow_workspaceId_fkey"          FOREIGN KEY ("workspaceId")  REFERENCES "Workspace"("id")       ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Workflow"         ADD CONSTRAINT "Workflow_publishedVersionId_fkey"   FOREIGN KEY ("publishedVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkflowVersion"  ADD CONSTRAINT "WorkflowVersion_workflowId_fkey"   FOREIGN KEY ("workflowId")   REFERENCES "Workflow"("id")        ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "WorkflowNode"     ADD CONSTRAINT "WorkflowNode_versionId_fkey"        FOREIGN KEY ("versionId")    REFERENCES "WorkflowVersion"("id") ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "WorkflowEdge"     ADD CONSTRAINT "WorkflowEdge_versionId_fkey"        FOREIGN KEY ("versionId")    REFERENCES "WorkflowVersion"("id") ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")      ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_workflowId_fkey"  FOREIGN KEY ("workflowId")  REFERENCES "Workflow"("id")       ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "ExecutionStep"    ADD CONSTRAINT "ExecutionStep_executionId_fkey"     FOREIGN KEY ("executionId")  REFERENCES "WorkflowExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead"             ADD CONSTRAINT "Lead_workspaceId_fkey"              FOREIGN KEY ("workspaceId")  REFERENCES "Workspace"("id")       ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "EmailTemplate"    ADD CONSTRAINT "EmailTemplate_workspaceId_fkey"     FOREIGN KEY ("workspaceId")  REFERENCES "Workspace"("id")       ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Campaign"         ADD CONSTRAINT "Campaign_workspaceId_fkey"          FOREIGN KEY ("workspaceId")  REFERENCES "Workspace"("id")       ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Campaign"         ADD CONSTRAINT "Campaign_workflowId_fkey"           FOREIGN KEY ("workflowId")   REFERENCES "Workflow"("id")        ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Campaign"         ADD CONSTRAINT "Campaign_templateId_fkey"           FOREIGN KEY ("templateId")   REFERENCES "EmailTemplate"("id")   ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailMessage"     ADD CONSTRAINT "EmailMessage_leadId_fkey"           FOREIGN KEY ("leadId")       REFERENCES "Lead"("id")            ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailMessage"     ADD CONSTRAINT "EmailMessage_campaignId_fkey"       FOREIGN KEY ("campaignId")   REFERENCES "Campaign"("id")        ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobLog"           ADD CONSTRAINT "JobLog_workspaceId_fkey"            FOREIGN KEY ("workspaceId")  REFERENCES "Workspace"("id")       ON DELETE SET NULL ON UPDATE CASCADE;
