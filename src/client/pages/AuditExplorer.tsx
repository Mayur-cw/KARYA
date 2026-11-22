import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorMessage } from '../components/ErrorMessage';
import { EmptyState } from '../components/EmptyState';
import { api } from '../api';

interface AuditLogItem {
  id: string;
  departmentId: string;
  workflowId: string | null;
  actorId: string;
  actorRole: string;
  event: string;
  targetEntity: string;
  targetId: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

interface AuditPageResponse {
  items: AuditLogItem[];
  total: number;
  page: number;
  limit: number;
}

interface WorkflowOption {
  id: string;
  title: string;
}

const PAGE_SIZE = 10;

export default function AuditExplorer() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Available workflows for filter
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);

  // Filter state (EL-124, EL-125, EL-126) & Pagination (EL-128)
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('all');
  const [actorQuery, setActorQuery] = useState<string>('');
  const [eventType, setEventType] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Load workflow options once
  useEffect(() => {
    async function loadWorkflowOptions() {
      try {
        const data = await api<{ items: WorkflowOption[] }>('/api/workflows');
        setWorkflows(data.items || []);
      } catch {
        // Non-blocking
      }
    }
    loadWorkflowOptions();
  }, []);

  const loadAuditLogs = useCallback(async () => {
    try {
      setErrorMsg(null);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      if (selectedWorkflow !== 'all') {
        params.set('workflowId', selectedWorkflow);
      }
      if (actorQuery.trim()) {
        params.set('actorId', actorQuery.trim());
      }
      if (eventType !== 'all') {
        params.set('event', eventType);
      }

      const data = await api<AuditPageResponse>(`/api/audit?${params.toString()}`);
      setLogs(data.items || []);
      setTotal(data.total || 0);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load institutional audit trail');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, selectedWorkflow, actorQuery, eventType]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  // EL-127 Refresh audit records
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAuditLogs();
    showToast('Audit records refreshed from append-only ledger');
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  const getEventBadgeClass = (evt: string) => {
    if (evt.includes('publish') || evt.includes('approved')) return 'badge-published';
    if (evt.includes('create') || evt.includes('submit')) return 'badge-draft';
    if (evt.includes('reject') || evt.includes('revoke')) return 'badge-rejected';
    if (evt.includes('changes') || evt.includes('review')) return 'badge-in_review';
    return 'badge-draft';
  };

  return (
    <div className="audit-explorer-page" data-testid="page-p-016" style={{ maxWidth: '1100px', margin: '0 auto' }}>
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
            <Link to="/admin" data-testid="EL-129" className="btn btn-secondary btn-sm" aria-label="Back to administration">
              ← Command Center
            </Link>
            <span className="badge badge-published">Tamper-Evident Ledger</span>
          </div>
          <h1>Audit Explorer</h1>
          <p className="card-subtitle">
            Inspect append-only institutional event logs, verify state mutations, and track actor accountability.
          </p>
        </div>

        {/* Global Action: Refresh (EL-127) */}
        <div>
          <button
            type="button"
            data-testid="EL-127"
            className="btn btn-secondary btn-sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : '↻ Refresh Records'}
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
          title="Audit Trail Notice"
          message={errorMsg}
          code="AUDIT_LOAD_FAILED"
          onRetry={handleRefresh}
          className="mb-4"
        />
      )}

      {/* Filter Bar (EL-124, EL-125, EL-126) */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'flex-end',
          backgroundColor: 'var(--bg-subtle)',
        }}
      >
        {/* EL-124 Filter by Workflow */}
        <div style={{ flex: '1 1 220px' }}>
          <label htmlFor="filter-audit-workflow-select" className="form-label" style={{ fontSize: '13px' }}>
            Filter by Workflow
          </label>
          <select
            id="filter-audit-workflow-select"
            data-testid="EL-124"
            className="form-select"
            value={selectedWorkflow}
            onChange={(e) => {
              setSelectedWorkflow(e.target.value);
              setPage(1);
            }}
            style={{ height: '40px', minHeight: '40px' }}
          >
            <option value="all">All Workflows</option>
            {workflows.map((wf) => (
              <option key={wf.id} value={wf.id}>
                {wf.title}
              </option>
            ))}
          </select>
        </div>

        {/* EL-125 Filter by Actor */}
        <div style={{ flex: '1 1 200px' }}>
          <label htmlFor="filter-audit-actor-input" className="form-label" style={{ fontSize: '13px' }}>
            Filter by Actor ID
          </label>
          <input
            id="filter-audit-actor-input"
            data-testid="EL-125"
            type="search"
            className="form-input"
            placeholder="Search actor ID or name..."
            value={actorQuery}
            onChange={(e) => {
              setActorQuery(e.target.value);
              setPage(1);
            }}
            style={{ height: '40px', minHeight: '40px' }}
          />
        </div>

        {/* EL-126 Filter Event Type */}
        <div style={{ flex: '1 1 200px' }}>
          <label htmlFor="filter-audit-event-select" className="form-label" style={{ fontSize: '13px' }}>
            Event Type
          </label>
          <select
            id="filter-audit-event-select"
            data-testid="EL-126"
            className="form-select"
            value={eventType}
            onChange={(e) => {
              setEventType(e.target.value);
              setPage(1);
            }}
            style={{ height: '40px', minHeight: '40px' }}
          >
            <option value="all">All Events</option>
            <option value="workflow_created">workflow_created</option>
            <option value="workflow_published">workflow_published</option>
            <option value="submission_created">submission_created</option>
            <option value="submission_submitted">submission_submitted</option>
            <option value="review_decided">review_decided</option>
            <option value="attachment_uploaded">attachment_uploaded</option>
            <option value="assignment_revoked">assignment_revoked</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <LoadingSkeleton label="Querying immutable audit logs..." lines={8} />
      ) : logs.length === 0 ? (
        <EmptyState
          title="No audit records match your filters"
          description={
            selectedWorkflow !== 'all' || actorQuery || eventType !== 'all'
              ? 'No institutional events match your specific filter criteria.'
              : 'The audit ledger has no recorded events yet.'
          }
          actionLabel={
            selectedWorkflow !== 'all' || actorQuery || eventType !== 'all' ? 'Reset Filters' : undefined
          }
          onAction={() => {
            setSelectedWorkflow('all');
            setActorQuery('');
            setEventType('all');
            setPage(1);
          }}
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Institutional Audit Log Table">
              <thead>
                <tr>
                  <th scope="col">Timestamp</th>
                  <th scope="col">Event Type</th>
                  <th scope="col">Target Entity</th>
                  <th scope="col">Actor Role</th>
                  <th scope="col">Actor ID</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Payload</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr>
                        <td style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td>
                          <span className={`badge ${getEventBadgeClass(log.event)}`}>{log.event}</span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600 }}>{log.targetEntity}</span>
                          <div style={{ fontSize: '11px', color: 'var(--ink-muted)', fontFamily: 'monospace' }}>
                            {log.targetId.slice(0, 10)}...
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-draft">{log.actorRole}</span>
                        </td>
                        <td style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                          {log.actorId ? log.actorId.slice(0, 8) + '...' : 'System'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            style={{ fontSize: '11px', padding: '2px 8px' }}
                            aria-expanded={isExpanded}
                            aria-label={`Inspect payload for ${log.event}`}
                          >
                            {isExpanded ? 'Hide' : 'Inspect'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} style={{ backgroundColor: 'var(--bg-subtle)', padding: '12px 20px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-muted)', marginBottom: '4px' }}>
                              Event ID: <code>{log.id}</code> • Workflow: <code>{log.workflowId || 'Global'}</code>
                            </div>
                            <pre
                              style={{
                                margin: 0,
                                padding: '10px',
                                backgroundColor: 'var(--bg-white)',
                                border: '1px solid var(--border-light)',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '12px',
                                overflowX: 'auto',
                                fontFamily: 'monospace',
                              }}
                            >
                              {JSON.stringify(log.details || {}, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls (EL-128) */}
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
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} audit records
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!hasPrevPage}
                aria-label="Previous audit page"
              >
                ← Previous
              </button>

              <span style={{ fontSize: '13px', fontWeight: 600, padding: '0 8px' }}>
                Page {page} of {totalPages}
              </span>

              <button
                type="button"
                data-testid="EL-128"
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNextPage}
                aria-label="Next audit page"
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
