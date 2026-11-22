import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorMessage } from '../components/ErrorMessage';
import { EmptyState } from '../components/EmptyState';
import { api } from '../api';

interface ReviewQueueItem {
  id: string;
  workflowId: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  workflowTitle?: string;
  status: 'draft' | 'submitted' | 'in_review' | 'needs_changes' | 'approved' | 'rejected';
  currentStageIndex: number;
  submittedAt?: string | null;
  createdAt: string;
}

const PAGE_SIZE = 5;

export default function ReviewerInbox() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [submissions, setSubmissions] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Search & Filter & Pagination state (EL-087, EL-088, EL-089, EL-090)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadReviewQueue = useCallback(async () => {
    try {
      setErrorMsg(null);
      const data = await api<{ items: ReviewQueueItem[] }>('/api/submissions');
      setSubmissions(data.items || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load assigned review queue');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReviewQueue();
  }, [loadReviewQueue]);

  // EL-094 Refresh assigned queue
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadReviewQueue();
    showToast('Review queue refreshed from live records');
  };

  // EL-093 Logout
  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // Filter & Search
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((sub) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQ =
        !q ||
        (sub.studentName && sub.studentName.toLowerCase().includes(q)) ||
        (sub.studentEmail && sub.studentEmail.toLowerCase().includes(q)) ||
        (sub.workflowTitle && sub.workflowTitle.toLowerCase().includes(q));

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'in_review'
          ? sub.status === 'in_review' || sub.status === 'submitted'
          : sub.status === statusFilter);

      return matchesQ && matchesStatus;
    });
  }, [submissions, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredSubmissions.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const pagedSubmissions = filteredSubmissions.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasNextPage = safePage < totalPages;
  const hasPrevPage = safePage > 1;

  // Telemetry counts
  const pendingCount = submissions.filter((s) => s.status === 'submitted' || s.status === 'in_review').length;
  const needsChangesCount = submissions.filter((s) => s.status === 'needs_changes').length;
  const resolvedCount = submissions.filter((s) => s.status === 'approved' || s.status === 'rejected').length;

  return (
    <div className="reviewer-inbox-page" data-testid="page-p-012" style={{ maxWidth: '1050px', margin: '0 auto' }}>
      {/* Top Header */}
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
            <span className="badge badge-in_review">Evaluator Desk</span>
            <span style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
              Reviewer: {user?.name || 'Faculty Evaluator'}
            </span>
          </div>
          <h1>Reviewer Inbox</h1>
          <p className="card-subtitle">
            Evaluate assigned student submissions, inspect uploaded credentials, and approve or request revisions.
          </p>
        </div>

        {/* Global Utilities (EL-091, EL-092, EL-093) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Link to="/notifications" data-testid="EL-091" className="btn btn-secondary btn-sm">
            Notifications
          </Link>
          <Link to="/account" data-testid="EL-092" className="btn btn-secondary btn-sm">
            My Account
          </Link>
          <button
            type="button"
            data-testid="EL-093"
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
          title="Reviewer Queue Notice"
          message={errorMsg}
          code="QUEUE_LOAD_FAILED"
          onRetry={handleRefresh}
          className="mb-4"
        />
      )}

      {/* Overview Metric Counters */}
      <section style={{ marginBottom: '24px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
          }}
        >
          <div className="card" style={{ padding: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}>PENDING EVALUATION</span>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--primary)', marginTop: '2px' }}>
              {loading ? '-' : pendingCount}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--ink-secondary)' }}>Awaiting your decision</span>
          </div>

          <div className="card" style={{ padding: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--warning)', fontWeight: 600 }}>CORRECTION LOOPS</span>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--warning)', marginTop: '2px' }}>
              {loading ? '-' : needsChangesCount}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--ink-secondary)' }}>Pending student resubmission</span>
          </div>

          <div className="card" style={{ padding: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 600 }}>DECISIONS RECORDED</span>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--success)', marginTop: '2px' }}>
              {loading ? '-' : resolvedCount}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--ink-secondary)' }}>Approved or resolved</span>
          </div>
        </div>
      </section>

      {/* Filter and Search Bar (EL-087, EL-088, EL-094) */}
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
          <label htmlFor="search-applicant-input" className="form-label" style={{ fontSize: '13px' }}>
            Search Assigned Applicant
          </label>
          <input
            id="search-applicant-input"
            data-testid="EL-088"
            type="search"
            className="form-input"
            placeholder="Search by student name, email or workflow..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            style={{ height: '40px', minHeight: '40px' }}
          />
        </div>

        <div style={{ flex: '0 1 200px' }}>
          <label htmlFor="filter-stage-status-select" className="form-label" style={{ fontSize: '13px' }}>
            Stage Status
          </label>
          <select
            id="filter-stage-status-select"
            data-testid="EL-087"
            className="form-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={{ height: '40px', minHeight: '40px' }}
          >
            <option value="all">All Submissions</option>
            <option value="in_review">Pending Review (Submitted / In Review)</option>
            <option value="needs_changes">Needs Changes</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div style={{ alignSelf: 'flex-end' }}>
          <button
            type="button"
            data-testid="EL-094"
            className="btn btn-secondary btn-sm"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ height: '40px' }}
          >
            {refreshing ? 'Refreshing...' : '↻ Refresh Queue'}
          </button>
        </div>
      </div>

      {/* Submissions Queue Table */}
      {loading ? (
        <LoadingSkeleton label="Loading review queue..." lines={6} />
      ) : filteredSubmissions.length === 0 ? (
        <EmptyState
          title="No submissions pending in your queue"
          description={
            searchQuery || statusFilter !== 'all'
              ? 'No assigned submissions match your filter criteria.'
              : 'You have no applications awaiting your review at this time.'
          }
          actionLabel={searchQuery || statusFilter !== 'all' ? 'Clear Filters' : undefined}
          onAction={() => {
            setSearchQuery('');
            setStatusFilter('all');
          }}
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Review Queue Table">
              <thead>
                <tr>
                  <th scope="col">Applicant</th>
                  <th scope="col">Workflow Title</th>
                  <th scope="col">Stage</th>
                  <th scope="col">Status</th>
                  <th scope="col">Submitted Date</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pagedSubmissions.map((sub) => (
                  <tr key={sub.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{sub.studentName || 'Student Applicant'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                        {sub.studentEmail || sub.studentId.slice(0, 8) + '...'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{sub.workflowTitle || 'Internship Application'}</div>
                    </td>
                    <td>
                      <span className="badge badge-draft">Stage {sub.currentStageIndex}</span>
                    </td>
                    <td>
                      <StatusBadge status={sub.status} />
                    </td>
                    <td style={{ fontSize: '13px' }}>
                      {sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString() : 'Draft'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        to={`/reviewer/submissions/${sub.id}`}
                        data-testid="EL-086"
                        className="btn btn-primary btn-sm"
                        aria-label={`Open review for ${sub.studentName || 'applicant'}`}
                      >
                        Evaluate →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls (EL-089, EL-090) */}
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-subtle)',
            }}
          >
            <div style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filteredSubmissions.length)} of {filteredSubmissions.length} applications
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                data-testid="EL-090"
                className="btn btn-secondary btn-sm"
                onClick={() => setCurrentPage(safePage - 1)}
                disabled={!hasPrevPage}
                aria-label="Previous review page"
              >
                ← Previous
              </button>

              <span style={{ fontSize: '13px', fontWeight: 600, padding: '0 8px' }}>
                Page {safePage} of {totalPages}
              </span>

              <button
                type="button"
                data-testid="EL-089"
                className="btn btn-secondary btn-sm"
                onClick={() => setCurrentPage(safePage + 1)}
                disabled={!hasNextPage}
                aria-label="Next review page"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
