import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import {
  getDb,
  WorkflowRepository,
  SubmissionRepository,
} from '../repository.js';
import type { AttachmentPublic, DeletionReceipt } from '../../shared/contracts.js';
import { recordAudit } from '../events.js';

function getParam(param: string | string[] | undefined): string {
  if (!param) return '';
  return Array.isArray(param) ? (param[0] ?? '') : param;
}

export interface AttachmentRow {
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

const STORAGE_DIR = process.env.ATTACHMENT_STORAGE_DIR || path.join(process.cwd(), '.karya_storage', 'attachments');

function ensureStorageDir(): string {
  try {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    const testFile = path.join(STORAGE_DIR, '.probe');
    fs.writeFileSync(testFile, '');
    fs.unlinkSync(testFile);
    return STORAGE_DIR;
  } catch {
    const fallback = '/tmp/karya_attachments';
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true });
    }
    return fallback;
  }
}

export function sniffMime(buf: Buffer): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return 'application/pdf';
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

function parseMultipartBody(
  buffer: Buffer,
  contentType: string
): { filename: string; mime: string; data: Buffer } | null {
  const match = contentType.match(/boundary=([^;]+)/i);
  if (!match || !match[1]) return null;
  const boundary = match[1].trim().replace(/^"|"$/g, '');
  const boundaryBuf = Buffer.from('--' + boundary);

  const start = buffer.indexOf(boundaryBuf);
  if (start === -1) return null;
  const headerEnd = buffer.indexOf('\r\n\r\n', start);
  if (headerEnd === -1) return null;
  const headerStr = buffer.subarray(start, headerEnd).toString('utf8');

  const fnMatch = headerStr.match(/filename="([^"]+)"/i);
  const filename = fnMatch && fnMatch[1] ? fnMatch[1] : 'attachment.bin';
  const ctMatch = headerStr.match(/Content-Type:\s*([^\r\n;]+)/i);
  const mime = ctMatch && ctMatch[1] ? ctMatch[1].trim() : 'application/octet-stream';

  const dataStart = headerEnd + 4;
  const nextBoundary = buffer.indexOf(boundaryBuf, dataStart);
  const dataEnd = nextBoundary !== -1 ? nextBoundary - 2 : buffer.length;
  const data = buffer.subarray(dataStart, dataEnd);

  return { filename, mime, data };
}

function sanitizeBasename(input: string): string {
  const base = path.basename(input).trim();
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return sanitized.slice(0, 120) || 'attachment';
}

function mapRowToPublic(row: AttachmentRow): AttachmentPublic {
  return {
    id: row.id,
    submissionId: row.submissionId,
    displayName: row.displayName,
    mime: row.mime,
    bytes: row.bytes,
    status: row.status,
    createdAt: row.createdAt,
  };
}

