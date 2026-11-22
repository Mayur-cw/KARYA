import { z } from 'zod';

// ==========================================
// Roles & Standard Constants
// ==========================================

export const roleSchema = z.enum(['anonymous', 'admin', 'student', 'reviewer']);
export type Role = z.infer<typeof roleSchema>;

export const responseCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ResponseCode = keyof typeof responseCode;

export const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type AppError = z.infer<typeof errorSchema>;

export const healthSchema = z.object({
  status: z.literal('ok'),
});
export type HealthResponse = z.infer<typeof healthSchema>;

// ==========================================
// Pagination & Common Queries (VR-017)
// ==========================================

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().optional(),
  sort: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

// ==========================================
// User & Auth Entities (ENT-User)
// ==========================================

export const userRoleSchema = z.enum(['admin', 'student', 'reviewer']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userStatusSchema = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const userSchema = z.object({
  id: z.string().uuid(),
  departmentId: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: userRoleSchema,
  active: z.boolean(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof userSchema>;

export const userPublicSchema = z.object({
  id: z.string(),
  departmentId: z.string(),
  name: z.string(),
  email: z.string(),
  role: userRoleSchema,
  active: z.boolean(),
  createdAt: z.string(),
});
export type UserPublic = z.infer<typeof userPublicSchema>;

export const userPageSchema = z.object({
  items: z.array(userPublicSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  nextCursor: z.string().nullable().optional(),
});
export type UserPage = z.infer<typeof userPageSchema>;

export const sessionPublicSchema = z.object({
  user: userPublicSchema,
  csrfToken: z.string(),
});
export type SessionPublic = z.infer<typeof sessionPublicSchema>;

export const demoLoginRequestSchema = z.object({
  userId: z.string().min(1),
});
export type DemoLoginRequest = z.infer<typeof demoLoginRequestSchema>;

export const userCreateRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be <= 100 characters'),
  email: z.string().trim().email('Invalid email address'),
  role: userRoleSchema,
  departmentId: z.string().optional(),
});
export type UserCreateRequest = z.infer<typeof userCreateRequestSchema>;

export const userSafePatchRequestSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  active: z.boolean().optional(),
});
export type UserSafePatchRequest = z.infer<typeof userSafePatchRequestSchema>;

// ==========================================
// Source Documents (ENT-SourceDocument, VR-001, VR-002)
// ==========================================

export const sourceMimeSchema = z.enum(['text/plain', 'application/pdf']);
export type SourceMime = z.infer<typeof sourceMimeSchema>;

export const sourceDocStatusSchema = z.enum(['uploaded', 'referenced', 'deleted']);
export type SourceDocStatus = z.infer<typeof sourceDocStatusSchema>;

export const pageOffsetSchema = z.object({
  page: z.number().int().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
});
export type PageOffset = z.infer<typeof pageOffsetSchema>;

export const sourceDocumentSchema = z.object({
  id: z.string().uuid(),
  departmentId: z.string().uuid(),
  ownerId: z.string().uuid(),
  title: z.string().min(1).max(200),
  mime: sourceMimeSchema,
  sha256: z.string().length(64),
  extractedText: z.string().max(100000),
  pageOffsets: z.array(pageOffsetSchema),
  status: sourceDocStatusSchema,
  createdAt: z.string().datetime(),
});
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;

export const sourceDocumentPublicSchema = z.object({
  id: z.string(),
  departmentId: z.string(),
  ownerId: z.string(),
  title: z.string(),
  mime: sourceMimeSchema,
  sha256: z.string(),
  extractedLength: z.number().int().nonnegative(),
  status: sourceDocStatusSchema,
  createdAt: z.string(),
  extractedText: z.string().optional(),
  pageOffsets: z.array(pageOffsetSchema).optional(),
});
export type SourceDocumentPublic = z.infer<typeof sourceDocumentPublicSchema>;

export const sourceTitlePatchSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title cannot exceed 200 characters'),
});
export type SourceTitlePatch = z.infer<typeof sourceTitlePatchSchema>;

// ==========================================
// Workflows & Proposals (ENT-Workflow, VR-003, VR-004, VR-005, VR-006, VR-007, VR-008)
// ==========================================

export const workflowStatusSchema = z.enum(['draft', 'proposed', 'published', 'archived']);
export type WorkflowStatus = z.infer<typeof workflowStatusSchema>;

export const workflowOriginSchema = z.enum(['ai', 'manual', 'not_proposed']);
export type WorkflowOrigin = z.infer<typeof workflowOriginSchema>;

export const workflowFieldTypeSchema = z.enum(['text', 'date', 'select', 'file']);
export type WorkflowFieldType = z.infer<typeof workflowFieldTypeSchema>;

