import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthContext";
import { Icon } from "../components/Icon";
import { MetricCards } from "../components/MetricCards";
import { ProcessCard } from "../components/ProcessCard";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorMessage } from "../components/ErrorMessage";
import { EmptyState } from "../components/EmptyState";
import { fetchCollection } from "../collections";

interface WorkflowItem {
  id: string;
  departmentId: string;
  title: string;
  description: string;
  status: "published" | "archived";
  deadline?: string;
  deadlinePolicy?: {
    initialDeadline: string;
    allowLateResubmissions: boolean;
  };
  stages?: Array<{ stageIndex: number; name: string }>;
}

interface SubmissionItem {
  id: string;
  workflowId: string;
  studentId: string;
  status:
    | "draft"
    | "submitted"
    | "in_review"
    | "needs_changes"
    | "approved"
    | "rejected";
  submittedAt?: string | null;
  currentStageIndex: number;
}

interface ProcessCardData {
  workflow: WorkflowItem;
  submission: SubmissionItem | null;
  derivedStatus:
    | "unstarted"
    | "draft"
    | "submitted"
    | "in_review"
    | "needs_changes"
    | "approved"
    | "rejected";
}

export default function StudentProcessHub() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [processes, setProcesses] = useState<ProcessCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadStudentData = useCallback(async () => {
    try {
      setErrorMsg(null);

      const [workflowsResp, submissionsResp] = await Promise.all([
        fetchCollection<WorkflowItem>("/api/workflows"),
        fetchCollection<SubmissionItem>("/api/submissions"),
      ]);

      const workflowsList = workflowsResp;
      const submissionsList = submissionsResp;

      // Map workflow to student submission
      const subMap = new Map<string, SubmissionItem>();
      for (const s of submissionsList) {
        subMap.set(s.workflowId, s);
      }

      const merged: ProcessCardData[] = workflowsList.map((wf) => {
        const sub = subMap.get(wf.id) || null;
        const derivedStatus = sub ? sub.status : "unstarted";
        return {
          workflow: wf,
          submission: sub,
          derivedStatus,
        };
      });

      const priority: Record<string, number> = {
        needs_changes: 0,
        draft: 1,
        unstarted: 2,
        submitted: 3,
        in_review: 3,
        approved: 4,
        rejected: 5,
      };
      merged.sort(
        (left, right) =>
          priority[left.derivedStatus] - priority[right.derivedStatus] ||
          Date.parse(left.workflow.deadline || "9999-12-31") -
            Date.parse(right.workflow.deadline || "9999-12-31"),
      );
      setProcesses(merged);
      return true;
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Failed to load assigned processes",
      );
      return false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStudentData();
  }, [loadStudentData]);

  // EL-065 Refresh assigned processes
  const handleRefresh = async () => {
    setRefreshing(true);
    if (await loadStudentData()) showToast("Process hub refreshed");
  };

  // EL-064 Sign out
  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  // Filter processes (EL-061)
  const filteredProcesses = useMemo(() => {
    if (statusFilter === "all") return processes;
    return processes.filter((p) => p.derivedStatus === statusFilter);
  }, [processes, statusFilter]);

  // Derived counts
  const totalAssigned = processes.length;
  const pendingActions = processes.filter(
    (p) =>
      p.derivedStatus === "unstarted" ||
      p.derivedStatus === "needs_changes" ||
      p.derivedStatus === "draft",
  ).length;
  const inReview = processes.filter(
    (p) => p.derivedStatus === "submitted" || p.derivedStatus === "in_review",
  ).length;
  const approved = processes.filter(
    (p) => p.derivedStatus === "approved",
  ).length;

  return (
    <div className="student-process-hub" data-testid="page-p-009">
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "8px",
            }}
          >
            <span className="badge badge-submitted">Student Workspace</span>
            <span style={{ fontSize: "13px", color: "var(--ink-muted)" }}>
              Applicant: {user?.name || "Student"}
            </span>
          </div>
          <h1>My process hub</h1>
          <p className="card-subtitle">
            Everything you need to apply, track progress, and take your next
            step.
          </p>
        </div>

        {/* Global Nav Links (EL-062, EL-063, EL-064) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <Link
            to="/notifications"
            data-testid="EL-062"
            className="btn btn-secondary btn-sm"
          >
            My Notifications
          </Link>
          <Link
            to="/account"
            data-testid="EL-063"
            className="btn btn-secondary btn-sm"
          >
            My Account
          </Link>
          <button
            type="button"
            data-testid="EL-064"
            className="btn btn-secondary btn-sm"
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      </div>

      {toastMessage && (
        <div
          className="alert alert-success"
          role="status"
          aria-live="polite"
          style={{ marginBottom: "20px" }}
        >
          <span>✓ {toastMessage}</span>
        </div>
      )}

      {errorMsg && (
        <ErrorMessage
          title="Process Hub Notice"
          message={errorMsg}
          code="HUB_LOAD_FAILED"
          onRetry={handleRefresh}
          className="mb-4"
        />
      )}

      <MetricCards
        loading={loading}
        error={!!errorMsg}
        items={[
          {
            title: "Assigned processes",
            value: totalAssigned,
            description: "Your departmental workflows",
            icon: "layers",
          },
          {
            title: "Action required",
            value: pendingActions,
            description: "Applications to start or update",
            icon: "clock",
          },
          {
            title: "In faculty review",
            value: inReview,
            description: "With your assigned reviewers",
            icon: "inbox",
          },
          {
            title: "Approved",
            value: approved,
            description: "Completed successfully",
            icon: "check",
            featured: true,
          },
        ]}
      />

      {/* Filter and Refresh Strip (EL-061, EL-065) */}
      <div
        className="card"
        style={{
          padding: "14px 20px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          backgroundColor: "var(--bg-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <label
            htmlFor="filter-my-process-status"
            className="form-label"
            style={{ fontSize: "13px", margin: 0 }}
          >
            Filter Status:
          </label>
          <select
            id="filter-my-process-status"
            data-testid="EL-061"
            className="form-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              height: "38px",
              minHeight: "38px",
              padding: "4px 10px",
              fontSize: "13px",
            }}
          >
            <option value="all">All Assigned Workflows</option>
            <option value="unstarted">Unstarted</option>
            <option value="draft">Draft Saved</option>
            <option value="submitted">Submitted</option>
            <option value="in_review">In Review</option>
            <option value="needs_changes">
              Needs Changes (Revision Required)
            </option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <button
          type="button"
          data-testid="EL-065"
          className="btn btn-secondary btn-sm"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh assigned processes"
        >
          {refreshing ? "Refreshing..." : "↻ Refresh Assigned Processes"}
        </button>
      </div>

      {!loading && pendingActions > 0 && (
        <div className="student-next-step">
          <span className="next-step-icon">
            <Icon name="clock" size={22} />
          </span>
          <div>
            <strong>Your next step is waiting</strong>
            <p>
              {pendingActions}{" "}
              {pendingActions === 1 ? "application needs" : "applications need"}{" "}
              your attention. Corrections and saved drafts appear first.
            </p>
          </div>
        </div>
      )}
      {/* Process Cards List */}
      {loading ? (
        <LoadingSkeleton
          label="Loading assigned workflows and submission records..."
          lines={5}
        />
      ) : filteredProcesses.length === 0 ? (
        <EmptyState
          title="No workflows found"
          description={
            statusFilter !== "all"
              ? 'No assigned workflows match this filter. Try selecting "All Assigned Workflows".'
              : "You have not been assigned to any active workflows yet. Check back once departmental circulars are published."
          }
          actionLabel={statusFilter !== "all" ? "Reset Filter" : undefined}
          onAction={() => setStatusFilter("all")}
        />
      ) : (
        <div className="process-card-grid">
          {filteredProcesses.map((process) => (
            <ProcessCard
              key={process.workflow.id}
              workflowId={process.workflow.id}
              title={process.workflow.title}
              description={process.workflow.description}
              deadline={
                process.workflow.deadline ||
                process.workflow.deadlinePolicy?.initialDeadline
              }
              status={process.derivedStatus}
              submissionId={process.submission?.id}
              stages={process.workflow.stages?.length || 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
