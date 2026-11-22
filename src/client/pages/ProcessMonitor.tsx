import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorMessage } from '../components/ErrorMessage';
import { EmptyState } from '../components/EmptyState';
import { Dialog } from '../components/Dialog';
import { api } from '../api';
import { fetchCollection } from '../collections';
import type { AssignmentPublic, SubmissionPublic, WorkflowAnalytics } from '../../shared/contracts';

interface ParticipantRecord {
  assignmentId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  assignedAt: string;
  submissionId: string | null;
  submissionStatus: 'unstarted' | 'draft' | 'submitted' | 'in_review' | 'needs_changes' | 'approved' | 'rejected';
  submittedAt?: string | null;
  currentStageIndex?: number;
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

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function ProcessMonitor() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();

  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [metrics, setMetrics] = useState<WorkflowMetrics | null>(null);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [workflowTitle, setWorkflowTitle] = useState('Workflow Process');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Search & Filter state (EL-051, EL-053)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Add Recipient Dialog (EL-057)
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedNewStudentId, setSelectedNewStudentId] = useState('');
  const [adding, setAdding] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadMonitorData = useCallback(async () => {
    if (!workflowId) return;
    try {
      setErrorMsg(null);

      const [wf, assignments, analytics, users, submissions] = await Promise.all([
        api<{ title: string }>(`/api/workflows/${workflowId}`),
        fetchCollection<AssignmentPublic>(`/api/assignments?workflowId=${workflowId}`),
        api<WorkflowAnalytics>(`/api/workflows/${workflowId}/analytics`),
        fetchCollection<UserOption>('/api/users'),
        fetchCollection<SubmissionPublic>(`/api/submissions?workflowId=${workflowId}`),
      ]);
      setWorkflowTitle(wf.title);
      setParticipants(assignments.filter(assignment => assignment.status !== 'revoked').map(assignment => {
        const submission = submissions.find(item => item.studentId === assignment.studentId);
        return { assignmentId: assignment.id, studentId: assignment.studentId, studentName: assignment.studentName || 'Student', studentEmail: assignment.studentEmail || '', assignedAt: assignment.assignedAt, submissionId: submission?.id || null, submissionStatus: submission?.status || 'unstarted', currentStageIndex: submission?.stageIndex };
      }));
      setMetrics({ ...analytics, totalSubmissions: submissions.length, stage0Pending: analytics.stageBreakdown.find(stage => stage.stageIndex === 0)?.pendingCount || 0, stage1Pending: analytics.stageBreakdown.find(stage => stage.stageIndex === 1)?.pendingCount || 0 });
      setAllUsers(users);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load process telemetry');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workflowId]);

  useEffect(() => {
    loadMonitorData();
  }, [loadMonitorData]);

  // EL-054 Refresh analytics
  const handleRefreshAnalytics = async () => {
    setRefreshing(true);
    await loadMonitorData();
    showToast('Telemetry refreshed from live records');
  };

  // EL-056 Export process CSV
  const handleExportCsv = async () => {
    if (!workflowId) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/report.csv`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('CSV download request failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `process_monitor_${workflowId.slice(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast('Process monitor report downloaded');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'CSV export failed');
    } finally {
      setDownloading(false);
    }
  };

  // EL-052 Revoke unstarted assignment
  const handleRevokeAssignment = async (studentId: string, studentName: string) => {
    if (!workflowId) return;
    if (!window.confirm(`Revoke workflow assignment for ${studentName}?`)) return;

    try {
      await api(`/api/assignments/${participants.find(participant => participant.studentId === studentId)?.assignmentId}`, {
        method: 'DELETE',
      });
      showToast(`Assignment revoked for ${studentName}`);
      await loadMonitorData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to revoke assignment (already started)');
    }
  };

  // EL-057 Add eligible recipient
  const handleAddRecipient = async () => {
    if (!workflowId || !selectedNewStudentId) return;
    setAdding(true);
    setErrorMsg(null);
    try {
      await api(`/api/workflows/${workflowId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({ studentIds: [selectedNewStudentId] }),
      });
      showToast('Student recipient added successfully');
      setAddModalOpen(false);
      setSelectedNewStudentId('');
      await loadMonitorData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to assign recipient');
    } finally {
      setAdding(false);
    }
  };

  // Filtered participants list
  const filteredParticipants = useMemo(() => {
    return participants.filter((p) => {
      const matchesQ =
        !searchQuery ||
        p.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.studentEmail.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' || p.submissionStatus === statusFilter;

      return matchesQ && matchesStatus;
    });
  }, [participants, searchQuery, statusFilter]);

  // Available students not yet assigned
  const assignedIds = new Set(participants.map((p) => p.studentId));
  const unassignedStudents = allUsers.filter(
    (u) => u.role === 'student' && !assignedIds.has(u.id)
  );

  return (
    <div className="process-monitor-page" data-testid="page-p-008" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* EL-058 Back link */}
      <div style={{ marginBottom: '16px' }}>
        <Link
          to={`/admin/workflows/${workflowId}`}
          data-testid="EL-058"
          className="btn btn-secondary btn-sm"
        >
          Back to Process Overview
        </Link>
      </div>

      {/* Header */}
      <div
        className="card-header"
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
            <span className="badge badge-published">Live Process Telemetry</span>
          </div>
          <h1>Process Monitor: {workflowTitle}</h1>
          <p className="card-subtitle">
            Cohort submission statuses, review stages, and assignment revocations.
          </p>
        </div>

        {/* Global Monitor Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="EL-057"
            className="btn btn-primary btn-sm"
            onClick={() => setAddModalOpen(true)}
          >
            + Add Recipient
          </button>
          <button
            type="button"
            data-testid="EL-054"
            className="btn btn-secondary btn-sm"
            onClick={handleRefreshAnalytics}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : '↻ Refresh Analytics'}
          </button>
          <button
            type="button"
            data-testid="EL-056"
            className="btn btn-secondary btn-sm"
            onClick={handleExportCsv}
            disabled={downloading}
          >
            {downloading ? 'Exporting...' : '📥 Export CSV'}
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
          title="Monitor Error"
          message={errorMsg}
          code="MONITOR_ACTION_FAILED"
          onRetry={() => setErrorMsg(null)}
          className="mb-4"
        />
      )}

      {/* Derived Metric Counters */}
      <section style={{ marginBottom: '28px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
            gap: '14px',
          }}
        >
          <div className="card" style={{ padding: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--ink-muted)', fontWeight: 600 }}>COHORT POOL</span>
            <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '2px' }}>
              {metrics ? metrics.totalAssigned : participants.length}
            </div>
          </div>

          <div className="card" style={{ padding: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>SUBMISSIONS</span>
            <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--primary)', marginTop: '2px' }}>
              {metrics ? metrics.totalSubmissions : '-'}
            </div>
          </div>

          <div className="card" style={{ padding: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--warning)', fontWeight: 600 }}>STAGE 0 (MENTOR)</span>
            <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--warning)', marginTop: '2px' }}>
              {metrics ? metrics.stage0Pending : '-'}
            </div>
          </div>

          <div className="card" style={{ padding: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--warning)', fontWeight: 600 }}>STAGE 1 (FINAL)</span>
            <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--warning)', marginTop: '2px' }}>
              {metrics ? metrics.stage1Pending : '-'}
            </div>
          </div>

          <div className="card" style={{ padding: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 600 }}>APPROVED</span>
            <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--success)', marginTop: '2px' }}>
              {metrics ? metrics.approved : '-'}
            </div>
          </div>
        </div>
      </section>

      {/* Filter and Search Bar (EL-051, EL-053) */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'center',
          backgroundColor: 'var(--bg-subtle)',
        }}
      >
        <div style={{ flex: '1 1 260px' }}>
          <label htmlFor="search-participants-input" className="form-label" style={{ fontSize: '13px' }}>
            Search Participants
          </label>
          <input
            id="search-participants-input"
            data-testid="EL-051"
            type="search"
            className="form-input"
            placeholder="Search by student name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ height: '40px', minHeight: '40px' }}
          />
        </div>

        <div style={{ flex: '0 1 200px' }}>
          <label htmlFor="filter-completion-status" className="form-label" style={{ fontSize: '13px' }}>
            Completion Status
          </label>
          <select
            id="filter-completion-status"
            data-testid="EL-053"
            className="form-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ height: '40px', minHeight: '40px' }}
          >
            <option value="all">All Cohort Statuses</option>
            <option value="unstarted">Unstarted</option>
            <option value="draft">Draft Saved</option>
            <option value="submitted">Submitted</option>
            <option value="in_review">In Review</option>
            <option value="needs_changes">Needs Changes</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Participant Submissions Table */}
      {loading ? (
        <LoadingSkeleton label="Loading participant telemetry..." lines={6} />
      ) : filteredParticipants.length === 0 ? (
        <EmptyState
          title="No participant records match"
          description={
            searchQuery || statusFilter !== 'all'
              ? 'Try clearing your search query or setting the status filter to all.'
              : 'No students have been assigned to this workflow yet.'
          }
          actionLabel={searchQuery || statusFilter !== 'all' ? 'Clear Filters' : 'Add First Recipient'}
          onAction={() => {
            if (searchQuery || statusFilter !== 'all') {
              setSearchQuery('');
              setStatusFilter('all');
            } else {
              setAddModalOpen(true);
            }
          }}
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Participant Submissions Table">
              <thead>
                <tr>
                  <th scope="col">Student Applicant</th>
                  <th scope="col">Status</th>
                  <th scope="col">Assigned Date</th>
                  <th scope="col">Submission Info</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredParticipants.map((p) => {
                  const isUnstarted = p.submissionStatus === 'unstarted';
                  return (
                    <tr key={p.studentId}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.studentName}</div>
                        <div style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>{p.studentEmail}</div>
                      </td>
                      <td>
                        <StatusBadge status={p.submissionStatus} />
                      </td>
                      <td style={{ fontSize: '13px' }}>
                        {p.assignedAt ? new Date(p.assignedAt).toLocaleDateString() : '-'}
                      </td>
                      <td>
                        {p.submissionId ? (
                          <div style={{ fontSize: '12px', color: 'var(--ink-secondary)' }}>
                            ID: {p.submissionId.slice(0, 8)}...
                            {p.submittedAt && ` • Submitted ${new Date(p.submittedAt).toLocaleDateString()}`}
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>Not yet initiated</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          {p.submissionId ? (
                            <button
                              type="button"
                              data-testid="EL-055"
                              className="btn btn-secondary btn-sm"
                              onClick={() => navigate(`/admin/submissions/${p.submissionId}`)}
                            >
                              Inspect
                            </button>
                          ) : (
                            <button
                              type="button"
                              data-testid="EL-052"
                              className="btn btn-danger btn-sm"
                              onClick={() => handleRevokeAssignment(p.studentId, p.studentName)}
                              disabled={!isUnstarted}
                              title={isUnstarted ? 'Revoke unstarted assignment' : 'Cannot revoke assignment once started'}
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Eligible Recipient Dialog (EL-057) */}
      <Dialog
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Recipient to Workflow Cohort"
        description="Select an unassigned student from the departmental roster"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {unassignedStudents.length === 0 ? (
            <p style={{ fontSize: '14px', color: 'var(--ink-muted)' }}>
              All eligible students in this department are already assigned to this workflow.
            </p>
          ) : (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="select-new-student" className="form-label">
                Select Student
              </label>
              <select
                id="select-new-student"
                className="form-select"
                value={selectedNewStudentId}
                onChange={(e) => setSelectedNewStudentId(e.target.value)}
              >
                <option value="">-- Choose Student --</option>
                {unassignedStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setAddModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleAddRecipient}
              disabled={!selectedNewStudentId || adding}
            >
              {adding ? 'Assigning...' : 'Confirm Assignment'}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
