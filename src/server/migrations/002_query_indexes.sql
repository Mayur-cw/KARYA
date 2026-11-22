-- Bounded list queries and session cleanup use covering/partial indexes.
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expiresAt);
CREATE INDEX IF NOT EXISTS idx_audit_dept_event_time ON audit_logs (departmentId, event, timestamp DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_active_time ON notifications (recipientId, createdAt DESC, id) WHERE dismissedAt IS NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_workflow_updated ON submissions (workflowId, updatedAt DESC, id);
-- Audit entries are append-only even if an application path accidentally attempts mutation.
CREATE TRIGGER IF NOT EXISTS audit_logs_prevent_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'Audit records are append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_logs_prevent_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'Audit records are append-only'); END;

CREATE INDEX IF NOT EXISTS idx_workflows_sourceId ON workflows (sourceId);
CREATE INDEX IF NOT EXISTS idx_submissions_status_stage ON submissions (status, stageIndex);
CREATE INDEX IF NOT EXISTS idx_attachments_submission ON attachments (submissionId, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs (targetEntity, targetId, timestamp);
