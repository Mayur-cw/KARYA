-- KARYA Core Database Schema (SQLite 3 WAL)
-- Invariants: Foreign keys, parameterized queries, atomic state transitions

PRAGMA foreign_keys = ON;

-- 1. ENT-User
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  departmentId TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('admin', 'student', 'reviewer')),
  active INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_dept_role_active ON users (departmentId, role, active);

-- 2. ENT-SourceDocument
CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  departmentId TEXT NOT NULL,
  ownerId TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  mime TEXT NOT NULL CHECK(mime IN ('text/plain', 'application/pdf')),
  sha256 TEXT NOT NULL,
  extractedText TEXT NOT NULL,
  pageOffsets TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded', 'referenced', 'deleted')),
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sourcedocs_dept_created ON source_documents (departmentId, createdAt);
CREATE INDEX IF NOT EXISTS idx_sourcedocs_owner_sha ON source_documents (ownerId, sha256);

-- 3. ENT-Workflow
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT NOT NULL,
  departmentId TEXT NOT NULL,
  createdBy TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  sourceId TEXT REFERENCES source_documents(id),
  status TEXT NOT NULL CHECK(status IN ('draft', 'proposed', 'published', 'archived')),
  origin TEXT NOT NULL DEFAULT 'not_proposed' CHECK(origin IN ('ai', 'manual', 'not_proposed')),
  fields TEXT NOT NULL,
  stages TEXT NOT NULL,
  uncertainties TEXT NOT NULL,
  requirements TEXT NOT NULL DEFAULT '[]',
  deadline TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  archiveReason TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (id, version)
);
CREATE INDEX IF NOT EXISTS idx_workflows_dept_status ON workflows (departmentId, status, createdAt);
CREATE INDEX IF NOT EXISTS idx_workflows_dept_deadline ON workflows (departmentId, deadline);

-- 4. ENT-Assignment
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  workflowId TEXT NOT NULL,
  studentId TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('invited', 'started', 'revoked', 'completed')),
  assignedAt TEXT NOT NULL,
  revokeReason TEXT,
  UNIQUE(workflowId, studentId)
);
CREATE INDEX IF NOT EXISTS idx_assignments_student_status ON assignments (studentId, status);
CREATE INDEX IF NOT EXISTS idx_assignments_workflow_status ON assignments (workflowId, status);

-- 5. ENT-Submission
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  workflowId TEXT NOT NULL,
  studentId TEXT NOT NULL REFERENCES users(id),
  assignmentId TEXT NOT NULL REFERENCES assignments(id),
  answers TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft', 'submitted', 'in_review', 'needs_changes', 'approved', 'rejected')),
  stageIndex INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  history TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(workflowId, studentId)
);
CREATE INDEX IF NOT EXISTS idx_submissions_wf_status ON submissions (workflowId, status, updatedAt);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions (studentId, updatedAt);

-- 6. ENT-Attachment
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  submissionId TEXT NOT NULL REFERENCES submissions(id),
  uploadedBy TEXT NOT NULL REFERENCES users(id),
  displayName TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  privateStorageKey TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'locked', 'removed')),
  createdAt TEXT NOT NULL,
  UNIQUE(id, sha256)
);
CREATE INDEX IF NOT EXISTS idx_attachments_sub ON attachments (submissionId, createdAt);

-- 7. ENT-Notification
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipientId TEXT NOT NULL REFERENCES users(id),
  eventType TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  targetRef TEXT,
  readAt TEXT,
  dismissedAt TEXT,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifs_recipient_read ON notifications (recipientId, readAt, createdAt);
CREATE INDEX IF NOT EXISTS idx_notifs_recipient_dismiss ON notifications (recipientId, dismissedAt);

-- 8. AuditLog (Append-Only Event Ledger)
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  departmentId TEXT NOT NULL,
  workflowId TEXT,
  actorId TEXT NOT NULL,
  actorRole TEXT NOT NULL,
  event TEXT NOT NULL,
  targetEntity TEXT NOT NULL,
  targetId TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  timestamp TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_dept_time ON audit_logs (departmentId, timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_wf ON audit_logs (workflowId, timestamp);

-- 9. Sessions (Restart Persistence)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  tokenHash TEXT NOT NULL UNIQUE,
  userId TEXT NOT NULL REFERENCES users(id),
  csrfToken TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  lastActiveAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (userId);
