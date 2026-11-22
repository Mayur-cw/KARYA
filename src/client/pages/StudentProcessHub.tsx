import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { MetricCards } from '../components/MetricCards';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorMessage } from '../components/ErrorMessage';
import { EmptyState } from '../components/EmptyState';
import { fetchCollection } from '../collections';

interface WorkflowItem {
  id: string;
  departmentId: string;
  title: string;
  description: string;
  status: 'published' | 'archived';
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
  status: 'draft' | 'submitted' | 'in_review' | 'needs_changes' | 'approved' | 'rejected';
  submittedAt?: string | null;
  currentStageIndex: number;
}

interface ProcessCardData {
  workflow: WorkflowItem;
  submission: SubmissionItem | null;
  derivedStatus: 'unstarted' | 'draft' | 'submitted' | 'in_review' | 'needs_changes' | 'approved' | 'rejected';
}

export default function StudentProcessHub() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [processes, setProcesses] = useState<ProcessCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
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
        fetchCollection<WorkflowItem>('/api/workflows'),
        fetchCollection<SubmissionItem>('/api/submissions'),
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
        const derivedStatus = sub ? sub.status : 'unstarted';
        return {
          workflow: wf,
          submission: sub,
          derivedStatus,
        };
      });

      setProcesses(merged);
      return true;
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load assigned processes');
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
    if (await loadStudentData()) showToast('Process hub refreshed');
  };

  // EL-064 Logout
  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // Filter processes (EL-061)
  const filteredProcesses = useMemo(() => {
    if (statusFilter === 'all') return processes;
    return processes.filter((p) => p.derivedStatus === statusFilter);
  }, [processes, statusFilter]);

  // Derived counts
  const totalAssigned = processes.length;
  const pendingActions = processes.filter(
    (p) => p.derivedStatus === 'unstarted' || p.derivedStatus === 'needs_changes' || p.derivedStatus === 'draft'
  ).length;
  const inReview = processes.filter((p) => p.derivedStatus === 'submitted' || p.derivedStatus === 'in_review').length;
  const approved = processes.filter((p) => p.derivedStatus === 'approved').length;

  return (
    <div className="student-process-hub" data-testid="page-p-009" >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className="badge badge-submitted">Student Workspace</span>
            <span style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
              Applicant: {user?.name || 'Student'}
            </span>
          </div>
          <h1>My process hub</h1>
          <p className="card-subtitle">
            Everything you need to apply, track progress, and take your next step.
          </p>
        </div>

        {/* Global Nav Links (EL-062, EL-063, EL-064) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Link to="/notifications" data-testid="EL-062" className="btn btn-secondary btn-sm">
            My Notifications
          </Link>
          <Link to="/account" data-testid="EL-063" className="btn btn-secondary btn-sm">
            My Account
          </Link>
          <button
            type="button"
            data-testid="EL-064"
            className="btn btn-secondary btn-sm"
            onClick={handleLogout}
          >
            Logout
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
          title="Process Hub Notice"
          message={errorMsg}
          code="HUB_LOAD_FAILED"
          onRetry={handleRefresh}
          className="mb-4"
        />
      )}

      <MetricCards loading={loading} error={!!errorMsg} items={[
        { title: 'Assigned processes', value: totalAssigned, description: 'Your departmental workflows', icon: 'layers' },
        { title: 'Action required', value: pendingActions, description: 'Applications to start or update', icon: 'clock' },
        { title: 'In faculty review', value: inReview, description: 'With your assigned reviewers', icon: 'inbox' },
        { title: 'Approved', value: approved, description: 'Completed successfully', icon: 'check', featured: true },
      ]} />

      {/* Filter and Refresh Strip (EL-061, EL-065) */}
      <div
        className="card"
        style={{
          padding: '14px 20px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: 'var(--bg-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label htmlFor="filter-my-process-status" className="form-label" style={{ fontSize: '13px', margin: 0 }}>
            Filter Status:
          </label>
          <select
            id="filter-my-process-status"
            data-testid="EL-061"
            className="form-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ height: '38px', minHeight: '38px', padding: '4px 10px', fontSize: '13px' }}
          >
            <option value="all">All Assigned Workflows</option>
            <option value="unstarted">Unstarted</option>
            <option value="draft">Draft Saved</option>
            <option value="submitted">Submitted</option>
            <option value="in_review">In Review</option>
            <option value="needs_changes">Needs Changes (Revision Required)</option>
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
          {refreshing ? 'Refreshing...' : '↻ Refresh Assigned Processes'}
        </button>
      </div>

      {/* Process Cards List */}
      {loading ? (
        <LoadingSkeleton label="Loading assigned workflows and submission records..." lines={5} />
      ) : filteredProcesses.length === 0 ? (
        <EmptyState
          title="No workflows found"
          description={
            statusFilter !== 'all'
              ? 'No assigned workflows match this filter. Try selecting "All Assigned Workflows".'
              : 'You have not been assigned to any active workflows yet. Check back once departmental circulars are published.'
          }
          actionLabel={statusFilter !== 'all' ? 'Reset Filter' : undefined}
          onAction={() => setStatusFilter('all')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredProcesses.map((p) => {
            const hasSubmission = Boolean(p.submission);
            const initialDeadline =
              p.workflow.deadline || p.workflow.deadlinePolicy?.initialDeadline;

            return (
              <div
                key={p.workflow.id}
                className="card"
                style={{
                  borderLeft:
                    p.derivedStatus === 'needs_changes'
                      ? '4px solid var(--warning)'
                      : p.derivedStatus === 'approved'
                      ? '4px solid var(--success)'
                      : '4px solid var(--primary)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '16px',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <StatusBadge status={p.derivedStatus} />
                      {p.derivedStatus === 'needs_changes' && (
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--warning)' }}>
                          ⚠️ ACTION REQUIRED: Reviewer requested corrections
                        </span>
                      )}
                    </div>

                    <h2 style={{ fontSize: '18px', marginBottom: '6px' }}>{p.workflow.title}</h2>
                    <p style={{ fontSize: '13px', color: 'var(--ink-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
                      {p.workflow.description || 'No description provided.'}
                    </p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12px', color: 'var(--ink-muted)' }}>
                      <span>
                        <strong>Initial Deadline:</strong>{' '}
                        {initialDeadline ? new Date(initialDeadline).toLocaleDateString() : 'Unspecified'}
                      </span>
                      {hasSubmission && (
                        <span>
                          <strong>Submission Ref:</strong> {p.submission?.id.slice(0, 8)}...
                        </span>
                      )}
                      <span>
                        <strong>Late Resubmissions:</strong>{' '}
                        {'Allowed when changes are requested'}
                      </span>
                    </div>
                  </div>

                  {/* Contextual Action: EL-059 for unstarted, EL-060 for existing submission */}
                  <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    {!hasSubmission ? (
                      <Link
                        to={`/student/workflows/${p.workflow.id}`}
                        data-testid="EL-059"
                        className="btn btn-primary"
                      >
                        Start Application
                      </Link>
                    ) : (
                      <Link
                        to={`/student/submissions/${p.submission?.id}`}
                        data-testid="EL-060"
                        className={`btn ${p.derivedStatus === 'needs_changes' ? 'btn-primary' : 'btn-secondary'}`}
                      >
                        {p.derivedStatus === 'needs_changes' ? 'Fix & Resubmit' : 'View Submission Workspace'}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
