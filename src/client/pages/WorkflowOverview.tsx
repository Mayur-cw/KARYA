import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorMessage } from "../components/ErrorMessage";
import { Dialog } from "../components/Dialog";
import { api } from "../api";

interface DynamicField {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
}

interface ReviewStage {
  stageIndex: number;
  label: string;
  reviewerId: string;
}

interface WorkflowDetail {
  id: string;
  departmentId: string;
  title: string;
  description: string;
  status: "draft" | "proposed" | "published" | "archived";
  version: number;
  origin: string;
  deadline?: string;
  sourceId?: string | null;
  fields: DynamicField[];
  stages: ReviewStage[];
  createdAt: string;
  updatedAt: string;
}

interface WorkflowMetrics {
  totalAssigned: number;
  totalSubmissions: number;
  inReview: number;
  needsChanges: number;
  approved: number;
  rejected: number;
  stage0Pending: number;
  stage1Pending: number;
}

export default function WorkflowOverview() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();

  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [metrics, setMetrics] = useState<WorkflowMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Source document viewer (EL-047)
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  const loadWorkflow = useCallback(async () => {
    if (!workflowId) return;
    try {
      setLoading(true);
      setErrorMsg(null);

      const [wf, m] = await Promise.all([
        api<WorkflowDetail>(`/api/workflows/${workflowId}`),
        api<import("../../shared/contracts").WorkflowAnalytics>(
          `/api/workflows/${workflowId}/analytics`,
        ).catch(() => null),
      ]);

      setWorkflow(wf);
      setMetrics(
        m
          ? {
              ...m,
              totalSubmissions:
                m.draft +
                m.submitted +
                m.inReview +
                m.needsChanges +
                m.approved +
                m.rejected,
              stage0Pending:
                m.stageBreakdown.find((stage) => stage.stageIndex === 0)
                  ?.pendingCount || 0,
              stage1Pending:
                m.stageBreakdown.find((stage) => stage.stageIndex === 1)
                  ?.pendingCount || 0,
            }
          : null,
      );
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to load workflow details",
      );
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    loadWorkflow();
  }, [loadWorkflow]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // EL-047 View original source
  const handleViewSource = async () => {
    if (!workflow?.sourceId) {
      showToast("No external source document associated with this workflow");
      return;
    }
    setSourceLoading(true);
    setSourceModalOpen(true);
    try {
      const doc = await api<{ extractedText: string }>(
        `/api/documents/${workflow.sourceId}`,
      );
      setSourceText(doc.extractedText);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to retrieve source text",
      );
    } finally {
      setSourceLoading(false);
    }
  };

  // EL-048 Export completion CSV
  const handleExportCsv = async () => {
    if (!workflowId) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/report.csv`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("CSV download request failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `karya_workflow_${workflowId.slice(0, 8)}_report.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast("Completion report downloaded successfully");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "CSV export failed");
    } finally {
      setDownloading(false);
    }
  };

  // EL-049 Archive workflow
  const handleArchive = async () => {
    if (!workflowId || !workflow) return;
    if (!archiveReason.trim()) return;
    setArchiving(true);
    setErrorMsg(null);
    try {
      await api(`/api/workflows/${workflowId}/archive`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: workflow.version,
          reason: archiveReason.trim(),
        }),
      });
      setArchiveOpen(false);
      showToast("Workflow has been archived");
      await loadWorkflow();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Archive action failed");
    } finally {
      setArchiving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "32px 0" }}>
        <LoadingSkeleton
          label="Loading workflow details and participation telemetry..."
          lines={6}
        />
      </div>
    );
  }

  if (!workflow) {
    return (
      <ErrorMessage
        title="Workflow Not Found"
        message="The requested workflow could not be loaded."
        code="NOT_FOUND"
        onRetry={loadWorkflow}
      />
    );
  }

  const isPublished = workflow.status === "published";
  const isArchived = workflow.status === "archived";

  return (
    <div
      className="workflow-overview-page"
      data-testid="page-p-007"
      style={{ maxWidth: "1000px", margin: "0 auto" }}
    >
      {/* Return link (EL-050) */}
      <div style={{ marginBottom: "16px" }}>
        <Link
          to="/admin/workflows"
          data-testid="EL-050"
          className="btn btn-secondary btn-sm"
        >
          Return to Workflow Registry
        </Link>
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
          title="Workflow Error"
          message={errorMsg}
          code="ACTION_FAILED"
          onRetry={() => setErrorMsg(null)}
          className="mb-4"
        />
      )}

      {/* Top Header Card */}
      <div className="card" style={{ marginBottom: "24px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "16px",
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
              <span className="badge badge-published">Workflow Detail</span>
              <StatusBadge status={workflow.status} />
              <span style={{ fontSize: "13px", color: "var(--ink-muted)" }}>
                v{workflow.version}
              </span>
            </div>
            <h1>{workflow.title}</h1>
            <p
              className="card-subtitle"
              style={{ maxWidth: "640px", marginTop: "6px" }}
            >
              {workflow.description || "No description provided."}
            </p>
          </div>

          {/* Action Strip (EL-045, EL-046, EL-048, EL-049) */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              data-testid="EL-045"
              className="btn btn-primary btn-sm"
              onClick={() => navigate(`/admin/workflows/${workflowId}/monitor`)}
            >
              📊 Process Monitor
            </button>

            {!isPublished && !isArchived && (
              <button
                type="button"
                data-testid="EL-046"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/admin/workflows/${workflowId}/edit`)}
              >
                ✏ Edit Proposal
              </button>
            )}

            {workflow.sourceId && (
              <button
                type="button"
                data-testid="EL-047"
                className="btn btn-secondary btn-sm"
                onClick={handleViewSource}
              >
                📄 View Source
              </button>
            )}

            <button
              type="button"
              data-testid="EL-048"
              className="btn btn-secondary btn-sm"
              onClick={handleExportCsv}
              disabled={downloading}
            >
              {downloading ? "Exporting..." : "📥 Export CSV"}
            </button>

            {!isArchived && (
              <button
                type="button"
                data-testid="EL-049"
                className="btn btn-danger btn-sm"
                onClick={() => setArchiveOpen(true)}
                disabled={archiving}
              >
                {archiving ? "Archiving..." : "Archive"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Participation Telemetry Cards (Derived from EP-034) */}
      <section style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "18px", marginBottom: "14px" }}>
          Participation Telemetry
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
            gap: "16px",
          }}
        >
          <div className="card">
            <span
              style={{
                fontSize: "12px",
                color: "var(--ink-muted)",
                fontWeight: 600,
              }}
            >
              TOTAL ASSIGNED
            </span>
            <div
              style={{ fontSize: "28px", fontWeight: 800, marginTop: "4px" }}
            >
              {metrics ? metrics.totalAssigned : "-"}
            </div>
          </div>

          <div className="card">
            <span
              style={{
                fontSize: "12px",
                color: "var(--primary)",
                fontWeight: 600,
              }}
            >
              SUBMITTED
            </span>
            <div
              style={{
                fontSize: "28px",
                fontWeight: 800,
                color: "var(--primary)",
                marginTop: "4px",
              }}
            >
              {metrics ? metrics.totalSubmissions : "-"}
            </div>
          </div>

          <div className="card">
            <span
              style={{
                fontSize: "12px",
                color: "var(--warning)",
                fontWeight: 600,
              }}
            >
              IN REVIEW
            </span>
            <div
              style={{
                fontSize: "28px",
                fontWeight: 800,
                color: "var(--warning)",
                marginTop: "4px",
              }}
            >
              {metrics ? metrics.inReview : "-"}
            </div>
          </div>

          <div className="card">
            <span
              style={{
                fontSize: "12px",
                color: "var(--success)",
                fontWeight: 600,
              }}
            >
              APPROVED
            </span>
            <div
              style={{
                fontSize: "28px",
                fontWeight: 800,
                color: "var(--success)",
                marginTop: "4px",
              }}
            >
              {metrics ? metrics.approved : "-"}
            </div>
          </div>

          <div className="card">
            <span
              style={{
                fontSize: "12px",
                color: "var(--danger)",
                fontWeight: 600,
              }}
            >
              REJECTED
            </span>
            <div
              style={{
                fontSize: "28px",
                fontWeight: 800,
                color: "var(--danger)",
                marginTop: "4px",
              }}
            >
              {metrics ? metrics.rejected : "-"}
            </div>
          </div>
        </div>
      </section>

      {/* Process Structure Overview */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
          gap: "20px",
        }}
      >
        {/* Stages and Reviewers */}
        <div className="card">
          <h2 style={{ fontSize: "16px", marginBottom: "12px" }}>
            Review Pipeline
          </h2>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {workflow.stages?.map((s) => (
              <div
                key={s.stageIndex}
                style={{
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  backgroundColor: "var(--bg-subtle)",
                  border: "1px solid var(--border-light)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>
                    Stage {s.stageIndex + 1}: {s.label}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
                    Reviewer ID:{" "}
                    {s.reviewerId
                      ? s.reviewerId.substring(0, 8) + "..."
                      : "Unassigned"}
                  </div>
                </div>
                <span className="badge badge-draft">Sequential</span>
              </div>
            ))}
          </div>
        </div>

        {/* Dynamic Fields Schema */}
        <div className="card">
          <h2 style={{ fontSize: "16px", marginBottom: "12px" }}>
            Applicant Schema ({workflow.fields?.length || 0} fields)
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {workflow.fields?.map((f) => (
              <div
                key={f.key}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-light)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "13px",
                }}
              >
                <span>
                  <strong>{f.label}</strong>{" "}
                  {f.required && (
                    <span style={{ color: "var(--danger)" }}>*</span>
                  )}
                </span>
                <span
                  className="badge badge-draft"
                  style={{ fontSize: "11px" }}
                >
                  {f.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Source Document Viewer Dialog (EL-047) */}
      <Dialog
        isOpen={sourceModalOpen}
        onClose={() => setSourceModalOpen(false)}
        title="Ingested Circular Source Text"
        description="Verifiable source text referenced for grounded extraction"
        maxWidth="720px"
      >
        {sourceLoading ? (
          <LoadingSkeleton
            label="Retrieving encrypted source document..."
            lines={6}
          />
        ) : (
          <div>
            <div
              style={{
                maxHeight: "360px",
                overflowY: "auto",
                padding: "16px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--bg-subtle)",
                fontFamily: "var(--font-mono)",
                fontSize: "13px",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                border: "1px solid var(--border-light)",
              }}
            >
              {sourceText || "No text extracted."}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "16px",
              }}
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSourceModalOpen(false)}
              >
                Close Viewer
              </button>
            </div>
          </div>
        )}
      </Dialog>
      <Dialog
        isOpen={archiveOpen}
        onClose={() => {
          if (!archiving) setArchiveOpen(false);
        }}
        title="Archive this workflow?"
        description="Archiving stops new applications and makes the workflow read-only. Existing records remain available."
      >
        <div className="form-group">
          <label className="form-label" htmlFor="archive-reason">
            Reason for archiving
          </label>
          <textarea
            id="archive-reason"
            className="form-textarea"
            maxLength={500}
            value={archiveReason}
            onChange={(event) => setArchiveReason(event.target.value)}
            placeholder="Explain why this process is being closed."
            disabled={archiving}
          />
        </div>
        <div className="heading-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setArchiveOpen(false)}
            disabled={archiving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleArchive}
            disabled={archiving || !archiveReason.trim()}
          >
            {archiving ? "Archiving…" : "Confirm archive"}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
