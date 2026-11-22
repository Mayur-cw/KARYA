import type { WorkflowScoped } from "./contracts.js";

export interface DashboardSummary {
  counts: {
    total: number;
    published: number;
    drafts: number;
    archived: number;
    needsAttention: number;
    awaitingReview: number;
  };
  recent: WorkflowScoped[];
  attention: WorkflowScoped[];
}