// ==========================================
// EP-036: POST /api/submissions/:submissionId/attachments (Student only)
// ==========================================
export function handlePostAttachment(req: Request, res: Response): void {
  try {
    const principal = res.locals.principal!;
    const submissionId = getParam(req.params.submissionId);
    const db = getDb();
    const subRepo = new SubmissionRepository(db);

  const sub = subRepo.getById(submissionId);
  if (!sub) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Submission not found' });
    return;
  }

  // Object ownership check
  if (sub.studentId !== principal.id) {
    res.status(403).json({ code: 'FORBIDDEN', message: 'You do not own this submission' });
    return;
  }

  // Can only attach to draft or needs_changes
  if (sub.status !== 'draft' && sub.status !== 'needs_changes') {
    res.status(409).json({
      code: 'ILLEGAL_STATE',
      message: `Cannot attach files to a submission in status '${sub.status}'`,
    });
    return;
  }

  // Max 3 attachments check (VR-015)
  const countStmt = db.prepare(
    "SELECT COUNT(*) as count FROM attachments WHERE submissionId = ? AND status != 'removed'"
  );
  const countRow = countStmt.get(submissionId) as { count: number } | undefined;
  if (countRow && countRow.count >= 3) {
    res.status(422).json({
      code: 'LIMIT_EXCEEDED',
      message: 'Maximum 3 attachments allowed per submission revision',
    });
    return;
  }

  let fileBuffer: Buffer | null = null;
  let clientFilename = 'attachment.pdf';

  const ct = req.headers['content-type'] || '';

  if (ct.includes('application/json')) {
    try {
      const obj = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body;
      const { fileName, content } = obj || {};
      if (typeof fileName === 'string') clientFilename = fileName;
      if (typeof content === 'string') {
        fileBuffer = Buffer.from(content, 'base64');
      }
    } catch {
      // ignore
    }
  } else if (ct.includes('multipart/form-data') && Buffer.isBuffer(req.body)) {
    const parsed = parseMultipartBody(req.body, ct);
    if (parsed) {
      fileBuffer = parsed.data;
      clientFilename = parsed.filename;
    }
  } else if (Buffer.isBuffer(req.body)) {
    fileBuffer = req.body;
    const headerName = req.headers['x-file-name'];
    if (typeof headerName === 'string') {
      clientFilename = headerName;
    }
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    res.status(400).json({ code: 'INVALID_INPUT', message: 'Missing or empty file content' });
    return;
  }

  // File size check: <= 5 MiB (5,242,880 bytes)
  const MAX_BYTES = 5 * 1024 * 1024;
  if (fileBuffer.length > MAX_BYTES) {
    res.status(413).json({
      code: 'FILE_TOO_LARGE',
      message: 'Upload a PDF or image smaller than 5 MB.',
    });
    return;
  }

  // Magic bytes sniffing: PDF, PNG, JPEG only
  const sniffed = sniffMime(fileBuffer);
  if (!sniffed) {
    res.status(415).json({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Upload a PDF or image smaller than 5 MB.',
    });
    return;
  }

  const safeName = sanitizeBasename(clientFilename);
  const ext = sniffed === 'application/pdf' ? '.pdf' : sniffed === 'image/png' ? '.png' : '.jpg';
  const storageKey = crypto.randomUUID() + ext;
  const storagePath = path.join(ensureStorageDir(), storageKey);

  // Write file to private storage
  fs.writeFileSync(storagePath, fileBuffer);

  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const attachmentId = crypto.randomUUID();
  const now = new Date().toISOString();

  const insertStmt = db.prepare(`
    INSERT INTO attachments (id, submissionId, uploadedBy, displayName, mime, bytes, sha256, privateStorageKey, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
  `);
  insertStmt.run(
    attachmentId,
    submissionId,
    principal.id,
    safeName,
    sniffed,
    fileBuffer.length,
    hash,
    storageKey,
    now
  );

  recordAudit(db, {
    departmentId: principal.departmentId,
    workflowId: sub.workflowId,
    actorId: principal.id,
    actorRole: 'student',
    event: 'attachment_uploaded',
    targetEntity: 'Attachment',
    targetId: attachmentId,
    details: { submissionId, fileName: safeName, bytes: fileBuffer.length, mime: sniffed },
  });

  const createdRow: AttachmentRow = {
    id: attachmentId,
    submissionId,
    uploadedBy: principal.id,
    displayName: safeName,
    mime: sniffed,
    bytes: fileBuffer.length,
    sha256: hash,
    privateStorageKey: storageKey,
    status: 'draft',
    createdAt: now,
  };

  res.status(201).json(mapRowToPublic(createdRow));
} catch (err) {
  console.error('ATTACHMENT_UPLOAD_ERROR:', err);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: String(err) });
}
}

// ==========================================
// EP-037: GET /api/attachments/:attachmentId (Admin, Student, Reviewer)
// ==========================================
export function handleGetAttachment(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const attachmentId = getParam(req.params.attachmentId);
  const db = getDb();
  const subRepo = new SubmissionRepository(db);
  const wfRepo = new WorkflowRepository(db);

  const stmt = db.prepare("SELECT * FROM attachments WHERE id = ? AND status != 'removed'");
  const att = stmt.get(attachmentId) as unknown as AttachmentRow | undefined;
  if (!att) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Attachment not found' });
    return;
  }

  const sub = subRepo.getById(att.submissionId);
  if (!sub) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Associated submission not found' });
    return;
  }

  const wf = wfRepo.getLatestVersion(sub.workflowId);
  if (!wf) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Associated workflow not found' });
    return;
  }

  // Object-level authorization
  if (principal.role === 'student') {
    if (sub.studentId !== principal.id) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Access denied to private submission attachment' });
      return;
    }
  } else if (principal.role === 'reviewer') {
    const isCurrentReviewer = wf.stages[sub.stageIndex]?.reviewerId === principal.id;
    const isInHistory = sub.history.some((h) => h.reviewerId === principal.id);
    if (!isCurrentReviewer && !isInHistory) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'You are not an assigned reviewer for this attachment' });
      return;
    }
  } else if (principal.role === 'admin') {
    if (wf.departmentId !== principal.departmentId) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'Workflow belongs to another department' });
      return;
    }
  }

  const filePath = path.join(ensureStorageDir(), att.privateStorageKey);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ code: 'FILE_MISSING', message: 'Attachment binary file not found on server' });
    return;
  }

  const safeFilename = sanitizeBasename(att.displayName);
  res.setHeader('Content-Type', att.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.setHeader('Content-Length', att.bytes);
  res.setHeader('X-Content-Type-Options', 'nosniff');

  recordAudit(db, {
    departmentId: principal.departmentId,
    workflowId: sub.workflowId,
    actorId: principal.id,
    actorRole: principal.role,
    event: 'attachment_downloaded',
    targetEntity: 'Attachment',
    targetId: att.id,
    details: { submissionId: sub.id, fileName: safeFilename },
  });

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
}