export const workflowFieldSchema = z.object({
  key: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_]+$/, 'Field key must be alphanumeric or underscore'),
  label: z.string().min(1).max(100),
  type: workflowFieldTypeSchema,
  required: z.boolean().default(true),
  options: z.array(z.string().min(1).max(100)).max(20).optional(),
  sourceRequirementId: z.string().optional(),
});
export type WorkflowField = z.infer<typeof workflowFieldSchema>;

export const workflowStageSchema = z.object({
  stageIndex: z.number().int().min(0).max(2),
  label: z.string().min(1).max(100),
  roleHint: z.string().max(100).optional(),
  reviewerId: z.string().min(1, 'Reviewer must be assigned'),
});
export type WorkflowStage = z.infer<typeof workflowStageSchema>;

export const workflowUncertaintySchema = z.object({
  id: z.string(),
  kind: z.enum(['deadline', 'field', 'role', 'requirement', 'general']),
  description: z.string().min(1),
  sourcePassage: z.string().optional(),
  resolved: z.boolean().default(false),
  resolutionNote: z.string().optional(),
});
export type WorkflowUncertainty = z.infer<typeof workflowUncertaintySchema>;

export const workflowRequirementSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  sourcePassage: z.string().optional(),
  pageNumber: z.number().int().positive().optional(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
  uncertain: z.boolean().default(false),
  uncertaintyReason: z.string().optional(),
});
export type WorkflowRequirement = z.infer<typeof workflowRequirementSchema>;

export const workflowSchema = z.object({
  id: z.string().uuid(),
  departmentId: z.string().uuid(),
  createdBy: z.string().uuid(),
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(120, 'Title must be <= 120 characters'),
  sourceId: z.string().uuid().nullable().optional(),
  status: workflowStatusSchema,
  origin: workflowOriginSchema,
  fields: z.array(workflowFieldSchema).max(20, 'Maximum 20 fields allowed'),
  stages: z.array(workflowStageSchema).max(3, 'Maximum 3 review stages allowed'),
  uncertainties: z.array(workflowUncertaintySchema),
  requirements: z.array(workflowRequirementSchema).optional(),
  deadline: z.string().nullable().optional(),
  version: z.number().int().positive(),
  archiveReason: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
});
export type Workflow = z.infer<typeof workflowSchema>;

export const workflowDraftCreateSchema = z.object({
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(120, 'Title must be <= 120 characters'),
  sourceId: z.string().optional(),
  rawText: z.string().max(100000).optional(),
});
export type WorkflowDraftCreate = z.infer<typeof workflowDraftCreateSchema>;

export const workflowEditablePatchSchema = z.object({
  title: z.string().trim().min(5).max(120).optional(),
  fields: z.array(workflowFieldSchema).max(20).optional(),
  stages: z.array(workflowStageSchema).min(1).max(3).optional(),
  uncertainties: z.array(workflowUncertaintySchema).optional(),
  requirements: z.array(workflowRequirementSchema).optional(),
  deadline: z.string().nullable().optional(),
  expectedVersion: z.number().int(),
});
export type WorkflowEditablePatch = z.infer<typeof workflowEditablePatchSchema>;

export const workflowPublishCommandSchema = z.object({
  expectedVersion: z.number().int(),
  studentIds: z.array(z.string().min(1)).min(1, 'At least one student must be selected').max(50, 'Maximum 50 students per cohort'),
});
export type WorkflowPublishCommand = z.infer<typeof workflowPublishCommandSchema>;

export const workflowArchiveCommandSchema = z.object({
  reason: z.string().trim().min(1, 'Archive reason is required').max(500, 'Archive reason <= 500 characters'),
  expectedVersion: z.number().int(),
});
export type WorkflowArchiveCommand = z.infer<typeof workflowArchiveCommandSchema>;

export const workflowScopedSchema = workflowSchema.extend({
  sourceDocument: sourceDocumentPublicSchema.nullable().optional(),
  createdByName: z.string().optional(),
});
export type WorkflowScoped = z.infer<typeof workflowScopedSchema>;

export const workflowPageSchema = z.object({
  items: z.array(workflowScopedSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
});
export type WorkflowPage = z.infer<typeof workflowPageSchema>;

export const workflowProposalSchema = workflowSchema.extend({
  confidenceNotes: z.string().optional(),
});
export type WorkflowProposal = z.infer<typeof workflowProposalSchema>;

export const workflowPublishedSchema = workflowSchema;
export type WorkflowPublished = z.infer<typeof workflowPublishedSchema>;

export const workflowArchivedSchema = workflowSchema;
export type WorkflowArchived = z.infer<typeof workflowArchivedSchema>;

// ==========================================
// Assignments (ENT-Assignment, VR-009, VR-010)
// ==========================================

export const assignmentStatusSchema = z.enum(['invited', 'started', 'revoked', 'completed']);
export type AssignmentStatus = z.infer<typeof assignmentStatusSchema>;

export const assignmentSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  studentId: z.string().uuid(),
  status: assignmentStatusSchema,
  assignedAt: z.string().datetime(),
  revokeReason: z.string().nullable().optional(),
});
export type Assignment = z.infer<typeof assignmentSchema>;

