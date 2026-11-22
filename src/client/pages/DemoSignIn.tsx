import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, SEEDED_ACTORS } from '../components/AuthContext';
import { ErrorMessage } from '../components/ErrorMessage';
import { Icon } from '../components/Icon';

export function safeSignInRedirect(path: string | null, role: string) {
  const home = `/${role}`;
  if (!path || !path.startsWith('/') || path.startsWith('//') || /[\\\s]/.test(path)) return home;
  const url = new URL(path, 'https://karya.local');
  const pathname = url.pathname;
  if (pathname === '/account' || pathname === '/notifications' || pathname === home || pathname.startsWith(`${home}/`)) return `${pathname}${url.search}${url.hash}`;
  return home;
}

export default function DemoSignIn() {
  const { login, loading, demoMode, demoActors, presentationMode, error: connectionError } = useAuth();
  const actors = demoActors || SEEDED_ACTORS;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string>(SEEDED_ACTORS[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const selectedActor = actors.find(a => a.id === selectedId) || actors[0];
  const enabled = demoMode !== false && !!selectedActor;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!enabled || submitting || loading) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await login(selectedActor.id);
      navigate(safeSignInRedirect(searchParams.get('redirect'), selectedActor.role), { replace: true });
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="demo-sign-in-page" data-testid="page-p-002">
    <div className="auth-grid">
      <section className="auth-story" aria-label="Your KARYA workspace">
        <div className="eyebrow">A clearer way to work</div>
        <h2>Less back and forth.<br />More moving forward.</h2>
        <p>One place for your institution’s processes. Know what’s needed, who’s next, and where things stand.</p>
        <img className="auth-art" src="/illustrations/workspace-desk.svg" width="620" height="440" alt="Illustrated desk with a laptop, application documents, and a completed review." />
        <div className="auth-story-footer"><Icon name="shield" size={16} />Separate roles. A shared sense of progress.</div>
      </section>
      <section className="auth-form-panel" aria-labelledby="sign-in-heading">
        <Link to="/" data-testid="EL-008" className="auth-back">Back to welcome</Link>
        <div><span className="badge badge-draft">{presentationMode ? 'Presentation demo' : 'Local demo workspace'}</span><h1 id="sign-in-heading">Welcome to KARYA</h1><p className="auth-intro">Choose an account to explore your workspace. Each role has its own tools and access.</p></div>
        {(errorMsg || connectionError) && <ErrorMessage title="We couldn’t sign you in" message={errorMsg || connectionError || ''} onRetry={() => setErrorMsg(null)} />}
        {demoMode === false && !loading && <div className="alert alert-info" role="status">Demo sign-in is disabled on this server. Contact your administrator for access.</div>}
        <form onSubmit={handleSubmit} aria-busy={submitting}>
          <div className="form-group">
            <label htmlFor="demo-identity-select" className="form-label">Your demo account</label>
            <select id="demo-identity-select" data-testid="EL-006" className="form-select" value={selectedActor?.id || ''} onChange={e => { setSelectedId(e.target.value); setErrorMsg(null); }} disabled={submitting || loading || !enabled} aria-describedby="demo-account-help">
              {actors.map(actor => <option key={actor.id} value={actor.id}>{actor.name} · {actor.role === 'admin' ? 'Administrator' : actor.role === 'student' ? 'Student' : 'Reviewer'}</option>)}
            </select>
            <span id="demo-account-help" className="form-hint">{loading ? 'Checking workspace availability…' : 'Select a person to see their assigned workspace.'}</span>
          </div>
          {selectedActor && <div className="persona-preview"><span className="avatar"><Icon name={selectedActor.role === 'admin' ? 'shield' : 'user'} size={18} /></span><div><strong>{selectedActor.name}</strong><p>{selectedActor.email}</p></div><span className="badge badge-submitted">{selectedActor.role}</span></div>}
          <button type="submit" data-testid="EL-007" className="btn btn-primary auth-submit" disabled={submitting || loading || !enabled}>{submitting ? 'Opening your workspace…' : 'Continue to workspace'}</button>
          <p className="auth-notice"><Icon name="shield" size={15} /><span>This is a demo account, with no password required. Your session is managed securely by the server.</span></p>
        </form>
        <div className="persona-directory"><h2>Available demo accounts</h2>{actors.map(actor => <div className="persona-row" key={actor.id}><span className="avatar">{actor.name.replace(/^(Dr\.|Prof\.|Dean)\s*/, '').split(' ').slice(0, 2).map(part => part[0]).join('')}</span><span>{actor.name}</span><small>{actor.role === 'admin' ? 'Administrator' : actor.role === 'reviewer' ? 'Reviewer' : 'Student'}</small></div>)}</div>
      </section>
    </div>
  </div>;
}
