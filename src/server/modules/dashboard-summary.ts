import type { Request, Response } from "express";
import type { DashboardSummary } from "../../shared/dashboard.js";
import { getDb } from "../repository.js";
import { workflowPage, workflowNeedsAttention } from "../queries.js";

/** Aggregate once in SQL; the dashboard never downloads the full workflow collection. */
export function handleDashboardSummary(_req: Request, res: Response): void {
  const user = res.locals.principal!;
  const db = getDb();
  const latest = `FROM workflows w JOIN (SELECT id, MAX(version) version FROM workflows GROUP BY id) v ON v.id = w.id AND v.version = w.version WHERE w.departmentId = ?`;
  const blocked = workflowNeedsAttention;
  const counts = db
    .prepare(
      `SELECT COUNT(*) total, COALESCE(SUM(w.status = 'published'),0) published, COALESCE(SUM(w.status IN ('draft','proposed')),0) drafts, COALESCE(SUM(w.status = 'archived'),0) archived, COALESCE(SUM(${blocked}),0) needsAttention ${latest}`,
    )
    .get(user.departmentId) as DashboardSummary["counts"];
  const pending = db
    .prepare(
      `SELECT COUNT(*) count FROM submissions s JOIN workflows w ON w.id = s.workflowId JOIN (SELECT id, MAX(version) version FROM workflows GROUP BY id) v ON v.id = w.id AND v.version = w.version WHERE w.departmentId = ? AND s.status IN ('submitted','in_review')`,
    )
    .get(user.departmentId) as { count: number };
  const body: DashboardSummary = {
    counts: { ...counts, awaitingReview: pending.count },
    recent: workflowPage(db, user, { limit: "5", sort: "updatedAt_desc" })
      .items,
    attention: workflowPage(db, user, {
      limit: "5",
      attention: "true",
      sort: "updatedAt_desc",
    }).items,
  };
  res.json(body);
}
