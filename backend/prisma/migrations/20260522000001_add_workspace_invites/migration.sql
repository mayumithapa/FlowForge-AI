-- Add WorkspaceInvite table for team invitation system

CREATE TABLE "WorkspaceInvite" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" UUID         NOT NULL,
    "email"       TEXT         NOT NULL,
    "role"        "UserRole"   NOT NULL DEFAULT 'MEMBER',
    "token"       TEXT         NOT NULL,
    "expiresAt"   TIMESTAMP(3) NOT NULL,
    "acceptedAt"  TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceInvite_token_key"        ON "WorkspaceInvite"("token");
CREATE INDEX        "WorkspaceInvite_workspaceId_idx"  ON "WorkspaceInvite"("workspaceId");
CREATE INDEX        "WorkspaceInvite_token_idx"        ON "WorkspaceInvite"("token");
CREATE INDEX        "WorkspaceInvite_email_idx"        ON "WorkspaceInvite"("email");

ALTER TABLE "WorkspaceInvite"
    ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
