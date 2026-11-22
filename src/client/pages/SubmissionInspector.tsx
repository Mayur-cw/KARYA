import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorMessage } from '../components/ErrorMessage';
import { api } from '../api';

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
  action: 'approve' | 'needs_changes' | 'reject';
  reason?: string;
  decidedAt: string;
}

interface WorkflowDetail {
  id: string;
  title: string;
  description?: string;
  deadline: string;
  schema: {
    fields: Array<{
      id: string;
      label: string;
      type: string;
      required: boolean;
      description?: string;
    }>;
  };
  stages: Array<{
    name: string;
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
  status: 'draft' | 'submitted' | 'in_review' | 'needs_changes' | 'approved' | 'rejected';
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
      const subData = await api<SubmissionDetail>(`/api/submissions/${submissionId}`);
      setSubmission(subData);

      if (subData.workflowId) {
        try {
          const wfData = await api<WorkflowDetail>(`/api/workflows/${subData.workflowId}`);
          setWorkflow(wfData);
        } catch {
          // Non-blocking
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load submission audit record');
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
    showToast('Stage history refreshed from authoritative records');
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
      showToast(`Case Reference: ${submission.id}`);
    }
  };

  // EL-138 Open attached evidence
  const handleOpenAttachment = (attId: string) => {
    window.open(`/api/attachments/${attId}`, '_blank');
    showToast('Streaming verification document securely');
  };

  if (loading) {
    return (
      <div className="submission-inspector-page" data-testid="page-p-019" style={{ maxWidth: '1050px', margin: '0 auto' }}>
        <LoadingSkeleton label="Loading administrative submission inspection..." lines={8} />
      </div>
    );
  }

  if (errorMsg && !submission) {
    return (
      <div className="submission-inspector-page" data-testid="page-p-019" style={{ maxWidth: '1050px', margin: '0 auto' }}>
        <ErrorMessage
          title="Submission Inspection Notice"
          message={errorMsg}
          code="SUBMISSION_NOT_FOUND"
          onRetry={loadData}
          className="mb-4"
        />
        <div style={{ marginTop: '16px' }}>
          <Link to="/admin/workflows" className="btn btn-secondary">
            ← Return to Workflows
          </Link>
        </div>
      </div>
    );
  }

  if (!submission) return null;

  const stageName = workflow?.stages?.[submission.stageIndex]?.name || `Stage ${submission.stageIndex}`;
  const backMonitorUrl = submission.workflowId
    ? `/admin/workflows/${submission.workflowId}/monitor`
    : '/admin/workflows';

  return (
    <div className="submission-inspector-page" data-testid="page-p-019" style={{ maxWidth: '1050px', margin: '0 auto' }}>
      {/* Top Header & Navigation */}
      <div
        className="card-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Link to={backMonitorUrl} data-testid="EL-141" className="btn btn-secondary btn-sm" aria-label="Back to participation monitor">
              ← Participation Monitor
            </Link>
            <span className="badge badge-published">Read-Only Diagnostic</span>
            <StatusBadge status={submission.status} />
          </div>
          <h1>Administrative Submission Inspector</h1>
          <p className="card-subtitle">
            Authoritative institutional record for <strong>{submission.studentName || 'Student'}</strong> ({submission.studentEmail}) —{' '}
            {submission.workflowTitle || 'Internship Application'}
          </p>
        </div>

        {/* Header Action Tools (EL-139, EL-140, EL-142) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="EL-142"
            className="btn btn-secondary btn-sm"
            onClick={handleCopyReference}
            title="Copy Case Reference"
          >
            📋 Copy Case Ref
          </button>
          <button
            type="button"
            data-testid="EL-140"
            className="btn btn-secondary btn-sm"
            onClick={() => navigate(`/admin/workflows/${submission.workflowId}`)}
          >
            View Published Workflow →
          </button>
          <button
            type="button"
            data-testid="EL-139"
            className="btn btn-secondary btn-sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : '↻ Refresh History'}
          </button>
        </div>
      </div>

      {toastMessage && (
        <div className="alert alert-success" role="status" aria-live="polite" style={{ marginBottom: '20px' }}>
          <span>✓ {toastMessage}</span>
        </div>
      )}

      {errorMsg && (
        <ErrorMessage
          title="Inspection Notice"
          message={errorMsg}
          code="INSPECTOR_ERROR"
          className="mb-4"
        />
      )}

      {/* Main Grid: 2 Columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Applicant Overview & Dynamic Answers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Card: Applicant Summary */}
          <section className="card">
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
              Participant & Case Details
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px' }}>
              <div>
                <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Applicant Name</span>
                <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--ink-primary)', marginTop: '2px' }}>
                  {submission.studentName || 'Student Applicant'}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Email Address</span>
                <div style={{ color: 'var(--ink-primary)', marginTop: '2px' }}>
                  {submission.studentEmail || 'N/A'}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Current Stage</span>
                <div style={{ color: 'var(--ink-primary)', marginTop: '2px' }}>
                  Stage {submission.stageIndex}: <strong>{stageName}</strong>
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Assigned Evaluator</span>
                <div style={{ color: 'var(--ink-primary)', marginTop: '2px' }}>
                  {submission.currentReviewerName || 'None assigned'}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Revision Count</span>
                <div style={{ color: 'var(--ink-primary)', marginTop: '2px' }}>
                  Revision #{submission.revision} (v{submission.version})
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>First Submitted</span>
                <div style={{ color: 'var(--ink-primary)', marginTop: '2px' }}>
                  {new Date(submission.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          </section>

          {/* Card: Dynamic Field Responses */}
          <section className="card">
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
              Submitted Form Responses
            </h2>
            {workflow?.schema?.fields && workflow.schema.fields.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {workflow.schema.fields.map((fld) => {
                  const val = submission.answers[fld.id];
                  return (
                    <div
                      key={fld.id}
                      style={{
                        padding: '12px 16px',
                        backgroundColor: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-light)',
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '4px' }}>
                        {fld.label} {fld.required && <span style={{ color: 'var(--danger)' }}>*</span>}
                      </div>
                      <div style={{ fontSize: '14px', color: 'var(--ink-primary)', whiteSpace: 'pre-wrap' }}>
                        {val !== undefined && val !== null && String(val).trim() !== ''
                          ? String(val)
                          : <em style={{ color: 'var(--ink-muted)' }}>Not provided</em>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : Object.keys(submission.answers || {}).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Object.entries(submission.answers).map(([key, value]) => (
                  <div
                    key={key}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: 'var(--bg-subtle)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '4px' }}>
                      {key}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--ink-primary)' }}>{String(value)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--ink-muted)' }}>No form responses provided.</p>
            )}
          </section>
        </div>

        {/* Right Column: Uploaded Attachments & Stage History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Section: Uploaded Attachments (EL-138) */}
          <section className="card">
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
              Attached Evidence Documents
            </h2>
            {submission.attachments && submission.attachments.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {submission.attachments.map((att) => (
                  <div
                    key={att.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-subtle)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>📄 {att.displayName}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                        {(att.bytes / 1024).toFixed(1)} KiB • {att.mime}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid="EL-138"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleOpenAttachment(att.id)}
                      aria-label={`Open attached evidence ${att.displayName}`}
                    >
                      Stream Document ↗
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--ink-muted)', fontSize: '14px' }}>
                No attachments uploaded for this application.
              </p>
            )}
          </section>

          {/* Section: Stage & Decision Audit Trail */}
          <section className="card">
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
              Evaluation & Decision History
            </h2>
            {submission.history && submission.history.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {submission.history.map((record, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '14px',
                      borderLeft: `4px solid ${
                        record.action === 'approve'
                          ? 'var(--success)'
                          : record.action === 'needs_changes'
                          ? 'var(--warning)'
                          : 'var(--danger)'
                      }`,
                      backgroundColor: 'var(--bg-subtle)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, fontSize: '14px' }}>
                        Stage {record.stageIndex} — {record.action.toUpperCase()}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                        {new Date(record.decidedAt).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-secondary)', marginBottom: '4px' }}>
                      Evaluator: <strong>{record.reviewerName || record.reviewerId}</strong>
                    </div>
                    {record.reason && (
                      <div style={{ marginTop: '6px', fontSize: '13px', fontStyle: 'italic', color: 'var(--ink-primary)' }}>
                        &ldquo;{record.reason}&rdquo;
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--ink-muted)', fontSize: '13px' }}>
                No evaluation decisions recorded yet. Submission is pending initial stage review.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
