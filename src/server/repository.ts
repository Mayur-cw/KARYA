import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import type {
  User,
  UserPublic,
  SourceDocument,
  Workflow,
  WorkflowField,
  WorkflowStage,
  WorkflowUncertainty,
  WorkflowRequirement,
  Assignment,
  Submission,
  DecisionRecord,
  Attachment,
  Notification,
  AuditLog,
  WorkflowAnalytics,
  ReviewAction,
} from '../shared/contracts.js';
import { recordAudit, createNotification } from './events.js';
import { seedDatabase } from './seed.js';

// Strict SQLite database row schemas
interface UserRow {
  id: string;
  departmentId: string;
  name: string;
  email: string;
  role: 'admin' | 'student' | 'reviewer';
  active: number;
  createdAt: string;
}

interface SourceDocumentRow {
  id: string;
  departmentId: string;
  ownerId: string;
  title: string;
  mime: 'text/plain' | 'application/pdf';
  sha256: string;
  extractedText: string;
  pageOffsets: string;
  status: 'uploaded' | 'referenced' | 'deleted';
  createdAt: string;
}

interface WorkflowRow {
  id: string;
  departmentId: string;
  createdBy: string;
  title: string;
  sourceId: string | null;
  status: 'draft' | 'proposed' | 'published' | 'archived';
  origin: 'ai' | 'manual' | 'not_proposed';
  fields: string;
  stages: string;
  uncertainties: string;
  requirements: string;
  deadline: string | null;
  version: number;
  archiveReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AssignmentRow {
  id: string;
  workflowId: string;
  studentId: string;
  status: 'invited' | 'started' | 'revoked' | 'completed';
  assignedAt: string;
  revokeReason: string | null;
}

interface SubmissionRow {
  id: string;
  workflowId: string;
  studentId: string;
  assignmentId: string;
  answers: string;
  status: 'draft' | 'submitted' | 'in_review' | 'needs_changes' | 'approved' | 'rejected';
  stageIndex: number;
  revision: number;
  version: number;
  history: string;
  createdAt: string;
  updatedAt: string;
}

interface AttachmentRow {
  id: string;
  submissionId: string;
  uploadedBy: string;
  displayName: string;
  mime: string;
  bytes: number;
  sha256: string;
  privateStorageKey: string;
  status: 'draft' | 'locked' | 'removed';
  createdAt: string;
}

interface NotificationRow {
  id: string;
  recipientId: string;
  eventType: string;
  title: string;
  body: string;
  targetRef: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

interface AuditLogRow {
  id: string;
  departmentId: string;
  workflowId: string | null;
  actorId: string;
  actorRole: string;
  event: string;
  targetEntity: string;
  targetId: string;
  details: string;
  timestamp: string;
}

interface CountRow {
  cnt: number;
}

interface StatusCountRow {
  status: string;
  cnt: number;
}

interface SubmissionStatusCountRow {
  status: string;
  stageIndex: number;
  cnt: number;
}

interface ReviewerSubmissionRow extends SubmissionRow {
  wf_title: string;
  wf_stages: string;
  wf_dept: string;
  wf_deadline: string | null;
  wf_created: string;
  wf_status: 'draft' | 'proposed' | 'published' | 'archived';
  wf_origin: 'ai' | 'manual' | 'not_proposed';
  wf_fields: string;
  wf_uncertainties: string;
  wf_reqs: string;
  wf_version: number;
  wf_created_at: string;
  wf_updated_at: string;
}

// Generic interfaces retained for mock/unit testing compatibility
export interface Repository<T extends { id: string }> {
  get(id: string): Promise<T | null>;
  list(limit: number, cursor?: string): Promise<{ items: T[]; nextCursor: string | null }>;
  save(value: T): Promise<void>;
  delete(id: string): Promise<boolean>;
}

export class MemoryRepository<T extends { id: string }> implements Repository<T> {
  private data = new Map<string, T>();
  async get(id: string) {
    return this.data.get(id) ?? null;
  }
  async list(limit: number, cursor?: string) {
    const all = [...this.data.values()].sort((a, b) => a.id.localeCompare(b.id));
    const start = cursor ? all.findIndex((x) => x.id === cursor) + 1 : 0;
    const slice = all.slice(start, start + limit);
    return {
      items: slice,
      nextCursor: slice.length === limit ? slice[slice.length - 1]?.id ?? null : null,
    };
  }
  async save(value: T) {
    this.data.set(value.id, value);
  }
  async delete(id: string) {
    return this.data.delete(id);
  }
}

// ==========================================
// SQLite Database Initialization
// ==========================================

let activeDb: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!activeDb) {
    activeDb = initDatabase();
  }
  return activeDb;
}

export function setDb(db: DatabaseSync): void {
  activeDb = db;
}