// ==========================================
// EP-038: PATCH /api/attachments/:attachmentId (Student only)
// ==========================================
export function handlePatchAttachment(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const attachmentId = getParam(req.params.attachmentId);
  const db = getDb();
  const subRepo = new SubmissionRepository(db);

  const stmt = db.prepare("SELECT * FROM attachments WHERE id = ? AND status != 'removed'");
  const att = stmt.get(attachmentId) as unknown as AttachmentRow | undefined;
  if (!att) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Attachment not found' });
    return;
  }

  const sub = subRepo.getById(att.submissionId);
  if (!sub) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Associated submission not found' });
    return;
  }

  if (sub.studentId !== principal.id) {
    res.status(403).json({ code: 'FORBIDDEN', message: 'You do not own this attachment' });
    return;
  }

  if (att.status === 'locked' || (sub.status !== 'draft' && sub.status !== 'needs_changes')) {
    res.status(409).json({
      code: 'ILLEGAL_STATE',
      message: 'Cannot rename an attachment on a submitted or locked request',
    });
    return;
  }

  const rawName = req.body?.displayName || req.body?.filename;
  if (typeof rawName !== 'string' || rawName.trim().length === 0) {
    res.status(422).json({ code: 'INVALID_INPUT', message: 'Missing or empty displayName' });
    return;
  }

  const newName = sanitizeBasename(rawName);

  db.prepare('UPDATE attachments SET displayName = ? WHERE id = ?').run(newName, attachmentId);

  recordAudit(db, {
    departmentId: principal.departmentId,
    workflowId: sub.workflowId,
    actorId: principal.id,
    actorRole: 'student',
    event: 'attachment_renamed',
    targetEntity: 'Attachment',
    targetId: attachmentId,
    details: { oldName: att.displayName, newName },
  });

  const updated: AttachmentRow = { ...att, displayName: newName };
  res.json(mapRowToPublic(updated));
}

// ==========================================
// EP-039: DELETE /api/attachments/:attachmentId (Student only)
// ==========================================
export function handleDeleteAttachment(req: Request, res: Response): void {
  const principal = res.locals.principal!;
  const attachmentId = getParam(req.params.attachmentId);
  const db = getDb();
  const subRepo = new SubmissionRepository(db);

  const stmt = db.prepare("SELECT * FROM attachments WHERE id = ? AND status != 'removed'");
  const att = stmt.get(attachmentId) as unknown as AttachmentRow | undefined;
  if (!att) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Attachment not found' });
    return;
  }

  const sub = subRepo.getById(att.submissionId);
  if (!sub) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Associated submission not found' });
    return;
  }

  if (sub.studentId !== principal.id) {
    res.status(403).json({ code: 'FORBIDDEN', message: 'You do not own this attachment' });
    return;
  }

  if (att.status === 'locked' || (sub.status !== 'draft' && sub.status !== 'needs_changes')) {
    res.status(409).json({
      code: 'ILLEGAL_STATE',
      message: 'Cannot remove locked submission evidence',
    });
    return;
  }

  db.prepare("UPDATE attachments SET status = 'removed' WHERE id = ?").run(attachmentId);

  // Remove binary file from disk
  const filePath = path.join(ensureStorageDir(), att.privateStorageKey);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Best effort cleanup
    }
  }

  recordAudit(db, {
    departmentId: principal.departmentId,
    workflowId: sub.workflowId,
    actorId: principal.id,
    actorRole: 'student',
    event: 'attachment_removed',
    targetEntity: 'Attachment',
    targetId: attachmentId,
    details: { submissionId: sub.id, fileName: att.displayName },
  });

  const receipt: DeletionReceipt = {
    id: attachmentId,
    deleted: true,
  };

  res.json(receipt);
}
