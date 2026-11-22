import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorMessage } from "../components/ErrorMessage";
import { api } from "../api";

interface AttachmentItem {
  id: string;
  submissionId: string;
  displayName: string;
  mime: string;
  bytes: number;
  status: string;
  createdAt: string;
}

interface DecisionRecord {
  stageIndex: number;
  reviewerId: string;
  reviewerName?: string;
  action: "approve" | "needs_changes" | "reject";
  reason?: string;
  decidedAt: string;
}

interface WorkflowDetail {
  id: string;
  title: string;
  description?: string;
  deadline: string;
  fields?: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
  }>;
  schema?: {
    fields: Array<{
      id: string;
      label: string;
      type: string;
      required: boolean;
    }>;
  };
  stages?: Array<{
    label: string;
    reviewerId: string;
    reviewerName?: string;
  }>;
}

interface SubmissionDetail {
  id: string;
  workflowId: string;
  studentId: string;
  assignmentId?: string;
  answers: Record<string, unknown>;
  status:
    | "draft"
    | "submitted"
    | "in_review"
    | "needs_changes"
    | "approved"
    | "rejected";
  stageIndex: number;
  revision: number;
  version: number;
  history?: DecisionRecord[];
  createdAt: string;
  updatedAt: string;
  studentName?: string;
  studentEmail?: string;
  workflowTitle?: string;
  workflowDeadline?: string | null;
  currentReviewerId?: string | null;
  currentReviewerName?: string | null;
  attachments?: AttachmentItem[];
}

