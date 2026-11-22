import type { DatabaseSync } from "node:sqlite";
import type {
  AssignmentPage,
  AssignmentPublic,
  UserPage,
  UserPublic,
} from "../shared/contracts.js";
import { pagination } from "./queries.js";

export function directoryPage(
  db: DatabaseSync,
  user: UserPublic,
  query: Record<string, unknown>,
): UserPage {
  const { page, limit, offset } = pagination(query);
  let where = "departmentId = ?";
  const parameters: (string | number)[] = [user.departmentId];
  if (typeof query.role === "string" && query.role) {
    where += " AND role = ?";
    parameters.push(query.role);
  }
  const search =
    typeof query.query === "string"
      ? query.query
      : typeof query.q === "string"
        ? query.q
        : "";
  if (search.trim()) {
    where += " AND (instr(lower(name), ?) > 0 OR instr(lower(email), ?) > 0)";
    parameters.push(search.trim().toLowerCase(), search.trim().toLowerCase());
  }
  const total = (
    db
      .prepare(`SELECT COUNT(*) count FROM users WHERE ${where}`)
      .get(...parameters) as { count: number }
  ).count;
  const rows = db
    .prepare(
      `SELECT id, departmentId, name, email, role, active, createdAt FROM users WHERE ${where} ORDER BY name COLLATE NOCASE, id LIMIT ? OFFSET ?`,
    )
    .all(...parameters, limit, offset) as unknown as (Omit<
    UserPublic,
    "active"
  > & { active: number })[];
  return {
    items: rows.map((row) => ({ ...row, active: Boolean(row.active) })),
    total,
    page,
    limit,
    nextCursor: null,
  };
}

export function assignmentPage(
  db: DatabaseSync,
  user: UserPublic,
  query: Record<string, unknown>,
): AssignmentPage {
  const { page, limit, offset } = pagination(query);
  let where = "w.departmentId = ?";
  const parameters: (string | number)[] = [user.departmentId];
  if (user.role === "student") {
    where += " AND a.studentId = ?";
    parameters.push(user.id);
  }
  if (typeof query.workflowId === "string" && query.workflowId) {
    where += " AND a.workflowId = ?";
    parameters.push(query.workflowId);
  }
  if (typeof query.status === "string" && query.status) {
    where += " AND a.status = ?";
    parameters.push(query.status);
  }
  const from = `FROM assignments a JOIN workflows w ON w.id = a.workflowId JOIN (SELECT id, MAX(version) version FROM workflows GROUP BY id) latest ON latest.id = w.id AND latest.version = w.version JOIN users u ON u.id = a.studentId WHERE ${where}`;
  const total = (
    db.prepare(`SELECT COUNT(*) count ${from}`).get(...parameters) as {
      count: number;
    }
  ).count;
  const items = db
    .prepare(
      `SELECT a.id, a.workflowId, a.studentId, a.status, a.assignedAt, a.revokeReason, u.name studentName, u.email studentEmail, w.title workflowTitle, w.deadline workflowDeadline ${from} ORDER BY a.assignedAt DESC, a.id ASC LIMIT ? OFFSET ?`,
    )
    .all(...parameters, limit, offset) as unknown as AssignmentPublic[];
  return { items, total, page, limit };
}
