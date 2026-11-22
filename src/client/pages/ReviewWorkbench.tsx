import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorMessage } from '../components/ErrorMessage';
import { Dialog } from '../components/Dialog';
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

export default function ReviewWorkbench() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // EL-098 Feedback text
  const [feedback, setFeedback] = useState('');
  const [decisionType, setDecisionType] = useState<'approve' | 'needs_changes' | 'reject' | null>(null);

  // Modals & expansions (EL-097, EL-099, EL-102)
  const [showRequirementsModal, setShowRequirementsModal] = useState(false);
  const [showDecisionConfirmModal, setShowDecisionConfirmModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [submittingDecision, setSubmittingDecision] = useState(false);

  const confirmTriggerRef = useRef<HTMLButtonElement | null>(null);

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
          // Non-blocking if workflow fails
        }
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load submission details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [submissionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // EL-096 Refresh submission state
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    showToast('Submission details refreshed');
  };

  // EL-103 Copy submission reference
  const handleCopyReference = async () => {
    if (!submission) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(submission.id);
      }
      showToast(`Copied submission reference: ${submission.id.slice(0, 8)}...`);
    } catch {
      showToast(`Reference: ${submission.id}`);
    }
  };

  // EL-095 Read attached evidence
  const handleDownloadAttachment = (attId: string, _fileName: string) => {
    window.open(`/api/attachments/${attId}`, '_blank');
    showToast('Evidence file securely requested');
  };

  // Open Decision Dialog
  const handleOpenDecisionDialog = (type: 'approve' | 'needs_changes' | 'reject') => {
    setDecisionType(type);
    setShowDecisionConfirmModal(true);
  };

  // Submit Decision (EL-104, EL-105, EL-106)
  const handleSubmitDecision = async () => {
    if (!submission || !decisionType) return;

    if ((decisionType === 'needs_changes' || decisionType === 'reject') && feedback.trim().length < 10) {
      setErrorMsg('A detailed reason (at least 10 characters) is required when requesting revisions or rejecting an application.');
      return;
    }

    try {
      setSubmittingDecision(true);
      setErrorMsg(null);

      await api(`/api/submissions/${submission.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          action: decisionType,
          reason: feedback.trim(),
          expectedVersion: submission.version,
        }),
      });

      setShowDecisionConfirmModal(false);
      showToast(
        decisionType === 'approve'
          ? 'Stage decision saved; next reviewer notified or final approval recorded.'
          : decisionType === 'needs_changes'
          ? 'Revisions requested. Student has been notified to resubmit.'
          : 'Final rejection recorded and student notified.'
      );

      // Navigate back to reviewer inbox
      setTimeout(() => {
        navigate('/reviewer');
      }, 1000);
    } catch (err: unknown) {
      setShowDecisionConfirmModal(false);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to record stage decision');
      // On conflict, refresh to get current version
      await loadData();
    } finally {
      setSubmittingDecision(false);
    }
  };

  if (loading) {
    return (
      <div className="review-workbench-page" data-testid="page-p-013" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <LoadingSkeleton label="Loading review workbench..." lines={8} />
      </div>
    );
  }

  if (errorMsg && !submission) {
    return (
      <div className="review-workbench-page" data-testid="page-p-013" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <ErrorMessage
          title="Review Workbench Notice"
          message={errorMsg}
          code="SUBMISSION_NOT_FOUND"
          onRetry={loadData}
          className="mb-4"
        />
        <div style={{ marginTop: '16px' }}>
          <Link to="/reviewer" data-testid="EL-101" className="btn btn-secondary">
            ← Return to Review Inbox
          </Link>
        </div>
      </div>
    );
  }

  if (!submission) return null;

  const isAssignedReviewer = submission.currentReviewerId === user?.id;
  const isPendingReview = submission.status === 'submitted' || submission.status === 'in_review';
  const canDecide = isAssignedReviewer && isPendingReview;
  const stageName = workflow?.stages?.[submission.stageIndex]?.name || `Stage ${submission.stageIndex}`;

  return (
    <div className="review-workbench-page" data-testid="page-p-013" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Top Header & Context */}
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
            <Link to="/reviewer" data-testid="EL-101" className="btn btn-secondary btn-sm" aria-label="Return to review inbox">
              ← Reviewer Inbox
            </Link>
            <span className="badge badge-in_review">Stage {submission.stageIndex}: {stageName}</span>
            <StatusBadge status={submission.status} />
          </div>
          <h1>Review Workbench</h1>
          <p className="card-subtitle">
            Evaluating application for <strong>{submission.studentName || 'Student'}</strong> ({submission.studentEmail}) —{' '}
            {submission.workflowTitle || 'Internship Application'}
          </p>
        </div>

        {/* Header Action Tools (EL-096, EL-097, EL-103) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="EL-103"
            className="btn btn-secondary btn-sm"
            onClick={handleCopyReference}
            title="Copy Opaque Submission Reference"
          >
            📋 Copy Ref
          </button>
          <button
            type="button"
            data-testid="EL-097"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowRequirementsModal(true)}
          >
            📜 View Requirements
          </button>
          <button
            type="button"
            data-testid="EL-096"
            className="btn btn-secondary btn-sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : '↻ Refresh State'}
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
          title="Review Action Notice"
          message={errorMsg}
          code="REVIEW_ERROR"
          className="mb-4"
        />
      )}

      {!canDecide && (
        <div className="alert alert-warning" style={{ marginBottom: '20px' }}>
          <strong>Evaluation Status: </strong>
          {!isAssignedReviewer ? (
            <span>
              You are viewing this submission in read-only mode. The active evaluator for Stage {submission.stageIndex} is{' '}
              <strong>{submission.currentReviewerName || 'another designated reviewer'}</strong>.
            </span>
          ) : (
            <span>
              This submission is currently in status <strong>{submission.status}</strong>. Decisions cannot be recorded until it is resubmitted.
            </span>
          )}
        </div>
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
        {/* Left Column: Application Details & Answers & Attachments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Section: Dynamic Field Responses */}
          <section className="card">
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
              Applicant Responses
            </h2>
            {workflow?.schema?.fields && workflow.schema.fields.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {workflow.schema.fields.map((field) => {
                  const val = submission.answers[field.id];
                  return (
                    <div
                      key={field.id}
                      style={{
                        padding: '12px 16px',
                        backgroundColor: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-light)',
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '4px' }}>
                        {field.label} {field.required && <span style={{ color: 'var(--danger)' }}>*</span>}
                      </div>
                      <div style={{ fontSize: '15px', color: 'var(--ink-primary)', whiteSpace: 'pre-wrap' }}>
                        {val !== undefined && val !== null && String(val).trim() !== ''
                          ? String(val)
                          : <em style={{ color: 'var(--ink-muted)' }}>Not provided</em>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : Object.keys(submission.answers || {}).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
              <p style={{ color: 'var(--ink-muted)' }}>No dynamic field answers provided.</p>
            )}
          </section>

          {/* Section: Uploaded Evidence Attachments (EL-095) */}
          <section className="card">
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
              Uploaded Verification Evidence
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
                        {(att.bytes / 1024).toFixed(1)} KiB • {att.mime} • Status: {att.status}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid="EL-095"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleDownloadAttachment(att.id, att.displayName)}
                      aria-label={`Read attached evidence ${att.displayName}`}
                    >
                      Inspect / Stream ↗
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--ink-muted)' }}>
                No documents uploaded for this application.
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Decision Panel & History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Decision Action Panel (EL-098, EL-099) */}
          <section className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
              Evaluation & Decision Desk
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--ink-muted)', marginBottom: '16px' }}>
              Record your official review for Stage {submission.stageIndex}. Decisions are immutably logged to the institutional audit ledger.
            </p>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label htmlFor="decision-feedback-textarea" className="form-label">
                Reviewer Evaluation Notes / Reason {canDecide && <span style={{ color: 'var(--ink-muted)' }}>(Min 10 chars for revisions or rejection)</span>}
              </label>
              <textarea
                id="decision-feedback-textarea"
                data-testid="EL-098"
                className="form-textarea"
                rows={4}
                placeholder="Enter feedback for student, revision instructions, or evaluation remarks..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                disabled={!canDecide}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--ink-muted)', marginTop: '4px' }}>
                <span>Length: {feedback.trim().length} characters</span>
                {feedback.trim().length < 10 && (
                  <span style={{ color: 'var(--warning)' }}>Requires &gt;= 10 chars for revisions/reject</span>
                )}
              </div>
            </div>

            {canDecide ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  type="button"
                  ref={confirmTriggerRef}
                  data-testid="EL-099"
                  className="btn btn-primary"
                  onClick={() => handleOpenDecisionDialog('approve')}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  ✓ Approve Stage {submission.stageIndex}
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleOpenDecisionDialog('needs_changes')}
                    disabled={feedback.trim().length < 10}
                    style={{ justifyContent: 'center', borderColor: 'var(--warning)', color: 'var(--warning)' }}
                  >
                    ⚠ Request Changes
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleOpenDecisionDialog('reject')}
                    disabled={feedback.trim().length < 10}
                    style={{ justifyContent: 'center', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                  >
                    ✕ Reject Application
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--ink-muted)', textAlign: 'center', padding: '12px' }}>
                Decision actions are disabled for this stage or viewer.
              </div>
            )}
          </section>

          {/* Decision Timeline / History (EL-102) */}
          <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>
                Decision History
              </h2>
              <button
                type="button"
                data-testid="EL-102"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowHistory(!showHistory)}
              >
                {showHistory ? 'Hide History' : 'Inspect Timeline'}
              </button>
            </div>

            {showHistory && (
              <div style={{ marginTop: '12px' }}>
                {submission.history && submission.history.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {submission.history.map((record, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px',
                          borderLeft: `3px solid ${
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px' }}>
                            Stage {record.stageIndex} — {record.action.toUpperCase()}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                            {new Date(record.decidedAt).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--ink-secondary)' }}>
                          Reviewer: {record.reviewerName || record.reviewerId.slice(0, 8)}
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
                  <p style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
                    No decisions recorded yet. This application is awaiting initial stage review.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Confirmation Modal for Decision (EL-100, EL-104, EL-105, EL-106) */}
      <Dialog
        isOpen={showDecisionConfirmModal}
        onClose={() => setShowDecisionConfirmModal(false)}
        title={
          decisionType === 'approve'
            ? `Confirm Approval — Stage ${submission.stageIndex}`
            : decisionType === 'needs_changes'
            ? 'Confirm Request for Changes'
            : 'Confirm Final Rejection'
        }
        description={
          decisionType === 'approve'
            ? `Are you sure you want to approve Stage ${submission.stageIndex} for submission ${submission.id.slice(0, 8)}...?`
            : decisionType === 'needs_changes'
            ? 'The student will be asked to revise their answers and resubmit. Your feedback will be visible to them.'
            : 'This will irreversibly terminate the application. The student will be notified of this final decision.'
        }
      >
        <div style={{ margin: '16px 0', padding: '12px', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ fontSize: '13px', marginBottom: '6px' }}>
            <strong>Target Submission:</strong> <code>{submission.id}</code>
          </div>
          <div style={{ fontSize: '13px', marginBottom: '6px' }}>
            <strong>Applicant:</strong> {submission.studentName || 'Student'} ({submission.studentEmail})
          </div>
          <div style={{ fontSize: '13px' }}>
            <strong>Feedback / Reason:</strong>{' '}
            {feedback.trim() ? feedback.trim() : <em style={{ color: 'var(--ink-muted)' }}>None provided (approval)</em>}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
          <button
            type="button"
            data-testid="EL-100"
            className="btn btn-secondary"
            onClick={() => setShowDecisionConfirmModal(false)}
            disabled={submittingDecision}
          >
            Cancel Decision
          </button>

          {decisionType === 'approve' && (
            <button
              type="button"
              data-testid="EL-104"
              className="btn btn-primary"
              onClick={handleSubmitDecision}
              disabled={submittingDecision}
            >
              {submittingDecision ? 'Submitting...' : 'Approve Current Stage'}
            </button>
          )}

          {decisionType === 'needs_changes' && (
            <button
              type="button"
              data-testid="EL-105"
              className="btn btn-primary"
              onClick={handleSubmitDecision}
              disabled={submittingDecision || feedback.trim().length < 10}
              style={{ backgroundColor: 'var(--warning)', borderColor: 'var(--warning)' }}
            >
              {submittingDecision ? 'Submitting...' : 'Request Corrections'}
            </button>
          )}

          {decisionType === 'reject' && (
            <button
              type="button"
              data-testid="EL-106"
              className="btn btn-primary"
              onClick={handleSubmitDecision}
              disabled={submittingDecision || feedback.trim().length < 10}
              style={{ backgroundColor: 'var(--danger)', borderColor: 'var(--danger)' }}
            >
              {submittingDecision ? 'Submitting...' : 'Reject Application Finally'}
            </button>
          )}
        </div>
      </Dialog>

      {/* Workflow Requirements Modal */}
      <Dialog
        isOpen={showRequirementsModal}
        onClose={() => setShowRequirementsModal(false)}
        title={workflow?.title || 'Workflow Requirements'}
        description="Official published requirements and stages for this institutional process."
      >
        <div style={{ margin: '16px 0', maxHeight: '400px', overflowY: 'auto' }}>
          <p style={{ fontSize: '14px', marginBottom: '16px' }}>
            {workflow?.description || 'No detailed instructions provided.'}
          </p>

          <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>Review Stages</h3>
          {workflow?.stages && workflow.stages.length > 0 ? (
            <ol style={{ paddingLeft: '20px', fontSize: '13px' }}>
              {workflow.stages.map((stg, i) => (
                <li key={i} style={{ marginBottom: '6px' }}>
                  <strong>{stg.name}</strong> — Assigned Evaluator: {stg.reviewerName || stg.reviewerId}
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>Single stage evaluation.</p>
          )}

          <h3 style={{ fontSize: '14px', fontWeight: 700, marginTop: '16px', marginBottom: '8px' }}>
            Form Fields Required
          </h3>
          {workflow?.schema?.fields && (
            <ul style={{ paddingLeft: '20px', fontSize: '13px' }}>
              {workflow.schema.fields.map((fld) => (
                <li key={fld.id} style={{ marginBottom: '4px' }}>
                  <strong>{fld.label}</strong> ({fld.type}) {fld.required && '— Required'}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowRequirementsModal(false)}
          >
            Close
          </button>
        </div>
      </Dialog>
    </div>
  );
}