export default function SubmissionInspector() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = useCallback(async () => {
    if (!submissionId) return;
    try {
      setErrorMsg(null);
      const subData = await api<SubmissionDetail>(
        `/api/submissions/${submissionId}`,
      );
      setSubmission(subData);

      if (subData.workflowId) {
        try {
          const wfData = await api<WorkflowDetail>(
            `/api/workflows/${subData.workflowId}`,
          );
          setWorkflow(wfData);
        } catch {
          // Non-blocking
        }
      }
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to inspect submission",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [submissionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // EL-139 Refresh stage history
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    showToast("Stage history and submission state refreshed");
  };

  // EL-142 Copy case reference
  const handleCopyReference = async () => {
    if (!submission) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(submission.id);
      }
      showToast(`Copied case reference: ${submission.id.slice(0, 8)}...`);
    } catch {
      showToast(`Case reference: ${submission.id}`);
    }
  };

  // EL-138 Open attached evidence
  const handleOpenEvidence = (attId: string) => {
    window.open(`/api/attachments/${attId}`, "_blank");
    showToast("Evidence securely streamed");
  };

  // EL-140 View published workflow
  const handleViewWorkflow = () => {
    if (!submission?.workflowId) return;
    navigate(`/admin/workflows/${submission.workflowId}`);
  };

  if (loading) {
    return (
      <div
        className="submission-inspector-page"
        data-testid="page-p-019"
        style={{ maxWidth: "1100px", margin: "0 auto" }}
      >
        <LoadingSkeleton
          label="Loading administrative submission inspection..."
          lines={8}
        />
      </div>
    );
  }

  if (errorMsg && !submission) {
    return (
      <div
        className="submission-inspector-page"
        data-testid="page-p-019"
        style={{ maxWidth: "1100px", margin: "0 auto" }}
      >
        <ErrorMessage
          title="Submission Inspection Notice"
          message={errorMsg}
          code="SUBMISSION_NOT_FOUND"
          onRetry={loadData}
          className="mb-4"
        />
        <div style={{ marginTop: "16px" }}>
          <Link
            to="/admin/workflows"
            data-testid="EL-141"
            className="btn btn-secondary"
          >
            Return to Workflows
          </Link>
        </div>
      </div>
    );
  }

  if (!submission) return null;

  const monitorUrl = submission.workflowId
    ? `/admin/workflows/${submission.workflowId}/monitor`
    : "/admin/workflows";

  const currentStageName =
    workflow?.stages?.[submission.stageIndex]?.label ||
    `Stage ${submission.stageIndex + 1}`;

  return (
    <div
      className="submission-inspector-page"
      data-testid="page-p-019"
      style={{ maxWidth: "1100px", margin: "0 auto" }}
    >
      {/* Top Header & Context */}
      <div
        className="card-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "20px",
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
            <Link
              to={monitorUrl}
              data-testid="EL-141"
              className="btn btn-secondary btn-sm"
              aria-label="Back to participation monitor"
            >
              Process Monitor
            </Link>
            <span className="badge badge-draft">Admin Inspector</span>
            <StatusBadge status={submission.status} />
          </div>
          <h1>Administrative Submission Inspector</h1>
          <p className="card-subtitle">
            Diagnostic supervision for{" "}
            <strong>{submission.studentName || "Student"}</strong> (
            {submission.studentEmail}) —{" "}
            {submission.workflowTitle || "Internship Application"}
          </p>
        </div>

        {/* Header Action Tools (EL-139, EL-140, EL-142) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            data-testid="EL-142"
            className="btn btn-secondary btn-sm"
            onClick={handleCopyReference}
            title="Copy Opaque Case Reference"
          >
            📋 Copy Case Ref
          </button>
          <button
            type="button"
            data-testid="EL-140"
            className="btn btn-secondary btn-sm"
            onClick={handleViewWorkflow}
          >
            📜 View Published Workflow
          </button>
          <button
            type="button"
            data-testid="EL-139"
            className="btn btn-secondary btn-sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "↻ Refresh History"}
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
          title="Inspector Notice"
          message={errorMsg}
          code="INSPECTOR_NOTICE"
          className="mb-4"
        />
      )}

      {/* Non-Impersonation Supervision Notice */}
      <div
        className="alert alert-info"
        style={{
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <span>
          🛡️ <strong>Privileged Supervisory Read-Only Mode:</strong>{" "}
          Administrators can inspect applicant responses, stream evidence files,
          and examine stage decision logs. To preserve institutional integrity,
          administrators cannot impersonate faculty mentors or record review
          approvals on this route.
        </span>
      </div>

      {/* Main Grid: 2 Columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
          gap: "24px",
          alignItems: "start",
        }}
      >
        {/* Left Column: Summary, Responses & Evidence */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Section: Applicant & Participation Summary */}
          <section className="card">
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 700,
                marginBottom: "16px",
              }}
            >
              Participation Summary
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
                gap: "16px",
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--ink-muted)",
                  }}
                >
                  Student Applicant
                </span>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 700,
                    color: "var(--ink-primary)",
                    marginTop: "2px",
                  }}
                >
                  {submission.studentName || "Student"}
                </div>
                <div
                  style={{ fontSize: "12px", color: "var(--ink-secondary)" }}
                >
                  {submission.studentEmail}
                </div>
              </div>

              <div>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--ink-muted)",
                  }}
                >
                  Current Stage
                </span>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--primary)",
                    marginTop: "2px",
                  }}
                >
                  Stage {submission.stageIndex + 1}: {currentStageName}
                </div>
                <div style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
                  Evaluator:{" "}
                  {submission.currentReviewerName ||
                    submission.currentReviewerId ||
                    "Unassigned"}
                </div>
              </div>

              <div>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--ink-muted)",
                  }}
                >
                  Lifecycle Status
                </span>
                <div style={{ marginTop: "4px" }}>
                  <StatusBadge status={submission.status} />
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--ink-muted)",
                    marginTop: "4px",
                  }}
                >
                  Revision: #{submission.revision} • Version:{" "}
                  {submission.version}
                </div>
              </div>

              <div>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--ink-muted)",
                  }}
                >
                  Timestamps
                </span>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--ink-secondary)",
                    marginTop: "2px",
                  }}
                >
                  Created: {new Date(submission.createdAt).toLocaleString()}
                </div>
                <div
                  style={{ fontSize: "12px", color: "var(--ink-secondary)" }}
                >
                  Updated: {new Date(submission.updatedAt).toLocaleString()}
                </div>
              </div>
            </div>
          </section>

          {/* Section: Field Evidence Responses */}
          <section className="card">
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 700,
                marginBottom: "16px",
              }}
            >
              Submitted Field Answers
            </h2>

            {(workflow?.fields || workflow?.schema?.fields) &&
            (workflow.fields || workflow.schema?.fields || []).length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                {(workflow.fields || workflow.schema?.fields || []).map(
                  (field) => {
                    const val =
                      submission.answers["key" in field ? field.key : field.id];
                    return (
                      <div
                        key={"key" in field ? field.key : field.id}
                        style={{
                          padding: "12px 16px",
                          backgroundColor: "var(--bg-subtle)",
                          borderRadius: "var(--radius-md)",
                          border: "1px solid var(--border-light)",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "var(--ink-muted)",
                            marginBottom: "4px",
                          }}
                        >
                          {field.label}{" "}
                          {field.required && (
                            <span style={{ color: "var(--danger)" }}>*</span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "15px",
                            color: "var(--ink-primary)",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {val !== undefined &&
                          val !== null &&
                          String(val).trim() !== "" ? (
                            field.type === "file" ? (
                              submission.attachments?.find(
                                (attachment) => attachment.id === val,
                              )?.displayName || "Attached document"
                            ) : (
                              String(val)
                            )
                          ) : (
                            <em style={{ color: "var(--ink-muted)" }}>
                              Not provided
                            </em>
                          )}
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            ) : Object.keys(submission.answers || {}).length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {Object.entries(submission.answers).map(([key, value]) => (
                  <div
                    key={key}
                    style={{
                      padding: "12px 16px",
                      backgroundColor: "var(--bg-subtle)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--ink-muted)",
                        marginBottom: "4px",
                      }}
                    >
                      {key}
                    </div>
                    <div
                      style={{ fontSize: "14px", color: "var(--ink-primary)" }}
                    >
                      {String(value)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--ink-muted)" }}>
                No dynamic field answers provided.
              </p>
            )}
          </section>

          {/* Section: Uploaded Evidence Attachments (EL-138) */}
          <section className="card">
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 700,
                marginBottom: "16px",
              }}
            >
              Attached Verification Documents
            </h2>

            {submission.attachments && submission.attachments.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {submission.attachments.map((att) => (
                  <div
                    key={att.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 16px",
                      border: "1px solid var(--border-light)",
                      borderRadius: "var(--radius-md)",
                      backgroundColor: "var(--bg-subtle)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "14px" }}>
                        📄 {att.displayName}
                      </div>
                      <div
                        style={{ fontSize: "12px", color: "var(--ink-muted)" }}
                      >
                        {(att.bytes / 1024).toFixed(1)} KiB • {att.mime} •
                        Status: {att.status}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid="EL-138"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleOpenEvidence(att.id)}
                      aria-label={`Open attached evidence ${att.displayName}`}
                    >
                      Inspect / Stream ↗
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: "16px",
                  textAlign: "center",
                  color: "var(--ink-muted)",
                }}
              >
                No documents uploaded for this application.
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Stage Decision History */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <section className="card">
            <h2
              style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}
            >
              Sequential Stage Decision History
            </h2>
            <p
              style={{
                fontSize: "13px",
                color: "var(--ink-muted)",
                marginBottom: "16px",
              }}
            >
              Immutable audit history of evaluator actions, rejection loops, and
              final approvals for this case.
            </p>

            {submission.history && submission.history.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                {submission.history.map((record, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "14px",
                      borderLeft: `4px solid ${
                        record.action === "approve"
                          ? "var(--success)"
                          : record.action === "needs_changes"
                            ? "var(--warning)"
                            : "var(--danger)"
                      }`,
                      backgroundColor: "var(--bg-subtle)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "6px",
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: "13px" }}>
                        Stage {record.stageIndex + 1} —{" "}
                        {record.action.toUpperCase()}
                      </span>
                      <span
                        style={{ fontSize: "11px", color: "var(--ink-muted)" }}
                      >
                        {new Date(record.decidedAt).toLocaleString()}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--ink-secondary)",
                      }}
                    >
                      Evaluator:{" "}
                      <strong>
                        {record.reviewerName || record.reviewerId}
                      </strong>
                    </div>
                    {record.reason && (
                      <div
                        style={{
                          marginTop: "8px",
                          padding: "8px 12px",
                          backgroundColor: "var(--bg-white)",
                          border: "1px solid var(--border-light)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "13px",
                          fontStyle: "italic",
                          color: "var(--ink-primary)",
                        }}
                      >
                        &ldquo;{record.reason}&rdquo;
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: "16px",
                  textAlign: "center",
                  color: "var(--ink-muted)",
                }}
              >
                No stage decisions recorded yet. Case is awaiting initial
                evaluation.
              </div>
            )}
          </section>

          {/* Opaque Reference Details */}
          <section className="card">
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 700,
                marginBottom: "12px",
              }}
            >
              Technical Reference Metadata
            </h2>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                fontSize: "12px",
                fontFamily: "monospace",
              }}
            >
              <div>
                <span style={{ color: "var(--ink-muted)" }}>
                  Submission ID:{" "}
                </span>
                <span>{submission.id}</span>
              </div>
              <div>
                <span style={{ color: "var(--ink-muted)" }}>Workflow ID: </span>
                <span>{submission.workflowId}</span>
              </div>
              <div>
                <span style={{ color: "var(--ink-muted)" }}>Student ID: </span>
                <span>{submission.studentId}</span>
              </div>
              <div>
                <span style={{ color: "var(--ink-muted)" }}>
                  Assignment ID:{" "}
                </span>
                <span>{submission.assignmentId || "N/A"}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