export const assignmentPublicSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  studentId: z.string(),
  status: assignmentStatusSchema,
  assignedAt: z.string(),
  revokeReason: z.string().nullable().optional(),
  studentName: z.string().optional(),
  studentEmail: z.string().optional(),
  workflowTitle: z.string().optional(),
  workflowDeadline: z.string().nullable().optional(),
});
export type AssignmentPublic = z.infer<typeof assignmentPublicSchema>;

export const assignmentPageSchema = z.object({
  items: z.array(assignmentPublicSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
});
export type AssignmentPage = z.infer<typeof assignmentPageSchema>;

export const assignmentBulkCreateSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1).max(50),
  reason: z.string().optional(),
});
export type AssignmentBulkCreate = z.infer<typeof assignmentBulkCreateSchema>;

export const assignmentChangeSchema = z.object({
  action: z.literal('revoke'),
  reason: z.string().trim().min(1, 'Revocation reason is required').max(500),
});
export type AssignmentChange = z.infer<typeof assignmentChangeSchema>;

// ==========================================
// Submissions & Decisions (ENT-Submission, VR-011, VR-012, VR-013, VR-014)
// ==========================================

export const submissionStatusSchema = z.enum([
  'draft',
  'submitted',
  'in_review',
  'needs_changes',
  'approved',
  'rejected',
]);
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;

export const reviewActionSchema = z.enum(['approve', 'needs_changes', 'reject']);
export type ReviewAction = z.infer<typeof reviewActionSchema>;

export const decisionRecordSchema = z.object({
  stageIndex: z.number().int().nonnegative(),
  reviewerId: z.string(),
  reviewerName: z.string().optional(),
  action: reviewActionSchema,
  reason: z.string().optional(),
  decidedAt: z.string().datetime(),
});
export type DecisionRecord = z.infer<typeof decisionRecordSchema>;

export const submissionSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  studentId: z.string().uuid(),
  assignmentId: z.string().uuid(),
  answers: z.record(z.string().max(50), z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()])),
  status: submissionStatusSchema,
  stageIndex: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  version: z.number().int().positive(),
  history: z.array(decisionRecordSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Submission = z.infer<typeof submissionSchema>;

export const newSubmissionSchema = z.object({
  answers: z.record(z.string().max(50), z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()])).optional().default({}),
  idempotencyKey: z.string().optional(),
});
export type NewSubmission = z.infer<typeof newSubmissionSchema>;

export const submissionFieldPatchSchema = z.object({
  answers: z.record(z.string().max(50), z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()])),
  expectedVersion: z.number().int(),
});
export type SubmissionFieldPatch = z.infer<typeof submissionFieldPatchSchema>;

export const submissionSubmitCommandSchema = z.object({
  expectedVersion: z.number().int(),
  idempotencyKey: z.string().optional(),
});
export type SubmissionSubmitCommand = z.infer<typeof submissionSubmitCommandSchema>;

export const reviewDecisionCommandSchema = z
  .object({
    action: reviewActionSchema,
    reason: z.string().trim().max(1000).optional(),
    expectedVersion: z.number().int(),
    idempotencyKey: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.action === 'approve') return true;
      return typeof data.reason === 'string' && data.reason.trim().length >= 10;
    },
    {
      message: 'Reason must be at least 10 characters for correction (needs_changes) or rejection',
      path: ['reason'],
    }
  );
export type ReviewDecisionCommand = z.infer<typeof reviewDecisionCommandSchema>;

// ==========================================
// Attachments (ENT-Attachment, VR-015)
// ==========================================

export const attachmentStatusSchema = z.enum(['draft', 'locked', 'removed']);
export type AttachmentStatus = z.infer<typeof attachmentStatusSchema>;