export function initDatabase(dbPath?: string): DatabaseSync {
  let resolvedPath = dbPath ?? (process.env.NODE_ENV === 'test' ? ':memory:' : undefined);
  if (!resolvedPath) {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const dataDir = path.resolve(dirname, '../../.data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    resolvedPath = path.join(dataDir, 'karya.db');
  }

  const db = new DatabaseSync(resolvedPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  // Run migration
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const migrationFile = path.resolve(dirname, 'migrations/001_init.sql');
  if (fs.existsSync(migrationFile)) {
    const sql = fs.readFileSync(migrationFile, 'utf8');
    db.exec(sql);
  } else {
    runEmbeddedSchema(db);
  }

  // Seed default 5 demo users
  seedDatabase(db);

  activeDb = db;
  return db;
}

function runEmbeddedSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
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

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      workflowId TEXT NOT NULL,
      studentId TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('invited', 'started', 'revoked', 'completed')),
      assignedAt TEXT NOT NULL,
      revokeReason TEXT,
      UNIQUE(workflowId, studentId)
    );

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

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      tokenHash TEXT NOT NULL UNIQUE,
      userId TEXT NOT NULL REFERENCES users(id),
      csrfToken TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      lastActiveAt INTEGER NOT NULL,
      expiresAt INTEGER NOT NULL
    );
  `);
}

// ==========================================
// Domain Repositories
// ==========================================

export class UserRepository {
  constructor(private db: DatabaseSync = getDb()) {}

  getById(id: string): UserPublic | null {
    const stmt = this.db.prepare('SELECT id, departmentId, name, email, role, active, createdAt FROM users WHERE id = ?');
    const row = stmt.get(id) as unknown as UserRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      departmentId: row.departmentId,
      name: row.name,
      email: row.email,
      role: row.role,
      active: Boolean(row.active),
      createdAt: row.createdAt,
    };
  }

  getByEmail(email: string): UserPublic | null {
    const stmt = this.db.prepare('SELECT id, departmentId, name, email, role, active, createdAt FROM users WHERE email = ?');
    const row = stmt.get(email) as unknown as UserRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      departmentId: row.departmentId,
      name: row.name,
      email: row.email,
      role: row.role,
      active: Boolean(row.active),
      createdAt: row.createdAt,
    };
  }

  update(id: string, updates: { name?: string; active?: boolean }): UserPublic | null {
    const user = this.getById(id);
    if (!user) return null;
    const newName = updates.name !== undefined ? updates.name : user.name;
    const newActive = updates.active !== undefined ? (updates.active ? 1 : 0) : (user.active ? 1 : 0);
    const stmt = this.db.prepare('UPDATE users SET name = ?, active = ? WHERE id = ?');
    stmt.run(newName, newActive, id);
    return this.getById(id);
  }

  listByDepartment(departmentId: string, role?: string): UserPublic[] {
    let sql = 'SELECT id, departmentId, name, email, role, active, createdAt FROM users WHERE departmentId = ?';
    const params: string[] = [departmentId];
    if (role) {
      sql += ' AND role = ?';
      params.push(role);
    }
    sql += ' ORDER BY name ASC';
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown as UserRow[];
    return rows.map((r) => ({
      id: r.id,
      departmentId: r.departmentId,
      name: r.name,
      email: r.email,
      role: r.role,
      active: Boolean(r.active),
      createdAt: r.createdAt,
    }));
  }

  create(user: User): UserPublic {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, departmentId, name, email, role, active, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(user.id, user.departmentId, user.name, user.email, user.role, user.active ? 1 : 0, user.createdAt);
    return {
      id: user.id,
      departmentId: user.departmentId,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
    };
  }
}

export class SourceDocumentRepository {
  constructor(private db: DatabaseSync = getDb()) {}

  getById(id: string): SourceDocument | null {
    const stmt = this.db.prepare('SELECT * FROM source_documents WHERE id = ?');
    const row = stmt.get(id) as unknown as SourceDocumentRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      departmentId: row.departmentId,
      ownerId: row.ownerId,
      title: row.title,
      mime: row.mime,
      sha256: row.sha256,
      extractedText: row.extractedText,
      pageOffsets: JSON.parse(row.pageOffsets || '[]'),
      status: row.status,
      createdAt: row.createdAt,
    };
  }

  create(doc: SourceDocument): void {
    const stmt = this.db.prepare(`
      INSERT INTO source_documents (id, departmentId, ownerId, title, mime, sha256, extractedText, pageOffsets, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      doc.id,
      doc.departmentId,
      doc.ownerId,
      doc.title,
      doc.mime,
      doc.sha256,
      doc.extractedText,
      JSON.stringify(doc.pageOffsets),
      doc.status,
      doc.createdAt
    );
  }

  updateTitle(id: string, newTitle: string): void {
    const stmt = this.db.prepare('UPDATE source_documents SET title = ? WHERE id = ?');
    stmt.run(newTitle, id);
  }

  deleteById(id: string): void {
    const stmt = this.db.prepare('UPDATE source_documents SET status = ? WHERE id = ?');
    stmt.run('deleted', id);
  }

  listByDepartment(departmentId: string): SourceDocument[] {
    const stmt = this.db.prepare(`
      SELECT * FROM source_documents WHERE departmentId = ? AND status != 'deleted' ORDER BY createdAt DESC
    `);
    const rows = stmt.all(departmentId) as unknown as SourceDocumentRow[];
    return rows.map((row) => ({
      id: row.id,
      departmentId: row.departmentId,
      ownerId: row.ownerId,
      title: row.title,
      mime: row.mime,
      sha256: row.sha256,
      extractedText: row.extractedText,
      pageOffsets: JSON.parse(row.pageOffsets || '[]'),
      status: row.status,
      createdAt: row.createdAt,
    }));
  }
}

export class WorkflowRepository {
  constructor(private db: DatabaseSync = getDb()) {}

