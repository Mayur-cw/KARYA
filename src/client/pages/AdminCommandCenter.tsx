import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { Icon, type IconName } from '../components/Icon';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorMessage } from '../components/ErrorMessage';
import { EmptyState } from '../components/EmptyState';
import { fetchCollection } from '../collections';
import type { Workflow } from '../../shared/contracts';

export default function AdminCommandCenter() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fetchWorkflows = useCallback(async () => {
    try {
      setErrorMsg(null);
      setWorkflows(await fetchCollection<Workflow>('/api/workflows'));
      return true;
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Unable to load workflows. Please try again.');
      return false;
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void fetchWorkflows(); }, [fetchWorkflows]);
  const refresh = async () => {
    setRefreshing(true);
    setMessage(null);
    if (await fetchWorkflows()) setMessage('Dashboard refreshed from live record totals');
  };
  const published = workflows.filter(w => w.status === 'published').length;
  const drafts = workflows.filter(w => w.status === 'draft' || w.status === 'proposed').length;
  const archived = workflows.filter(w => w.status === 'archived').length;
  const needsAttention = workflows.filter(w => (w.status === 'draft' || w.status === 'proposed') && (!w.deadline || !w.stages.length || w.stages.some(s => !s.reviewerId) || w.uncertainties?.some(u => !u.resolved)));
  const recent = [...workflows].sort((a,b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt)).slice(0, 5);
  const stats: { title: string; value: number; description: string; icon: IconName; featured?: boolean }[] = [
    { title: 'Total workflows', value: workflows.length, description: 'Across your department', icon: 'layers' },
    { title: 'Published & active', value: published, description: 'Available to assigned students', icon: 'check', featured: true },
    { title: 'Unpublished drafts', value: drafts, description: 'Drafts and proposed workflows', icon: 'file' },
    { title: 'Needs attention', value: needsAttention.length, description: 'Open publication requirements', icon: 'alert' },
  ];
  return <div className="admin-command-center" data-testid="page-p-003">
    <div className="page-heading"><div><p className="dashboard-greeting">Welcome back, {user?.name.replace(/\s*\([^)]*\)/g, '') || 'Administrator'}</p><h1>Command Center</h1><p className="card-subtitle">A clear view of your workflows. A good place to move things forward.</p></div><div className="heading-actions"><button type="button" data-testid="EL-015" className="btn btn-secondary" onClick={refresh} disabled={refreshing || loading} aria-label="Refresh derived metrics"><Icon name="refresh" size={16} />{refreshing ? 'Refreshing…' : 'Refresh'}</button><button type="button" data-testid="EL-010" className="btn btn-primary" onClick={() => navigate('/admin/studio')}><Icon name="plus" size={17} />Create from instruction</button></div></div>
    {message && <div className="alert alert-success" role="status">{message}</div>}
    {errorMsg && <ErrorMessage title="Dashboard couldn’t be updated" message={errorMsg} onRetry={refresh} className="mb-4" />}
    <section className="stats-grid" aria-label="Operational metrics">{stats.map(stat => <article key={stat.title} className={`card stat-card${stat.featured ? ' featured' : ''}`}><div className="stat-top"><span>{stat.title}</span><span className="stat-icon"><Icon name={stat.icon} size={18} /></span></div><div className="stat-value">{loading || errorMsg ? '—' : stat.value}</div><p className="stat-description">{stat.description}</p></article>)}</section>
    <div className="dashboard-grid"><section className="card table-panel"><div className="panel-heading"><div><h2>Recent Workflows</h2><p>Your latest processes, all in one place.</p></div><Link to="/admin/workflows" data-testid="EL-009">View all workflows</Link></div>
      {loading ? <LoadingSkeleton label="Loading your department’s workflows…" lines={5} /> : errorMsg ? <div className="attention-body"><p>Workflow data is unavailable. Retry to load the latest records.</p></div> : workflows.length === 0 ? <EmptyState title="Your first workflow starts here" description="Turn an instruction into a clear process for your department." actionLabel="Open intake studio" onAction={() => navigate('/admin/studio')} /> : <div className="table-scroll"><table className="data-table" aria-label="Recent workflows"><thead><tr><th scope="col">Workflow</th><th scope="col">Status</th><th scope="col">Deadline</th><th scope="col">Action</th></tr></thead><tbody>{recent.map(w => <tr key={w.id}><td><div className="workflow-cell"><span className="document-icon"><Icon name="file" size={18} /></span><div><span className="workflow-title">{w.title}</span><p className="workflow-meta">{w.stages.length} review {w.stages.length === 1 ? 'stage' : 'stages'} · Version {w.version}</p></div></div></td><td><StatusBadge status={w.status} /></td><td>{w.deadline ? new Date(w.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Not set'}</td><td><Link className="btn btn-secondary btn-sm" to={`/admin/workflows/${w.id}${w.status === 'draft' || w.status === 'proposed' ? '/edit' : ''}`} aria-label={`${w.status === 'draft' || w.status === 'proposed' ? 'Edit' : 'View'} ${w.title}`}>{w.status === 'draft' || w.status === 'proposed' ? 'Edit' : 'View'}</Link></td></tr>)}</tbody></table></div>}
    </section><div className="dashboard-side"><section className="card table-panel"><div className="panel-heading"><div><h2>Workflow overview</h2><p>Where your processes stand.</p></div><Icon name="layers" size={18} /></div><div className="composition-body"><span className="stat-value">{loading || errorMsg ? '—' : workflows.length}</span><span className="stat-description"> total workflows</span><div className="distribution-bar" aria-hidden="true">{!loading && !errorMsg && <><span style={{ width: `${published / Math.max(workflows.length,1)*100}%`, background: '#209674' }} /><span style={{ width: `${drafts / Math.max(workflows.length,1)*100}%`, background: '#e0aa56' }} /><span style={{ width: `${archived / Math.max(workflows.length,1)*100}%`, background: '#a7b5bd' }} /></>}</div>{[{ label: 'Published & active', value: published, color: '#209674' }, { label: 'Drafts & proposals', value: drafts, color: '#e0aa56' }, { label: 'Archived', value: archived, color: '#a7b5bd' }].map(item => <div className="distribution-row" key={item.label}><i style={{ background: item.color }} aria-hidden="true" />{item.label}<strong>{loading || errorMsg ? '—' : item.value}</strong></div>)}</div></section>
    <section className="card table-panel"><div className="panel-heading"><div><h2>Attention & Exceptions Queue</h2><p>Requirements to resolve before publishing.</p></div></div><div className="attention-body">{loading ? <LoadingSkeleton lines={2} /> : errorMsg ? <p>Refresh the dashboard to check open requirements.</p> : needsAttention.length === 0 ? <div className="attention-empty"><Icon name="check" size={18} /><div><strong>{workflows.length ? 'Nothing needs your attention' : 'A fresh start'}</strong><p>{workflows.length ? 'No open publication requirements in your drafts.' : 'Create a workflow to begin your department’s next process.'}</p></div></div> : needsAttention.map(w => <div className="attention-item" key={w.id}><Link to={`/admin/workflows/${w.id}/edit`}>{w.title}</Link><p>{!w.deadline ? 'Set a deadline' : !w.stages.length || w.stages.some(s => !s.reviewerId) ? 'Assign review stages' : 'Resolve open questions'} before publishing.</p></div>)}</div></section></div></div>
    <section className="dashboard-banner"><Icon name="sparkle" size={24} /><div><h2>Good processes start with clear instructions.</h2><p>Use the intake studio to turn an official circular into your next workflow.</p></div><Link to="/admin/studio" className="btn btn-secondary btn-sm">Open intake studio</Link></section>
    <nav className="dashboard-utilities" aria-label="Dashboard utilities"><Link to="/admin/audit" data-testid="EL-011">Inspect audit events</Link><Link to="/notifications" data-testid="EL-012">Notifications</Link><Link to="/account" data-testid="EL-013">My account</Link><button type="button" className="text-button" data-testid="EL-014" onClick={async () => { await logout(); navigate('/'); }}>Sign out</button></nav>
  </div>;
}