export const attachmentSchema = z.object({
  id: z.string().uuid(),
  submissionId: z.string().uuid(),
  uploadedBy: z.string().uuid(),
  displayName: z.string().min(1).max(120),
  mime: z.string(),
  bytes: z.number().int().positive().max(5242880, 'File exceeds 5 MiB limit'),
  sha256: z.string().length(64),
  privateStorageKey: z.string(),
  status: attachmentStatusSchema,
  createdAt: z.string().datetime(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const attachmentPublicSchema = z.object({
  id: z.string(),
  submissionId: z.string(),
  displayName: z.string(),
  mime: z.string(),
  bytes: z.number().int().positive(),
  status: attachmentStatusSchema,
  createdAt: z.string(),
});
export type AttachmentPublic = z.infer<typeof attachmentPublicSchema>;

export const submissionPublicSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  studentId: z.string(),
  assignmentId: z.string(),
  answers: z.record(z.string(), z.unknown()),
  status: submissionStatusSchema,
  stageIndex: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  version: z.number().int().positive(),
  history: z.array(decisionRecordSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  studentName: z.string().optional(),
  studentEmail: z.string().optional(),
  workflowTitle: z.string().optional(),
  workflowDeadline: z.string().nullable().optional(),
  currentReviewerId: z.string().nullable().optional(),
  currentReviewerName: z.string().nullable().optional(),
  attachments: z.array(attachmentPublicSchema).optional(),
});
export type SubmissionPublic = z.infer<typeof submissionPublicSchema>;

export const submissionPageSchema = z.object({
  items: z.array(submissionPublicSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
});
export type SubmissionPage = z.infer<typeof submissionPageSchema>;

// ==========================================
// Notifications (ENT-Notification)
// ==========================================

export const notificationStatusSchema = z.enum(['unread', 'read', 'dismissed']);
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

export const notificationSchema = z.object({
  id: z.string().uuid(),
  recipientId: z.string().uuid(),
  eventType: z.string(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  targetRef: z.string().nullable().optional(),
  readAt: z.string().datetime().nullable().optional(),
  dismissedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationPublicSchema = z.object({
  id: z.string(),
  recipientId: z.string(),
  eventType: z.string(),
  title: z.string(),
  body: z.string(),
  targetRef: z.string().nullable().optional(),
  readAt: z.string().nullable().optional(),
  dismissedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type NotificationPublic = z.infer<typeof notificationPublicSchema>;

export const notificationPageSchema = z.object({
  items: z.array(notificationPublicSchema),
  unreadCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
});
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export const notificationMarkSchema = z.object({
  action: z.enum(['read', 'dismiss']),
});
export type NotificationMark = z.infer<typeof notificationMarkSchema>;

// ==========================================
// Audit Logs (docs/05_DATA_AND_STATE.md)
// ==========================================

export const auditLogSchema = z.object({
  id: z.string().uuid(),
  departmentId: z.string().uuid(),
  workflowId: z.string().nullable().optional(),
  actorId: z.string(),
  actorRole: z.string(),
  event: z.string(),
  targetEntity: z.string(),
  targetId: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().datetime(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;

export const auditPageSchema = z.object({
  items: z.array(auditLogSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
});
export type AuditPage = z.infer<typeof auditPageSchema>;

// ==========================================
// Analytics & Reporting (EP-034, EP-035, VR-019)
// ==========================================

export const stageBreakdownSchema = z.object({
  stageIndex: z.number().int(),
  reviewerId: z.string(),
  reviewerName: z.string(),
  pendingCount: z.number().int().nonnegative(),
});
export type StageBreakdown = z.infer<typeof stageBreakdownSchema>;

export const workflowAnalyticsSchema = z.object({
  workflowId: z.string(),
  totalAssigned: z.number().int().nonnegative(),
  invited: z.number().int().nonnegative(),
  started: z.number().int().nonnegative(),
  draft: z.number().int().nonnegative(),
  submitted: z.number().int().nonnegative(),
  inReview: z.number().int().nonnegative(),
  needsChanges: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  stageBreakdown: z.array(stageBreakdownSchema),
});
export type WorkflowAnalytics = z.infer<typeof workflowAnalyticsSchema>;

export const deletionReceiptSchema = z.object({
  id: z.string(),
  deleted: z.boolean(),
  reason: z.string().optional(),
});
export type DeletionReceipt = z.infer<typeof deletionReceiptSchema>;

// ==========================================
// Security & Validation Helpers
// ==========================================

/**
 * VR-019: Neutralize formula injection when exporting strings to CSV
 * Prevents Excel/Sheets formula execution (=, +, -, @, tab, cr)
 */
export function sanitizeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str.replace(/"/g, '""')}`;
  }
  return str.replace(/"/g, '""');
}

/**
 * State transition validation oracles
 */
export function isValidSubmissionTransition(
  current: SubmissionStatus,
  target: SubmissionStatus,
  stageIndex: number,
  maxStages: number
): boolean {
  if (current === 'draft' && target === 'submitted') return true;
  if (current === 'needs_changes' && target === 'submitted') return true;
  if (current === 'submitted' || current === 'in_review') {
    if (target === 'needs_changes') return true;
    if (target === 'rejected') return true;
    if (target === 'in_review' && stageIndex + 1 < maxStages) return true;
    if (target === 'approved' && stageIndex + 1 >= maxStages) return true;
  }
  return false;
}