  getLatestVersion(id: string): Workflow | null {
    const stmt = this.db.prepare('SELECT * FROM workflows WHERE id = ? ORDER BY version DESC LIMIT 1');
    const row = stmt.get(id) as unknown as WorkflowRow | undefined;
    if (!row) return null;
    return this.mapRowToWorkflow(row);
  }

  create(wf: Workflow): void {
    const stmt = this.db.prepare(`
      INSERT INTO workflows (id, departmentId, createdBy, title, sourceId, status, origin, fields, stages, uncertainties, requirements, deadline, version, archiveReason, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      wf.id,
      wf.departmentId,
      wf.createdBy,
      wf.title,
      wf.sourceId ?? null,
      wf.status,
      wf.origin,
      JSON.stringify(wf.fields),
      JSON.stringify(wf.stages),
      JSON.stringify(wf.uncertainties),
      JSON.stringify(wf.requirements ?? []),
      wf.deadline ?? null,
      wf.version,
      wf.archiveReason ?? null,
      wf.createdAt,
      wf.updatedAt ?? wf.createdAt
    );
  }

  updateVersioned(wf: Workflow, expectedVersion: number): boolean {
    const current = this.getLatestVersion(wf.id);
    if (!current || current.version !== expectedVersion) {
      return false;
    }

    const nextVersion = expectedVersion + 1;
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO workflows (id, departmentId, createdBy, title, sourceId, status, origin, fields, stages, uncertainties, requirements, deadline, version, archiveReason, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      wf.id,
      wf.departmentId,
      wf.createdBy,
      wf.title,
      wf.sourceId ?? null,
      wf.status,
      wf.origin,
      JSON.stringify(wf.fields),
      JSON.stringify(wf.stages),
      JSON.stringify(wf.uncertainties),
      JSON.stringify(wf.requirements ?? []),
      wf.deadline ?? null,
      nextVersion,
      wf.archiveReason ?? null,
      wf.createdAt,
      now
    );
    wf.version = nextVersion;
    wf.updatedAt = now;
    return true;
  }

  publishAtomic(
    workflowId: string,
    expectedVersion: number,
    studentIds: string[],
    actor: { id: string; role: string; departmentId: string }
  ): { success: boolean; error?: string; workflow?: Workflow } {
    const current = this.getLatestVersion(workflowId);
    if (!current) return { success: false, error: 'Workflow not found' };
    if (current.version !== expectedVersion) return { success: false, error: 'Concurrent modification: version mismatch' };

    if (!current.deadline) {
      return { success: false, error: 'Publication blocked: deadline is required' };
    }
    const deadlineDate = new Date(current.deadline);
    if (isNaN(deadlineDate.getTime()) || deadlineDate.getTime() <= Date.now()) {
      return { success: false, error: 'Publication blocked: deadline must be a valid future date' };
    }

    const unresolved = current.uncertainties.filter((u) => !u.resolved);
    if (unresolved.length > 0) {
      return {
        success: false,
        error: `Publication blocked: ${unresolved.length} unresolved uncertainties require administrator resolution notes`,
      };
    }

    if (!current.fields || current.fields.length === 0) {
      return { success: false, error: 'Publication blocked: at least one dynamic field is required' };
    }

    if (!current.stages || current.stages.length < 1) {
      return { success: false, error: 'Publication blocked: review stages must be configured' };
    }
    for (const stage of current.stages) {
      if (!stage.reviewerId) {
        return { success: false, error: `Publication blocked: stage '${stage.label}' lacks an assigned reviewer` };
      }
    }

    if (!studentIds || studentIds.length === 0) {
      return { success: false, error: 'Publication blocked: at least one student recipient must be assigned' };
    }

    this.db.exec('BEGIN TRANSACTION;');
    try {
      const nextVersion = current.version + 1;
      const now = new Date().toISOString();

      const stmtWf = this.db.prepare(`
        INSERT INTO workflows (id, departmentId, createdBy, title, sourceId, status, origin, fields, stages, uncertainties, requirements, deadline, version, archiveReason, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmtWf.run(
        current.id,
        current.departmentId,
        current.createdBy,
        current.title,
        current.sourceId ?? null,
        'published',
        current.origin,
        JSON.stringify(current.fields),
        JSON.stringify(current.stages),
        JSON.stringify(current.uncertainties),
        JSON.stringify(current.requirements ?? []),
        current.deadline,
        nextVersion,
        null,
        current.createdAt,
        now
      );

      const stmtAssign = this.db.prepare(`
        INSERT OR IGNORE INTO assignments (id, workflowId, studentId, status, assignedAt, revokeReason)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const studentId of studentIds) {
        const assignId = crypto.randomUUID();
        stmtAssign.run(assignId, workflowId, studentId, 'invited', now, null);

        createNotification(this.db, {
          recipientId: studentId,
          eventType: 'workflow_assigned',
          title: `New Process Assigned: ${current.title}`,
          body: `You have been assigned to '${current.title}'. Please review requirements and complete by ${current.deadline}.`,
          targetRef: `/student/workflows/${workflowId}`,
        });
      }

      recordAudit(this.db, {
        departmentId: current.departmentId,
        workflowId: current.id,
        actorId: actor.id,
        actorRole: actor.role,
        event: 'published',
        targetEntity: 'Workflow',
        targetId: current.id,
        details: { version: nextVersion, assignedCount: studentIds.length, deadline: current.deadline },
      });

      this.db.exec('COMMIT;');

      const publishedWf = this.getLatestVersion(workflowId)!;
      return { success: true, workflow: publishedWf };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      const msg = err instanceof Error ? err.message : 'Atomic publication failed';
      return { success: false, error: msg };
    }
  }

  archive(workflowId: string, reason: string, expectedVersion: number, actor: { id: string; role: string }): boolean {
    const current = this.getLatestVersion(workflowId);
    if (!current || current.version !== expectedVersion) return false;

    this.db.exec('BEGIN TRANSACTION;');
    try {
      const nextVersion = current.version + 1;
      const now = new Date().toISOString();
      const stmt = this.db.prepare(`
        INSERT INTO workflows (id, departmentId, createdBy, title, sourceId, status, origin, fields, stages, uncertainties, requirements, deadline, version, archiveReason, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        current.id,
        current.departmentId,
        current.createdBy,
        current.title,
        current.sourceId ?? null,
        'archived',
        current.origin,
        JSON.stringify(current.fields),
        JSON.stringify(current.stages),
        JSON.stringify(current.uncertainties),
        JSON.stringify(current.requirements ?? []),
        current.deadline ?? null,
        nextVersion,
        reason,
        current.createdAt,
        now
      );

      recordAudit(this.db, {
        departmentId: current.departmentId,
        workflowId: current.id,
        actorId: actor.id,
        actorRole: actor.role,
        event: 'archived',
        targetEntity: 'Workflow',
        targetId: current.id,
        details: { reason, version: nextVersion },
      });

      this.db.exec('COMMIT;');
      return true;
    } catch {
      this.db.exec('ROLLBACK;');
      return false;
    }
  }

  listByDepartment(departmentId: string): Workflow[] {
    const stmt = this.db.prepare(`
      SELECT w.* FROM workflows w
      INNER JOIN (
        SELECT id, MAX(version) as maxv FROM workflows GROUP BY id
      ) m ON w.id = m.id AND w.version = m.maxv
      WHERE w.departmentId = ?
      ORDER BY w.createdAt DESC
    `);
    const rows = stmt.all(departmentId) as unknown as WorkflowRow[];
    return rows.map((r) => this.mapRowToWorkflow(r));
  }

  private mapRowToWorkflow(row: WorkflowRow): Workflow {
    return {
      id: row.id,
      departmentId: row.departmentId,
      createdBy: row.createdBy,
      title: row.title,
      sourceId: row.sourceId ?? null,
      status: row.status,
      origin: row.origin,
      fields: JSON.parse(row.fields || '[]') as WorkflowField[],
      stages: JSON.parse(row.stages || '[]') as WorkflowStage[],
      uncertainties: JSON.parse(row.uncertainties || '[]') as WorkflowUncertainty[],
      requirements: JSON.parse(row.requirements || '[]') as WorkflowRequirement[],
      deadline: row.deadline ?? null,
      version: row.version,
      archiveReason: row.archiveReason ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export class AssignmentRepository {
  constructor(private db: DatabaseSync = getDb()) {}

  getById(id: string): Assignment | null {
    const stmt = this.db.prepare('SELECT * FROM assignments WHERE id = ?');
    const row = stmt.get(id) as unknown as AssignmentRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      workflowId: row.workflowId,
      studentId: row.studentId,
      status: row.status,
      assignedAt: row.assignedAt,
      revokeReason: row.revokeReason ?? null,
    };
  }

  getByStudentAndWorkflow(studentId: string, workflowId: string): Assignment | null {
    const stmt = this.db.prepare('SELECT * FROM assignments WHERE studentId = ? AND workflowId = ?');
    const row = stmt.get(studentId, workflowId) as unknown as AssignmentRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      workflowId: row.workflowId,
      studentId: row.studentId,
      status: row.status,
      assignedAt: row.assignedAt,
      revokeReason: row.revokeReason ?? null,
    };
  }

  listByWorkflow(workflowId: string): Assignment[] {
    const stmt = this.db.prepare('SELECT * FROM assignments WHERE workflowId = ? ORDER BY assignedAt ASC');
    const rows = stmt.all(workflowId) as unknown as AssignmentRow[];
    return rows.map((r) => ({
      id: r.id,
      workflowId: r.workflowId,
      studentId: r.studentId,
      status: r.status,
      assignedAt: r.assignedAt,
      revokeReason: r.revokeReason ?? null,
    }));
  }

  listByStudent(studentId: string): Assignment[] {
    const stmt = this.db.prepare('SELECT * FROM assignments WHERE studentId = ? ORDER BY assignedAt DESC');
    const rows = stmt.all(studentId) as unknown as AssignmentRow[];
    return rows.map((r) => ({
      id: r.id,
      workflowId: r.workflowId,
      studentId: r.studentId,
      status: r.status,
      assignedAt: r.assignedAt,
      revokeReason: r.revokeReason ?? null,
    }));
  }

  revoke(assignmentId: string, reason: string): boolean {
    const assign = this.getById(assignmentId);
    if (!assign || assign.status === 'started' || assign.status === 'completed') {
      return false;
    }
    const stmt = this.db.prepare("UPDATE assignments SET status = 'revoked', revokeReason = ? WHERE id = ?");
    stmt.run(reason, assignmentId);
    return true;
  }

  createAssignments(workflowId: string, studentIds: string[]): Assignment[] {
    const now = new Date().toISOString();
    const created: Assignment[] = [];
    for (const studentId of studentIds) {
      const id = crypto.randomUUID();
      this.db.prepare(`
        INSERT INTO assignments (id, workflowId, studentId, status, assignedAt)
        VALUES (?, ?, ?, 'invited', ?)
      `).run(id, workflowId, studentId, now);
      created.push({ id, workflowId, studentId, status: 'invited', assignedAt: now, revokeReason: null });
    }
    return created;
  }
}

export class SubmissionRepository {
  constructor(private db: DatabaseSync = getDb()) {}

  getById(id: string): Submission | null {
    const stmt = this.db.prepare('SELECT * FROM submissions WHERE id = ?');
    const row = stmt.get(id) as unknown as SubmissionRow | undefined;
    if (!row) return null;
    return this.mapRowToSubmission(row);
  }

  getByStudentAndWorkflow(studentId: string, workflowId: string): Submission | null {
    const stmt = this.db.prepare('SELECT * FROM submissions WHERE studentId = ? AND workflowId = ?');
    const row = stmt.get(studentId, workflowId) as unknown as SubmissionRow | undefined;
    if (!row) return null;
    return this.mapRowToSubmission(row);
  }

  createDraft(
    workflowId: string,
    studentId: string,
    assignmentId: string,
    initialAnswers: Record<string, unknown> = {}
  ): Submission {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const sub: Submission = {
      id,
      workflowId,
      studentId,
      assignmentId,
      answers: initialAnswers,
      status: 'draft',
      stageIndex: 0,
      revision: 1,
      version: 1,
      history: [],
      createdAt: now,
      updatedAt: now,
    };

    this.db.exec('BEGIN TRANSACTION;');
    try {
      const stmt = this.db.prepare(`
        INSERT INTO submissions (id, workflowId, studentId, assignmentId, answers, status, stageIndex, revision, version, history, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        sub.id,
        sub.workflowId,
        sub.studentId,
        sub.assignmentId,
        JSON.stringify(sub.answers),
        sub.status,
        sub.stageIndex,
        sub.revision,
        sub.version,
        JSON.stringify(sub.history),
        sub.createdAt,
        sub.updatedAt
      );

      this.db.prepare("UPDATE assignments SET status = 'started' WHERE id = ?").run(assignmentId);

      this.db.exec('COMMIT;');
      return sub;
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  updateAnswers(id: string, answers: Record<string, unknown>, expectedVersion: number): Submission | null {
    const current = this.getById(id);
    if (!current || current.version !== expectedVersion) return null;
    if (current.status !== 'draft' && current.status !== 'needs_changes') return null;

    const nextVersion = expectedVersion + 1;
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE submissions SET answers = ?, version = ?, updatedAt = ? WHERE id = ? AND version = ?
    `);
    const res = stmt.run(JSON.stringify(answers), nextVersion, now, id, expectedVersion);
    if (res.changes === 0) return null;

    return this.getById(id);
  }

  deleteDraft(submissionId: string, studentId: string, expectedVersion: number): { success: boolean; error?: string } {
    const current = this.getById(submissionId);
    if (!current) return { success: false, error: 'Submission not found' };
    if (current.studentId !== studentId) return { success: false, error: 'Forbidden' };
    if (current.status !== 'draft') {
      return { success: false, error: `Cannot delete submission in status '${current.status}'` };
    }
    if (current.version !== expectedVersion) {
      return { success: false, error: 'Version mismatch: submission has changed' };
    }

    this.db.exec('BEGIN TRANSACTION;');
    try {
      this.db.prepare('DELETE FROM attachments WHERE submissionId = ?').run(submissionId);
      this.db.prepare('DELETE FROM submissions WHERE id = ?').run(submissionId);
      this.db.prepare("UPDATE assignments SET status = 'invited' WHERE id = ?").run(current.assignmentId);
      this.db.exec('COMMIT;');
      return { success: true };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      const msg = err instanceof Error ? err.message : 'Draft deletion failed';
      return { success: false, error: msg };
    }
  }

  submitAtomic(
    submissionId: string,
    expectedVersion: number,
    workflow: Workflow,
    actor: { id: string; role: string; name: string }
  ): { success: boolean; error?: string; submission?: Submission } {
    const current = this.getById(submissionId);
    if (!current) return { success: false, error: 'Submission not found' };
    if (current.version !== expectedVersion) return { success: false, error: 'Version mismatch / stale submission' };

    const isCorrection = current.status === 'needs_changes';
    if (!isCorrection && current.status !== 'draft') {
      return { success: false, error: `Illegal transition from '${current.status}' to 'submitted'` };
    }

    if (!isCorrection && workflow.deadline) {
      const deadline = new Date(workflow.deadline).getTime();
      if (Date.now() > deadline) {
        return { success: false, error: 'Initial deadline has passed; new applications are closed' };
      }
    }
    if (workflow.status !== 'published') {
      return { success: false, error: 'Workflow is no longer published' };
    }

    this.db.exec('BEGIN TRANSACTION;');
    try {
      const nextVersion = current.version + 1;
      const nextRevision = isCorrection ? current.revision + 1 : current.revision;
      const now = new Date().toISOString();

      this.db.prepare("UPDATE attachments SET status = 'locked' WHERE submissionId = ?").run(submissionId);

      const stmt = this.db.prepare(`
        UPDATE submissions
        SET status = 'submitted', revision = ?, version = ?, updatedAt = ?
        WHERE id = ? AND version = ?
      `);
      const res = stmt.run(nextRevision, nextVersion, now, submissionId, expectedVersion);
      if (res.changes === 0) {
        this.db.exec('ROLLBACK;');
        return { success: false, error: 'Concurrent update conflict' };
      }

      const currentStage = workflow.stages[current.stageIndex];
      if (currentStage?.reviewerId) {
        createNotification(this.db, {
          recipientId: currentStage.reviewerId,
          eventType: isCorrection ? 'resubmission_received' : 'submission_received',
          title: `Pending Review: ${workflow.title}`,
          body: `${actor.name} has submitted their application (Revision ${nextRevision}) for review.`,
          targetRef: `/reviewer/submissions/${submissionId}`,
        });
      }

      recordAudit(this.db, {
        departmentId: workflow.departmentId,
        workflowId: workflow.id,
        actorId: actor.id,
        actorRole: actor.role,
        event: isCorrection ? 'resubmitted' : 'submitted',
        targetEntity: 'Submission',
        targetId: submissionId,
        details: { revision: nextRevision, version: nextVersion, isCorrection },
      });

      this.db.exec('COMMIT;');
      return { success: true, submission: this.getById(submissionId)! };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      const msg = err instanceof Error ? err.message : 'Submission failed';
      return { success: false, error: msg };
    }
  }

  recordDecisionAtomic(
    submissionId: string,
    action: ReviewAction,
    reason: string | undefined,
    expectedVersion: number,
    workflow: Workflow,
    reviewer: { id: string; role: string; name: string }
  ): { success: boolean; error?: string; submission?: Submission } {
    const current = this.getById(submissionId);
    if (!current) return { success: false, error: 'Submission not found' };
    if (current.version !== expectedVersion) return { success: false, error: 'Version mismatch: decision conflict' };

    if (current.status !== 'submitted' && current.status !== 'in_review') {
      return { success: false, error: `Cannot review submission in '${current.status}' status` };
    }

    const currentStage = workflow.stages[current.stageIndex];
    if (!currentStage || currentStage.reviewerId !== reviewer.id) {
      return { success: false, error: 'Forbidden: you are not assigned to review this submission stage' };
    }

    if (action !== 'approve' && (!reason || reason.trim().length < 10)) {
      return { success: false, error: 'Correction or rejection requires at least 10 characters explanation' };
    }

    this.db.exec('BEGIN TRANSACTION;');
    try {
      const nextVersion = current.version + 1;
      const now = new Date().toISOString();

      const decision: DecisionRecord = {
        stageIndex: current.stageIndex,
        reviewerId: reviewer.id,
        reviewerName: reviewer.name,
        action,
        reason: reason?.trim() || undefined,
        decidedAt: now,
      };

      const updatedHistory = [...current.history, decision];
      let newStatus: Submission['status'] = current.status;
      let newStageIndex = current.stageIndex;

      if (action === 'approve') {
        const isFinalStage = current.stageIndex + 1 >= workflow.stages.length;
        if (isFinalStage) {
          newStatus = 'approved';
          this.db.prepare("UPDATE assignments SET status = 'completed' WHERE id = ?").run(current.assignmentId);

          createNotification(this.db, {
            recipientId: current.studentId,
            eventType: 'submission_approved',
            title: `Application Approved: ${workflow.title}`,
            body: `Congratulations! Your application has been approved by final authority ${reviewer.name}.`,
            targetRef: `/student/submissions/${submissionId}`,
          });
        } else {
          newStageIndex = current.stageIndex + 1;
          newStatus = 'in_review';
          const nextStage = workflow.stages[newStageIndex];
          if (nextStage?.reviewerId) {
            createNotification(this.db, {
              recipientId: nextStage.reviewerId,
              eventType: 'submission_forwarded',
              title: `Pending Stage Review: ${workflow.title}`,
              body: `An application has been approved at Stage ${current.stageIndex + 1} and forwarded for your review.`,
              targetRef: `/reviewer/submissions/${submissionId}`,
            });
          }
        }
      } else if (action === 'needs_changes') {
        newStatus = 'needs_changes';
        createNotification(this.db, {
          recipientId: current.studentId,
          eventType: 'correction_requested',
          title: `Action Required: Correction Requested for ${workflow.title}`,
          body: `${reviewer.name} requested changes: "${reason}". Please revise and resubmit.`,
          targetRef: `/student/submissions/${submissionId}`,
        });
      } else if (action === 'reject') {
        newStatus = 'rejected';
        this.db.prepare("UPDATE assignments SET status = 'completed' WHERE id = ?").run(current.assignmentId);

        createNotification(this.db, {
          recipientId: current.studentId,
          eventType: 'submission_rejected',
          title: `Application Decision: ${workflow.title}`,
          body: `Your application has not been approved. Reason: "${reason}".`,
          targetRef: `/student/submissions/${submissionId}`,
        });
      }

      const stmt = this.db.prepare(`
        UPDATE submissions
        SET status = ?, stageIndex = ?, version = ?, history = ?, updatedAt = ?
        WHERE id = ? AND version = ?
      `);
      const res = stmt.run(
        newStatus,
        newStageIndex,
        nextVersion,
        JSON.stringify(updatedHistory),
        now,
        submissionId,
        expectedVersion
      );
      if (res.changes === 0) {
        this.db.exec('ROLLBACK;');
        return { success: false, error: 'Concurrent decision conflict' };
      }

      recordAudit(this.db, {
        departmentId: workflow.departmentId,
        workflowId: workflow.id,
        actorId: reviewer.id,
        actorRole: reviewer.role,
        event: `decision_${action}`,
        targetEntity: 'Submission',
        targetId: submissionId,
        details: { action, stageIndex: current.stageIndex, nextStatus: newStatus, version: nextVersion },
      });

      this.db.exec('COMMIT;');
      return { success: true, submission: this.getById(submissionId)! };
    } catch (err) {
      this.db.exec('ROLLBACK;');
      const msg = err instanceof Error ? err.message : 'Decision processing failed';
      return { success: false, error: msg };
    }
  }

  listByWorkflow(workflowId: string): Submission[] {
    const stmt = this.db.prepare('SELECT * FROM submissions WHERE workflowId = ? ORDER BY updatedAt DESC');
    const rows = stmt.all(workflowId) as unknown as SubmissionRow[];
    return rows.map((r) => this.mapRowToSubmission(r));
  }

  listByStudent(studentId: string): Submission[] {
    const stmt = this.db.prepare('SELECT * FROM submissions WHERE studentId = ? ORDER BY updatedAt DESC');
    const rows = stmt.all(studentId) as unknown as SubmissionRow[];
    return rows.map((r) => this.mapRowToSubmission(r));
  }

  listForReviewer(reviewerId: string): { submission: Submission; workflow: Workflow }[] {
    const stmt = this.db.prepare(`
      SELECT s.*, w.title as wf_title, w.stages as wf_stages, w.departmentId as wf_dept, w.deadline as wf_deadline, w.createdBy as wf_created, w.status as wf_status, w.origin as wf_origin, w.fields as wf_fields, w.uncertainties as wf_uncertainties, w.requirements as wf_reqs, w.version as wf_version, w.createdAt as wf_created_at, w.updatedAt as wf_updated_at
      FROM submissions s
      INNER JOIN workflows w ON s.workflowId = w.id
      INNER JOIN (
        SELECT id, MAX(version) as maxv FROM workflows GROUP BY id
      ) m ON w.id = m.id AND w.version = m.maxv
      WHERE s.status IN ('submitted', 'in_review')
      ORDER BY s.updatedAt ASC
    `);
    const rows = stmt.all() as unknown as ReviewerSubmissionRow[];
    const results: { submission: Submission; workflow: Workflow }[] = [];

    for (const r of rows) {
      const sub = this.mapRowToSubmission(r);
      const stages = JSON.parse(r.wf_stages || '[]') as WorkflowStage[];
      const activeStage = stages[sub.stageIndex];
      if (activeStage && activeStage.reviewerId === reviewerId) {
        results.push({
          submission: sub,
          workflow: {
            id: r.workflowId,
            departmentId: r.wf_dept,
            createdBy: r.wf_created,
            title: r.wf_title,
            status: r.wf_status,
            origin: r.wf_origin,
            fields: JSON.parse(r.wf_fields || '[]'),
            stages,
            uncertainties: JSON.parse(r.wf_uncertainties || '[]'),
            requirements: JSON.parse(r.wf_reqs || '[]'),
            deadline: r.wf_deadline ?? null,
            version: r.wf_version,
            createdAt: r.wf_created_at,
            updatedAt: r.wf_updated_at,
          },
        });
      }
    }

    return results;
  }

  private mapRowToSubmission(row: SubmissionRow): Submission {
    return {
      id: row.id,
      workflowId: row.workflowId,
      studentId: row.studentId,
      assignmentId: row.assignmentId,
      answers: JSON.parse(row.answers || '{}'),
      status: row.status,
      stageIndex: row.stageIndex,
      revision: row.revision,
      version: row.version,
      history: JSON.parse(row.history || '[]') as DecisionRecord[],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

export class AttachmentRepository {
  constructor(private db: DatabaseSync = getDb()) {}

  getById(id: string): Attachment | null {
    const stmt = this.db.prepare('SELECT * FROM attachments WHERE id = ?');
    const row = stmt.get(id) as unknown as AttachmentRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      submissionId: row.submissionId,
      uploadedBy: row.uploadedBy,
      displayName: row.displayName,
      mime: row.mime,
      bytes: row.bytes,
      sha256: row.sha256,
      privateStorageKey: row.privateStorageKey,
      status: row.status,
      createdAt: row.createdAt,
    };
  }

  listBySubmission(submissionId: string): Attachment[] {
    const stmt = this.db.prepare("SELECT * FROM attachments WHERE submissionId = ? AND status != 'removed' ORDER BY createdAt ASC");
    const rows = stmt.all(submissionId) as unknown as AttachmentRow[];
    return rows.map((row) => ({
      id: row.id,
      submissionId: row.submissionId,
      uploadedBy: row.uploadedBy,
      displayName: row.displayName,
      mime: row.mime,
      bytes: row.bytes,
      sha256: row.sha256,
      privateStorageKey: row.privateStorageKey,
      status: row.status,
      createdAt: row.createdAt,
    }));
  }

  create(att: Attachment): void {
    const stmt = this.db.prepare(`
      INSERT INTO attachments (id, submissionId, uploadedBy, displayName, mime, bytes, sha256, privateStorageKey, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      att.id,
      att.submissionId,
      att.uploadedBy,
      att.displayName,
      att.mime,
      att.bytes,
      att.sha256,
      att.privateStorageKey,
      att.status,
      att.createdAt
    );
  }

  updateDisplayName(id: string, displayName: string): void {
    this.db.prepare('UPDATE attachments SET displayName = ? WHERE id = ?').run(displayName, id);
  }

  remove(id: string): void {
    this.db.prepare("UPDATE attachments SET status = 'removed' WHERE id = ?").run(id);
  }
}

export class NotificationRepository {
  constructor(private db: DatabaseSync = getDb()) {}

  listByRecipient(recipientId: string): Notification[] {
    const stmt = this.db.prepare(`
      SELECT * FROM notifications WHERE recipientId = ? AND dismissedAt IS NULL ORDER BY createdAt DESC
    `);
    const rows = stmt.all(recipientId) as unknown as NotificationRow[];
    return rows.map((r) => ({
      id: r.id,
      recipientId: r.recipientId,
      eventType: r.eventType,
      title: r.title,
      body: r.body,
      targetRef: r.targetRef ?? null,
      readAt: r.readAt ?? null,
      dismissedAt: r.dismissedAt ?? null,
      createdAt: r.createdAt,
    }));
  }

  markRead(id: string, recipientId: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE notifications SET readAt = ? WHERE id = ? AND recipientId = ?
    `);
    const res = stmt.run(new Date().toISOString(), id, recipientId);
    return res.changes > 0;
  }

  dismiss(id: string, recipientId: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE notifications SET dismissedAt = ? WHERE id = ? AND recipientId = ?
    `);
    const res = stmt.run(new Date().toISOString(), id, recipientId);
    return res.changes > 0;
  }

  getUnreadCount(recipientId: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM notifications WHERE recipientId = ? AND readAt IS NULL AND dismissedAt IS NULL
    `);
    const row = stmt.get(recipientId) as unknown as CountRow | undefined;
    return row?.cnt ?? 0;
  }
}

export class AuditRepository {
  constructor(private db: DatabaseSync = getDb()) {}

  list(filters: { departmentId: string; workflowId?: string; actorId?: string; event?: string }): AuditLog[] {
    let sql = 'SELECT * FROM audit_logs WHERE departmentId = ?';
    const params: string[] = [filters.departmentId];

    if (filters.workflowId) {
      sql += ' AND workflowId = ?';
      params.push(filters.workflowId);
    }
    if (filters.actorId) {
      sql += ' AND actorId = ?';
      params.push(filters.actorId);
    }
    if (filters.event) {
      sql += ' AND event = ?';
      params.push(filters.event);
    }

    sql += ' ORDER BY timestamp DESC';
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as unknown as AuditLogRow[];
    return rows.map((r) => ({
      id: r.id,
      departmentId: r.departmentId,
      workflowId: r.workflowId ?? null,
      actorId: r.actorId,
      actorRole: r.actorRole,
      event: r.event,
      targetEntity: r.targetEntity,
      targetId: r.targetId,
      details: JSON.parse(r.details || '{}'),
      timestamp: r.timestamp,
    }));
  }
}

export class AnalyticsRepository {
  constructor(private db: DatabaseSync = getDb()) {}

  getWorkflowAnalytics(workflowId: string): WorkflowAnalytics {
    const userRepo = new UserRepository(this.db);
    const wfRepo = new WorkflowRepository(this.db);
    const wf = wfRepo.getLatestVersion(workflowId);

    const assignStmt = this.db.prepare('SELECT status, COUNT(*) as cnt FROM assignments WHERE workflowId = ? GROUP BY status');
    const assignRows = assignStmt.all(workflowId) as unknown as StatusCountRow[];
    const assignMap: Record<string, number> = {};
    for (const r of assignRows) {
      assignMap[r.status] = Number(r.cnt);
    }

    const subStmt = this.db.prepare('SELECT status, stageIndex, COUNT(*) as cnt FROM submissions WHERE workflowId = ? GROUP BY status, stageIndex');
    const subRows = subStmt.all(workflowId) as unknown as SubmissionStatusCountRow[];
    const subMap: Record<string, number> = {};
    const pendingByStage: Record<number, number> = {};

    for (const r of subRows) {
      subMap[r.status] = (subMap[r.status] || 0) + Number(r.cnt);
      if (r.status === 'submitted' || r.status === 'in_review') {
        pendingByStage[r.stageIndex] = (pendingByStage[r.stageIndex] || 0) + Number(r.cnt);
      }
    }

    const totalAssigned = Object.values(assignMap).reduce((a, b) => a + b, 0);

    const stages = wf?.stages || [];
    const stageBreakdown = stages.map((st) => {
      const rev = userRepo.getById(st.reviewerId);
      return {
        stageIndex: st.stageIndex,
        reviewerId: st.reviewerId,
        reviewerName: rev?.name || `Reviewer ${st.reviewerId}`,
        pendingCount: pendingByStage[st.stageIndex] || 0,
      };
    });

    return {
      workflowId,
      totalAssigned,
      invited: assignMap['invited'] || 0,
      started: assignMap['started'] || 0,
      draft: subMap['draft'] || 0,
      submitted: subMap['submitted'] || 0,
      inReview: subMap['in_review'] || 0,
      needsChanges: subMap['needs_changes'] || 0,
      approved: subMap['approved'] || 0,
      rejected: subMap['rejected'] || 0,
      stageBreakdown,
    };
  }
}
