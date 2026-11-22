import type { DatabaseSync } from "node:sqlite";
import type {
  AttachmentPublic,
  Submission,
  SubmissionPage,
  UserPublic,
  Workflow,
  WorkflowPage,
  WorkflowScoped,
} from "../shared/contracts.js";

type Params = (string | number)[];
export const workflowNeedsAttention = `w.status IN ('draft','proposed') AND (w.deadline IS NULL OR json_array_length(w.stages) = 0 OR EXISTS (SELECT 1 FROM json_each(w.stages) s WHERE COALESCE(json_extract(s.value, '$.reviewerId'),'') = '') OR EXISTS (SELECT 1 FROM json_each(w.uncertainties) u WHERE COALESCE(json_extract(u.value, '$.resolved'),0) = 0))`;
export function pagination(query: Record<string, unknown>) {
  const integer = (value: unknown, fallback: number, maximum: number) => {
    const parsed = typeof value === "string" ? Number(value) : NaN;
    return Number.isSafeInteger(parsed)
      ? Math.min(maximum, Math.max(1, parsed))
      : fallback;
  };
  const page = integer(query.page, 1, 1000000);
  const limit = integer(query.limit, 20, 50);
  return { page, limit, offset: (page - 1) * limit };
}
export function workflowScope(user: UserPublic): {
  clause: string;
  params: Params;
} {
  let clause = "w.departmentId = ?";
  const params: Params = [user.departmentId];
  if (user.role === "student") {
    clause +=
      " AND w.status IN ('published','archived') AND EXISTS (SELECT 1 FROM assignments a WHERE a.workflowId = w.id AND a.studentId = ? AND a.status != 'revoked')";
    params.push(user.id);
  } else if (user.role === "reviewer") {
    clause +=
      " AND w.status IN ('published','archived') AND EXISTS (SELECT 1 FROM json_each(w.stages) st WHERE json_extract(st.value, '$.reviewerId') = ?)";
    params.push(user.id);
  }
  return { clause, params };
}
const latest =
  "JOIN (SELECT id, MAX(version) version FROM workflows GROUP BY id) newest ON newest.id = w.id AND newest.version = w.version";
