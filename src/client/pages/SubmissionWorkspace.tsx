import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorMessage } from '../components/ErrorMessage';
import { Dialog } from '../components/Dialog';
import { api, ApiError } from '../api';

interface DynamicField {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'file';
  required: boolean;
  options?: string[];
  placeholder?: string;
}

interface WorkflowData {
  id: string;
  title: string;
  description: string;
  status: 'published' | 'archived';
  deadline?: string;
  deadlinePolicy?: {
    initialDeadline: string;
    allowLateResubmissions: boolean;
  };
  fields: DynamicField[];
  stages: Array<{ stageIndex: number; label: string }>;
}

interface AttachmentItem {
  id: string;
  displayName: string;
  mime: string;
  bytes: number;
  sha256: string;
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

interface SubmissionDetail {
  id: string;
  workflowId: string;
  studentId: string;
  status: 'draft' | 'submitted' | 'in_review' | 'needs_changes' | 'approved' | 'rejected';
  answers: Record<string, string | number | boolean>;
  attachments?: AttachmentItem[];
  history?: DecisionRecord[];
  stageIndex: number;
  version: number;
  submittedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  workflow?: WorkflowData;
}

export default function SubmissionWorkspace() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | number | boolean>>({});
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingDraft, setDeletingDraft] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Attachment deletion modal state (EL-082, EL-083)
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [renameAttachmentId, setRenameAttachmentId] = useState<string | null>(null);
  const [newDisplayName, setNewDisplayName] = useState('');

  // Timeline & Requirements Dialogs (EL-079, EL-080)
  const [showTimeline, setShowTimeline] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);

  const answersRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadSubmission = useCallback(async () => {
    if (!submissionId) return;
    try {
      setLoading(true);
      setErrorMsg(null);

      const subData = await api<SubmissionDetail>(`/api/submissions/${submissionId}`);
      setSubmission(subData);
      setAnswers(subData.answers || {});
      setAttachments(subData.attachments || []);

      // If workflow details not embedded, load workflow
      if (subData.workflow) {
        setWorkflow(subData.workflow);
      } else if (subData.workflowId) {
        const wfData = await api<WorkflowData>(`/api/workflows/${subData.workflowId}`);
        setWorkflow(wfData);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load submission workspace');
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    loadSubmission();
  }, [loadSubmission]);

  // EL-070 Save my changes
  const handleSaveAnswers = async () => {
    if (!submissionId) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const saved = await api<SubmissionDetail>(`/api/submissions/${submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ answers, expectedVersion: submission?.version }),
      });
      setSubmission(saved);
      showToast('Changes saved to submission draft');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // EL-071 Upload supporting document
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !submissionId) return;

    if (attachments.length >= 3) {
      setErrorMsg('Maximum 3 supporting attachments allowed per submission');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('File exceeds maximum size limit of 5 MiB');
      return;
    }

    setUploading(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const result = await api<AttachmentItem>(
        `/api/submissions/${submissionId}/attachments`,
        {
          method: 'POST',
          body: formData,
        }
      );

      setAttachments([...attachments, result]);
      const fileField = workflow?.fields.find(field => field.type === 'file' && !answers[field.key]);
      if (fileField) setAnswers(current => ({ ...current, [fileField.key]: result.id }));
      showToast('Supporting document attached and verified');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Attachment upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // EL-072 Download own attachment
  const handleDownloadAttachment = async (attId: string, name: string) => {
    try {
      const res = await fetch(`/api/attachments/${attId}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to download attachment');
    }
  };

  // EL-073 Rename attachment
  const handleRenameConfirm = async () => {
    if (!renameAttachmentId || !newDisplayName.trim()) return;
    try {
      await api(`/api/attachments/${renameAttachmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ displayName: newDisplayName.trim() }),
      });
      setAttachments(
        attachments.map((a) =>
          a.id === renameAttachmentId ? { ...a, displayName: newDisplayName.trim() } : a
        )
      );
      setRenameAttachmentId(null);
      setNewDisplayName('');
      showToast('Attachment renamed');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  // EL-074 Remove draft attachment (after EL-082 confirmation)
  const handleRemoveAttachmentConfirm = async () => {
    if (!deletingAttachmentId) return;
    try {
      await api(`/api/attachments/${deletingAttachmentId}`, {
        method: 'DELETE',
      });
      setAttachments(attachments.filter((a) => a.id !== deletingAttachmentId));
      setAnswers(current => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, value === deletingAttachmentId ? '' : value])));
      setDeletingAttachmentId(null);
      showToast('Attachment removed from draft');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to remove attachment');
    }
  };

  // EL-077 Delete unused draft
  const handleDeleteDraft = async () => {
    if (!submissionId) return;
    if (!window.confirm('Are you sure you want to delete this draft application? This cannot be undone.')) {
      return;
    }
    setDeletingDraft(true);
    setErrorMsg(null);
    try {
      await api(`/api/submissions/${submissionId}`, { method: 'DELETE' });
      showToast('Draft submission deleted');
      navigate('/student');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete draft');
      setDeletingDraft(false);
    }
  };

  // EL-084 & EL-085 Submit / Resubmit application
  const handleSubmitApplication = async () => {
    if (!submissionId) return;

    // Validate required fields
    if (workflow?.fields) {
      for (const field of workflow.fields) {
        if (field.required) {
          const val = answers[field.key];
          if (val === undefined || val === null || String(val).trim() === '') {
            setErrorMsg(`Please complete required field: ${field.label}`);
            return;
          }
        }
      }
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      // First save latest answers
      const saved = await api<SubmissionDetail>(`/api/submissions/${submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ answers, expectedVersion: submission?.version }),
      });
      setSubmission(saved);

      // Submit application
      const updated = await api<SubmissionDetail>(`/api/submissions/${submissionId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: saved.version }),
      });

      setSubmission(updated);
      showToast('Application successfully submitted for faculty evaluation');
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 422) {
        setErrorMsg(`Validation error: ${err.message}`);
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Submission failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // EL-078 Edit after correction
  const handleEditAfterCorrection = () => {
    if (answersRef.current) {
      answersRef.current.scrollIntoView({ behavior: 'smooth' });
      const firstInput = answersRef.current.querySelector<HTMLElement>('input, textarea, select');
      if (firstInput) firstInput.focus();
    }
    showToast('Editing answers. Correct the flagged items and resubmit.');
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 0' }}>
        <LoadingSkeleton label="Loading submission workspace and draft state..." lines={7} />
      </div>
    );
  }

  if (!submission) {
    return (
      <ErrorMessage
        title="Submission Workspace Unavailable"
        message="This application could not be loaded or you are not authorized to view it."
        code="NOT_FOUND"
        onRetry={loadSubmission}
      />
    );
  }

  const isDraft = submission.status === 'draft';
  const isNeedsChanges = submission.status === 'needs_changes';
  const isEditable = isDraft || isNeedsChanges;
  const isApproved = submission.status === 'approved';
  const isRejected = submission.status === 'rejected';

  const lastDecision =
    submission.history && submission.history.length > 0
      ? submission.history[submission.history.length - 1]
      : null;

  return (
    <div className="submission-workspace-page" data-testid="page-p-011" style={{ maxWidth: '960px', margin: '0 auto' }}>
      {/* EL-076 Return link */}
      <div style={{ marginBottom: '16px' }}>
        <Link to="/student" data-testid="EL-076" className="btn btn-secondary btn-sm">
          Return to My Processes
        </Link>
      </div>

      {toastMessage && (
        <div className="alert alert-success" role="status" aria-live="polite" style={{ marginBottom: '20px' }}>
          <span>✓ {toastMessage}</span>
        </div>
      )}

      {errorMsg && (
        <ErrorMessage
          title="Submission Notice"
          message={errorMsg}
          code="SUBMISSION_NOTICE"
          onRetry={() => setErrorMsg(null)}
          className="mb-4"
        />
      )}

      {/* Header and Status */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span className="badge badge-submitted">Application Workspace</span>
              <StatusBadge status={submission.status} />
              <span style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
                Ref: {submission.id.slice(0, 8)}...
              </span>
            </div>
            <h1>{workflow?.title || 'Application Submission'}</h1>
            <p className="card-subtitle" style={{ maxWidth: '640px', marginTop: '4px' }}>
              {workflow?.description || 'Complete the required submission information and attach supporting credentials.'}
            </p>
          </div>

          {/* Action Tools */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              data-testid="EL-081"
              className="btn btn-secondary btn-sm"
              onClick={loadSubmission}
            >
              ↻ Refresh Status
            </button>
            <button
              type="button"
              data-testid="EL-080"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowRequirements(true)}
            >
              Requirements
            </button>
            <button
              type="button"
              data-testid="EL-075"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowTimeline(true)}
            >
              Review Timeline
            </button>
            {isDraft && (
              <button
                type="button"
                data-testid="EL-077"
                className="btn btn-danger btn-sm"
                onClick={handleDeleteDraft}
                disabled={deletingDraft}
              >
                {deletingDraft ? 'Deleting...' : 'Delete Draft'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Needs Changes Banner & Focus (EL-078) */}
      {isNeedsChanges && lastDecision && (
        <div
          className="alert alert-warning"
          style={{
            marginBottom: '24px',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '8px',
            border: '2px solid var(--warning-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
            <span style={{ fontWeight: 800, fontSize: '15px' }}>
              ⚠️ CORRECTION REQUESTED BY REVIEWER
            </span>
            <span className="badge badge-needs_changes">Stage {lastDecision.stageIndex}</span>
          </div>
          <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5 }}>
            <strong>Feedback:</strong> {lastDecision.reason}
          </p>
          <div style={{ marginTop: '4px' }}>
            <button
              type="button"
              data-testid="EL-078"
              className="btn btn-primary btn-sm"
              onClick={handleEditAfterCorrection}
            >
              ✏ Edit After Correction
            </button>
          </div>
        </div>
      )}

      {/* Outcome Banners */}
      {isApproved && (
        <div className="alert alert-success" style={{ marginBottom: '24px' }}>
          <div>
            <strong>✓ Institutional Sanction Granted:</strong> Your application has completed all review stages and is formally approved.
          </div>
        </div>
      )}

      {isRejected && (
        <div className="alert alert-error" style={{ marginBottom: '24px' }}>
          <div>
            <strong>✕ Application Rejected:</strong> Your submission was reviewed and rejected. Please contact your department coordinator.
          </div>
        </div>
      )}

      {/* Dynamic Form Answers (EL-069) */}
      <div className="card" ref={answersRef} style={{ marginBottom: '24px' }}>
        <div className="card-header" style={{ marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '18px' }}>Submission Answers</h2>
            <p className="card-subtitle">
              {isEditable ? 'Fill out all required fields before submitting.' : 'Submitted application snapshot.'}
            </p>
          </div>
          {isEditable && (
            <button
              type="button"
              data-testid="EL-070"
              className="btn btn-secondary btn-sm"
              onClick={handleSaveAnswers}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Draft Answers'}
            </button>
          )}
        </div>

        {/* EL-069 Field Group */}
        <div data-testid="EL-069" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {workflow?.fields && workflow.fields.length > 0 ? (
            workflow.fields.map((field) => {
              const val = answers[field.key] !== undefined ? String(answers[field.key]) : '';
              return (
                <div key={field.key} className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor={field.type === 'file' ? 'attachment-file-upload' : `input-${field.key}`} className="form-label">
                    {field.label} {field.required && <span style={{ color: 'var(--danger)' }}>*</span>}
                  </label>

                  {field.type === 'file' ? (
                    <p className="form-hint">Attach a supporting document below. {val ? 'A document is linked to this field.' : 'No document linked yet.'}</p>
                  ) : field.type === 'select' && field.options ? (
                    <select
                      id={`input-${field.key}`}
                      className="form-select"
                      value={val}
                      onChange={(e) => setAnswers({ ...answers, [field.key]: e.target.value })}
                      disabled={!isEditable}
                    >
                      <option value="">-- Select an option --</option>
                      {field.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`input-${field.key}`}
                      type={field.type === 'date' ? 'date' : 'text'}
                      className="form-input"
                      value={val}
                      onChange={(e) => setAnswers({ ...answers, [field.key]: e.target.value })}
                      placeholder={field.placeholder || ''}
                      disabled={!isEditable}
                    />
                  )}
                </div>
              );
            })
          ) : (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="input-general-notes" className="form-label">
                Application Statement
              </label>
              <textarea
                id="input-general-notes"
                className="form-textarea"
                value={String(answers['statement'] || '')}
                onChange={(e) => setAnswers({ ...answers, statement: e.target.value })}
                disabled={!isEditable}
                rows={4}
                placeholder="Enter internship project details..."
              />
            </div>
          )}
        </div>
      </div>

      {/* Supporting Document Attachments (EL-071, EL-072, EL-073, EL-074) */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header" style={{ marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '18px' }}>Supporting Attachments ({attachments.length}/3)</h2>
            <p className="card-subtitle">
              Upload PDF, PNG, or JPEG documents (≤ 5 MiB). Files are verified with magic byte sniffing.
            </p>
          </div>
        </div>

        {/* Upload Input (EL-071) */}
        {isEditable && attachments.length < 3 && (
          <div
            style={{
              padding: '16px 20px',
              borderRadius: 'var(--radius-md)',
              border: '2px dashed var(--border-medium)',
              backgroundColor: 'var(--bg-subtle)',
              marginBottom: '16px',
            }}
          >
            <label htmlFor="attachment-file-upload" className="form-label" style={{ display: 'block', marginBottom: '6px' }}>
              Attach Supporting Credential (PDF, PNG, JPEG ≤ 5 MiB)
            </label>
            <input
              id="attachment-file-upload"
              data-testid="EL-071"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              onChange={handleFileUpload}
              disabled={uploading}
              style={{ fontSize: '14px' }}
            />
            {uploading && <span style={{ marginLeft: '12px', fontSize: '13px', color: 'var(--primary)' }}>Uploading & sniffing...</span>}
          </div>
        )}

        {attachments.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--ink-muted)', margin: 0 }}>
            No attachments uploaded yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {attachments.map((att) => (
              <div
                key={att.id}
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: 'var(--bg-card)',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{att.displayName}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                    {(att.bytes / 1024).toFixed(1)} KiB • {att.mime} • Hash: {att.sha256?.slice(0, 10)}...
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* EL-072 Download */}
                  <button
                    type="button"
                    data-testid="EL-072"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleDownloadAttachment(att.id, att.displayName)}
                    style={{ minHeight: '32px', padding: '0 10px' }}
                  >
                    ⬇ Download
                  </button>

                  {/* EL-073 Rename (if editable) */}
                  {isEditable && (
                    <button
                      type="button"
                      data-testid="EL-073"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setRenameAttachmentId(att.id);
                        setNewDisplayName(att.displayName);
                      }}
                      style={{ minHeight: '32px', padding: '0 10px' }}
                    >
                      Rename
                    </button>
                  )}

                  {/* EL-074 Remove draft attachment (opens confirmation) */}
                  {isEditable && (
                    <button
                      type="button"
                      data-testid="EL-074"
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeletingAttachmentId(att.id)}
                      style={{ minHeight: '32px', padding: '0 10px' }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit / Resubmit Bar (EL-084, EL-085) */}
      {isEditable && (
        <div
          className="card"
          style={{
            padding: '20px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: isNeedsChanges ? 'var(--warning-bg)' : 'var(--bg-card)',
            border: isNeedsChanges ? '1px solid var(--warning-border)' : '1px solid var(--border-light)',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px' }}>
              {isNeedsChanges ? 'Resubmit Corrected Application' : 'Finalize & Submit Application'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ink-secondary)', marginTop: '2px' }}>
              {isNeedsChanges
                ? 'Your submission will return to Stage 0 for mentor re-evaluation.'
                : 'Submissions advance sequentially through faculty mentor and dean review.'}
            </div>
          </div>

          <div>
            {isDraft ? (
              <button
                type="button"
                data-testid="EL-084"
                className="btn btn-primary"
                onClick={handleSubmitApplication}
                disabled={submitting}
                style={{ minHeight: '48px', padding: '0 24px', fontSize: '15px' }}
              >
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            ) : (
              <button
                type="button"
                data-testid="EL-085"
                className="btn btn-primary"
                onClick={handleSubmitApplication}
                disabled={submitting}
                style={{ minHeight: '48px', padding: '0 24px', fontSize: '15px' }}
              >
                {submitting ? 'Resubmitting...' : 'Resubmit Application'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Delete Attachment Confirmation Modal (EL-082, EL-083) */}
      <Dialog
        isOpen={Boolean(deletingAttachmentId)}
        onClose={() => setDeletingAttachmentId(null)}
        title="Confirm Document Removal"
        description="Are you sure you want to delete this attached credential?"
      >
        <p style={{ fontSize: '14px', color: 'var(--ink-secondary)', marginBottom: '16px' }}>
          This will permanently remove the file from your submission draft.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            data-testid="EL-083"
            className="btn btn-secondary btn-sm"
            onClick={() => setDeletingAttachmentId(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="EL-082"
            className="btn btn-danger btn-sm"
            onClick={handleRemoveAttachmentConfirm}
          >
            Confirm Removal
          </button>
        </div>
      </Dialog>

      {/* Rename Attachment Modal */}
      <Dialog
        isOpen={Boolean(renameAttachmentId)}
        onClose={() => setRenameAttachmentId(null)}
        title="Rename Attachment"
        description="Enter a new display name for this file"
      >
        <div className="form-group" style={{ marginBottom: '16px' }}>
          <label htmlFor="rename-attachment-input" className="form-label">
            Display Name
          </label>
          <input
            id="rename-attachment-input"
            type="text"
            className="form-input"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setRenameAttachmentId(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleRenameConfirm}
            disabled={!newDisplayName.trim()}
          >
            Save Name
          </button>
        </div>
      </Dialog>

      {/* Timeline Modal (EL-079) */}
      <Dialog
        isOpen={showTimeline}
        onClose={() => setShowTimeline(false)}
        title="Decision & Review Timeline"
        description="Full sequential governance history for this submission"
        maxWidth="640px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {submission.history && submission.history.length > 0 ? (
            submission.history.map((d, i) => (
              <div
                key={i}
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-subtle)',
                  border: '1px solid var(--border-light)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>
                    Stage {d.stageIndex}: {d.action.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                    {new Date(d.decidedAt).toLocaleString()}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink-secondary)' }}>
                  <strong>Reviewer Feedback:</strong> {d.reason}
                </p>
              </div>
            ))
          ) : (
            <p style={{ fontSize: '14px', color: 'var(--ink-muted)' }}>
              No review decisions recorded yet. Once submitted, your faculty mentor will evaluate this application.
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              type="button"
              data-testid="EL-079"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowTimeline(false)}
            >
              Close Timeline
            </button>
          </div>
        </div>
      </Dialog>

      {/* Published Requirements Modal (EL-080) */}
      <Dialog
        isOpen={showRequirements}
        onClose={() => setShowRequirements(false)}
        title="Published Requirements & Guidelines"
        description="Official rules for this workflow"
      >
        <div style={{ fontSize: '14px', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <strong>Application Deadline:</strong>{' '}
            {workflow?.deadline || workflow?.deadlinePolicy?.initialDeadline
              ? new Date(workflow.deadline || workflow.deadlinePolicy!.initialDeadline).toLocaleString()
              : 'Unspecified'}
          </div>
          <div>
            <strong>Late Resubmission Policy:</strong>{' '}
            {workflow?.deadlinePolicy?.allowLateResubmissions
              ? 'Permitted past initial deadline for revisions requested by mentor.'
              : 'Strict deadlines.'}
          </div>
          <div>
            <strong>Attachment Bounds:</strong> Maximum 3 attachments, 5 MiB each. PDF, PNG, and JPEG supported.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowRequirements(false)}
            >
              Close
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
