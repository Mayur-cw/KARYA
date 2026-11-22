import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorMessage } from '../components/ErrorMessage';
import { EmptyState } from '../components/EmptyState';
import { api } from '../api';

interface WorkflowItem {
  id: string;
  departmentId: string;
  title: string;
  description: string;
  status: 'draft' | 'published' | 'archived';
  deadlinePolicy: {
    initialDeadline: string;
    allowLateResubmissions: boolean;
  };
  stages: Array<{ stageIndex: number; title: string; assignedReviewerId: string }>;
  createdAt: string;
  updatedAt: string;
}

const PAGE_SIZE = 5;

export default function WorkflowRegistry() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Read URL search params
  const searchQuery = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || 'all';
  const sortBy = searchParams.get('sort') || 'createdAt_desc';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErrorMsg(null);
    api<WorkflowItem[]>('/api/workflows')
      .then((data) => {
        if (mounted) setWorkflows(data || []);
      })
      .catch((err: unknown) => {
        if (mounted) setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch workflows');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    if (key !== 'page') {
      params.set('page', '1');
    }
    setSearchParams(params);
  };

  // Filter & Sort
  const filteredWorkflows = useMemo(() => {
    let result = [...workflows];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (w) =>
          w.title.toLowerCase().includes(q) ||
          w.description?.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((w) => w.status === statusFilter);
    }

    result.sort((a, b) => {
      if (sortBy === 'createdAt_asc') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'title_asc') {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'deadline_asc') {
        const da = a.deadlinePolicy?.initialDeadline ? new Date(a.deadlinePolicy.initialDeadline).getTime() : 0;
        const db = b.deadlinePolicy?.initialDeadline ? new Date(b.deadlinePolicy.initialDeadline).getTime() : 0;
        return da - db;
      }
      // default: createdAt_desc
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [workflows, searchQuery, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredWorkflows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const pagedWorkflows = filteredWorkflows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const hasNextPage = safePage < totalPages;
  const hasPrevPage = safePage > 1;

  return (
    <div className="workflow-registry-page" data-testid="page-p-004">
      {/* Top Breadcrumb / Return */}
      <div style={{ marginBottom: '16px' }}>
        <Link to="/admin" data-testid="EL-023" className="btn btn-secondary btn-sm">
          ← Back to Command Center
        </Link>
      </div>

      <div className="card-header" style={{ marginBottom: '24px' }}>
        <div>
          <span className="badge badge-published" style={{ marginBottom: '8px' }}>
            Process Registry
          </span>
          <h1>Workflow Registry</h1>
          <p className="card-subtitle">
            Search, inspect, and track all institutional workflow circulars and approval pipelines.
          </p>
        </div>
        <button
          type="button"
          data-testid="EL-022"
          className="btn btn-primary"
          onClick={() => navigate('/admin/studio')}
        >
          + Create Workflow
        </button>
      </div>

      {errorMsg && (
        <ErrorMessage
          title="Registry Error"
          message={errorMsg}
          code="REGISTRY_LOAD_FAILED"
          onRetry={() => window.location.reload()}
          className="mb-4"
        />
      )}

      {/* Filter Bar (EL-016, EL-017, EL-018) */}
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
        {/* EL-016 Search Title */}
        <div style={{ flex: '1 1 240px', minWidth: '200px' }}>
          <label htmlFor="search-workflow-input" className="form-label" style={{ fontSize: '13px' }}>
            Search Title
          </label>
          <input
            id="search-workflow-input"
            data-testid="EL-016"
            type="search"
            className="form-input"
            placeholder="Search circular title..."
            value={searchQuery}
            onChange={(e) => updateParam('q', e.target.value)}
            style={{ height: '40px', minHeight: '40px' }}
          />
        </div>

        {/* EL-017 Status Filter */}
        <div style={{ flex: '0 1 180px', minWidth: '150px' }}>
          <label htmlFor="filter-workflow-status" className="form-label" style={{ fontSize: '13px' }}>
            Status
          </label>
          <select
            id="filter-workflow-status"
            data-testid="EL-017"
            className="form-select"
            value={statusFilter}
            onChange={(e) => updateParam('status', e.target.value)}
            style={{ height: '40px', minHeight: '40px' }}
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* EL-018 Sort By */}
        <div style={{ flex: '0 1 200px', minWidth: '160px' }}>
          <label htmlFor="sort-workflow-select" className="form-label" style={{ fontSize: '13px' }}>
            Sort Order
          </label>
          <select
            id="sort-workflow-select"
            data-testid="EL-018"
            className="form-select"
            value={sortBy}
            onChange={(e) => updateParam('sort', e.target.value)}
            style={{ height: '40px', minHeight: '40px' }}
          >
            <option value="createdAt_desc">Newest First</option>
            <option value="createdAt_asc">Oldest First</option>
            <option value="title_asc">Title (A–Z)</option>
            <option value="deadline_asc">Upcoming Deadline</option>
          </select>
        </div>
      </div>

      {/* Main Workflow Table */}
      {loading ? (
        <LoadingSkeleton label="Loading registered workflows..." lines={6} />
      ) : filteredWorkflows.length === 0 ? (
        <EmptyState
          title="No matching workflows found"
          description={
            searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your search criteria or resetting the status filter.'
              : 'No workflows exist in this departmental scope. Create one to begin.'
          }
          actionLabel={searchQuery || statusFilter !== 'all' ? 'Clear Filters' : 'Create Workflow'}
          onAction={() => {
            if (searchQuery || statusFilter !== 'all') {
              setSearchParams(new URLSearchParams());
            } else {
              navigate('/admin/studio');
            }
          }}
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Workflow Registry Table">
              <thead>
                <tr>
                  <th scope="col">Workflow Title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Initial Deadline</th>
                  <th scope="col">Stages</th>
                  <th scope="col">Late Resubmissions</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedWorkflows.map((wf) => (
                  <tr key={wf.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--ink-primary)' }}>{wf.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                        ID: {wf.id.substring(0, 8)}... • Created {new Date(wf.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={wf.status} />
                    </td>
                    <td>
                      {wf.deadlinePolicy?.initialDeadline
                        ? new Date(wf.deadlinePolicy.initialDeadline).toLocaleDateString()
                        : 'Not specified'}
                    </td>
                    <td>
                      <span className="badge badge-draft">{wf.stages?.length || 0} stages</span>
                    </td>
                    <td>
                      {wf.deadlinePolicy?.allowLateResubmissions ? (
                        <span style={{ color: 'var(--success)', fontSize: '13px', fontWeight: 600 }}>Allowed</span>
                      ) : (
                        <span style={{ color: 'var(--ink-muted)', fontSize: '13px' }}>Blocked</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        to={`/admin/workflows/${wf.id}`}
                        data-testid="EL-021"
                        className="btn btn-secondary btn-sm"
                        aria-label={`Open ${wf.title}`}
                      >
                        Inspect →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls (EL-019, EL-020) */}
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
              {Math.min(safePage * PAGE_SIZE, filteredWorkflows.length)} of {filteredWorkflows.length} workflows
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                data-testid="EL-020"
                className="btn btn-secondary btn-sm"
                onClick={() => updateParam('page', String(safePage - 1))}
                disabled={!hasPrevPage}
                aria-label="Previous workflow results"
              >
                ← Previous
              </button>

              <span style={{ fontSize: '13px', fontWeight: 600, padding: '0 8px' }}>
                Page {safePage} of {totalPages}
              </span>

              <button
                type="button"
                data-testid="EL-019"
                className="btn btn-secondary btn-sm"
                onClick={() => updateParam('page', String(safePage + 1))}
                disabled={!hasNextPage}
                aria-label="Next workflow results"
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
