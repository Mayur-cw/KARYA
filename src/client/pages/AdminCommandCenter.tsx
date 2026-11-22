import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorMessage } from '../components/ErrorMessage';
import { EmptyState } from '../components/EmptyState';
import { api } from '../api';

interface WorkflowSummary {
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

export default function AdminCommandCenter() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchWorkflows = useCallback(async () => {
    try {
      setErrorMsg(null);
      const data = await api<WorkflowSummary[]>('/api/workflows');
      setWorkflows(data || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load department workflows');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchWorkflows();
    setToastMessage('Dashboard refreshed from live record totals');
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const totalWorkflows = workflows.length;
  const publishedWorkflows = workflows.filter((w) => w.status === 'published').length;
  const draftWorkflows = workflows.filter((w) => w.status === 'draft').length;
  const stalledWorkflows = workflows.filter(
    (w) => w.status === 'draft' && w.stages.some((s) => !s.assignedReviewerId)
  );

  return (
    <div className="admin-command-center" data-testid="page-p-003">
      {/* Top Header / Context */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className="badge badge-published">Administration Desk</span>
            <span style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
              Dept: {user?.departmentId ? user.departmentId.substring(0, 8) : 'Main'}
            </span>
          </div>
          <h1>Command Center</h1>
          <p className="card-subtitle">
            Derived workflow health, administrative action queues, and intake controls.
          </p>
        </div>

        {/* Global Utilities */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Link to="/notifications" data-testid="EL-012" className="btn btn-secondary btn-sm">
            Notifications
          </Link>
          <Link to="/account" data-testid="EL-013" className="btn btn-secondary btn-sm">
            My Account
          </Link>
          <button
            type="button"
            data-testid="EL-014"
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
          title="Command Center Error"
          message={errorMsg}
          code="FETCH_FAILED"
          onRetry={handleRefresh}
          className="mb-4"
        />
      )}

      {/* Action Strip (EL-009, EL-010, EL-011, EL-015) */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: 'var(--bg-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="EL-010"
            className="btn btn-primary"
            onClick={() => navigate('/admin/studio')}
          >
            + Create from Instruction
          </button>
          <Link to="/admin/workflows" data-testid="EL-009" className="btn btn-secondary">
            View All Workflows
          </Link>
          <Link to="/admin/audit" data-testid="EL-011" className="btn btn-secondary">
            Inspect Audit Events
          </Link>
        </div>

        <button
          type="button"
          data-testid="EL-015"
          className="btn btn-secondary btn-sm"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh derived metrics"
        >
          {refreshing ? 'Refreshing...' : '↻ Refresh Derived Metrics'}
        </button>
      </div>

      {/* Overview Stats Region */}
      <section style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>Operational Metrics</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
          }}
        >
          <div className="card">
            <span style={{ fontSize: '13px', color: 'var(--ink-muted)', fontWeight: 600 }}>
              TOTAL WORKFLOWS
            </span>
            <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--ink-primary)', marginTop: '4px' }}>
              {loading ? '-' : totalWorkflows}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--ink-secondary)' }}>
              Active in departmental scope
            </span>
          </div>

          <div className="card">
            <span style={{ fontSize: '13px', color: 'var(--success)', fontWeight: 600 }}>
              PUBLISHED & ACTIVE
            </span>
            <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--success)', marginTop: '4px' }}>
              {loading ? '-' : publishedWorkflows}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--ink-secondary)' }}>
              Accepting student submissions
            </span>
          </div>

          <div className="card">
            <span style={{ fontSize: '13px', color: 'var(--warning)', fontWeight: 600 }}>
              UNPUBLISHED DRAFTS
            </span>
            <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--warning)', marginTop: '4px' }}>
              {loading ? '-' : draftWorkflows}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--ink-secondary)' }}>
              Under editorial review or synthesis
            </span>
          </div>

          <div className="card">
            <span style={{ fontSize: '13px', color: 'var(--danger)', fontWeight: 600 }}>
              PUBLISH-BLOCKED
            </span>
            <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--danger)', marginTop: '4px' }}>
              {loading ? '-' : stalledWorkflows.length}
            </div>
            <span style={{ fontSize: '12px', color: 'var(--ink-secondary)' }}>
              Missing reviewer or uncertainty
            </span>
          </div>
        </div>
      </section>

      {/* Main Content: Recent Workflows & Stalled Queue */}
      {loading ? (
        <LoadingSkeleton label="Loading departmental workflows and live status tallies..." lines={5} />
      ) : workflows.length === 0 ? (
        <EmptyState
          title="No workflows created yet"
          description="Create your first workflow from an official circular or regulation using the Intake Studio."
          actionLabel="Open Intake Studio"
          onAction={() => navigate('/admin/studio')}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
          {/* Recent Workflows */}
          <section className="card">
            <div className="card-header">
              <div>
                <h2 style={{ fontSize: '18px' }}>Recent Workflows</h2>
                <p className="card-subtitle">Active governance pipelines</p>
              </div>
              <Link to="/admin/workflows" className="btn btn-secondary btn-sm">
                View All →
              </Link>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {workflows.slice(0, 5).map((wf) => (
                <div
                  key={wf.id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {wf.title}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                      Deadline: {new Date(wf.deadlinePolicy.initialDeadline).toLocaleDateString()} • {wf.stages.length} Stages
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <StatusBadge status={wf.status} />
                    <Link
                      to={wf.status === 'draft' ? `/admin/workflows/${wf.id}/edit` : `/admin/workflows/${wf.id}`}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '0 8px', minHeight: '32px' }}
                    >
                      {wf.status === 'draft' ? 'Edit' : 'View'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Stalled Queue / Attention Items */}
          <section className="card">
            <div className="card-header">
              <div>
                <h2 style={{ fontSize: '18px' }}>Attention & Exceptions Queue</h2>
                <p className="card-subtitle">Workflows with pending actions</p>
              </div>
            </div>

            {stalledWorkflows.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--ink-muted)' }}>
                <span style={{ fontSize: '24px' }}>✓</span>
                <p style={{ marginTop: '8px', fontSize: '14px' }}>
                  No stalled workflows. All draft stages have assigned reviewers.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {stalledWorkflows.map((wf) => (
                  <div
                    key={wf.id}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--danger-border)',
                      backgroundColor: 'var(--danger-bg)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--danger)' }}>
                        {wf.title}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--danger)' }}>
                        Publish blocked: Reviewer unassigned on review stages
                      </div>
                    </div>
                    <Link
                      to={`/admin/workflows/${wf.id}/edit`}
                      className="btn btn-primary btn-sm"
                      style={{ flexShrink: 0 }}
                    >
                      Fix Gate
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