interface WorkflowRow
  extends Omit<
    Workflow,
    "fields" | "stages" | "requirements" | "uncertainties"
  > {
  fields: string;
  stages: string;
  requirements: string;
  uncertainties: string;
  createdByName: string;
  docId: string | null;
  docOwner: string;
  docTitle: string;
  docMime: "application/pdf" | "text/plain";
  docHash: string;
  docLength: number;
  docStatus: "uploaded" | "referenced" | "deleted";
  docCreated: string;
}
export function workflowPage(
  db: DatabaseSync,
  user: UserPublic,
  query: Record<string, unknown>,
): WorkflowPage {
  const { page, limit, offset } = pagination(query);
  const scope = workflowScope(user);
  if (typeof query.q === "string" && query.q.trim()) {
    scope.clause += " AND instr(lower(w.title), ?) > 0";
    scope.params.push(query.q.trim().toLowerCase());
  }
  if (query.status === "unpublished")
    scope.clause += " AND w.status IN ('draft','proposed')";
  else if (typeof query.status === "string" && query.status) {
    scope.clause += " AND w.status = ?";
    scope.params.push(query.status);
  }
  if (query.attention === "true")
    scope.clause += ` AND (${workflowNeedsAttention})`;
  const from = `FROM workflows w ${latest} WHERE ${scope.clause}`;
  const total = (
    db.prepare(`SELECT COUNT(*) count ${from}`).get(...scope.params) as {
      count: number;
    }
  ).count;
  const sorts: Record<string, string> = {
    createdAt_desc: "w.createdAt DESC",
    createdAt_asc: "w.createdAt ASC",
    updatedAt_desc: "w.updatedAt DESC",
    title_asc: "w.title COLLATE NOCASE ASC",
    deadline_asc: "w.deadline IS NULL, w.deadline ASC",
  };
  const order =
    typeof query.sort === "string"
      ? sorts[query.sort] || sorts.createdAt_desc
      : sorts.createdAt_desc;
  const rows = db
    .prepare(
      `SELECT w.*, u.name createdByName, d.id docId, d.ownerId docOwner, d.title docTitle, d.mime docMime, d.sha256 docHash, length(d.extractedText) docLength, d.status docStatus, d.createdAt docCreated FROM workflows w ${latest} LEFT JOIN users u ON u.id = w.createdBy LEFT JOIN source_documents d ON d.id = w.sourceId AND d.status != 'deleted' WHERE ${scope.clause} ORDER BY ${order}, w.id ASC LIMIT ? OFFSET ?`,
    )
    .all(...scope.params, limit, offset) as unknown as WorkflowRow[];
  const items: WorkflowScoped[] = rows.map((row) => ({
    id: row.id,
    departmentId: row.departmentId,
    createdBy: row.createdBy,
    title: row.title,
    sourceId: row.sourceId,
    status: row.status,
    origin: row.origin,
    fields: JSON.parse(row.fields),
    stages: JSON.parse(row.stages),
    requirements: JSON.parse(row.requirements || "[]"),
    uncertainties: JSON.parse(row.uncertainties),
    deadline: row.deadline,
    version: row.version,
    archiveReason: row.archiveReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdByName: row.createdByName,
    sourceDocument:
      row.docId && user.role === "admin"
        ? {
            id: row.docId,
            departmentId: row.departmentId,
            ownerId: row.docOwner,
            title: row.docTitle,
            mime: row.docMime,
            sha256: row.docHash,
            extractedLength: row.docLength,
            status: row.docStatus,
            createdAt: row.docCreated,
          }
        : null,
  }));
  return { items, total, page, limit };
}
interface SubmissionRow extends Omit<Submission, "answers" | "history"> {
  answers: string;
  history: string;
  studentName: string;
  studentEmail: string;
  workflowTitle: string;
  workflowDeadline: string | null;
  currentReviewerId: string | null;
  currentReviewerName: string | null;
}
export function submissionPage(
  db: DatabaseSync,
  user: UserPublic,
  query: Record<string, unknown>,
): SubmissionPage {
  const { page, limit, offset } = pagination(query);
  let where = "w.departmentId = ?";
  const params: Params = [user.departmentId];
  if (user.role === "student") {
    where += " AND s.studentId = ?";
    params.push(user.id);
  }
  if (user.role === "reviewer") {
    where +=
      " AND s.status IN ('submitted','in_review') AND json_extract(w.stages, '$[' || s.stageIndex || '].reviewerId') = ?";
    params.push(user.id);
  }
  if (typeof query.workflowId === "string" && query.workflowId) {
    where += " AND s.workflowId = ?";
    params.push(query.workflowId);
  }
  if (typeof query.status === "string" && query.status) {
    where += " AND s.status = ?";
    params.push(query.status);
  }
  if (typeof query.q === "string" && query.q.trim()) {
    where +=
      " AND (instr(lower(st.name), ?) > 0 OR instr(lower(st.email), ?) > 0 OR instr(lower(w.title), ?) > 0)";
    const q = query.q.trim().toLowerCase();
    params.push(q, q, q);
  }
  const from = `FROM submissions s JOIN workflows w ON w.id = s.workflowId ${latest} JOIN users st ON st.id = s.studentId`;
  const total = (
    db
      .prepare(`SELECT COUNT(*) count ${from} WHERE ${where}`)
      .get(...params) as { count: number }
  ).count;
  const rows = db
    .prepare(
      `SELECT s.*, st.name studentName, st.email studentEmail, w.title workflowTitle, w.deadline workflowDeadline, rev.id currentReviewerId, rev.name currentReviewerName ${from} LEFT JOIN users rev ON rev.id = json_extract(w.stages, '$[' || s.stageIndex || '].reviewerId') WHERE ${where} ORDER BY s.updatedAt DESC, s.id ASC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as unknown as SubmissionRow[];
  const attachments = new Map<string, AttachmentPublic[]>();
  if (rows.length) {
    const placeholders = rows.map(() => "?").join(",");
    const files = db
      .prepare(
        `SELECT id, submissionId, displayName, mime, bytes, status, createdAt FROM attachments WHERE submissionId IN (${placeholders}) AND status != 'removed' ORDER BY createdAt, id`,
      )
      .all(...rows.map((row) => row.id)) as unknown as AttachmentPublic[];
    for (const file of files)
      attachments.set(file.submissionId, [
        ...(attachments.get(file.submissionId) || []),
        file,
      ]);
  }
  return {
    items: rows.map((row) => ({
      ...row,
      answers: JSON.parse(row.answers),
      history: JSON.parse(row.history),
      attachments: attachments.get(row.id) || [],
    })),
    total,
    page,
    limit,
  };
}
