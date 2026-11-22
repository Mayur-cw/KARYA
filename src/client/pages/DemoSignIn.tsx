import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, SEEDED_ACTORS } from '../components/AuthContext';
import { ErrorMessage } from '../components/ErrorMessage';

export default function DemoSignIn() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/';

  const [selectedId, setSelectedId] = useState<string>(SEEDED_ACTORS[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedActor = SEEDED_ACTORS.find((a) => a.id === selectedId) || SEEDED_ACTORS[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await login(selectedId);
      // Navigate to redirect path or role-specific landing
      if (redirectPath && redirectPath !== '/') {
        navigate(redirectPath);
      } else {
        if (selectedActor.role === 'admin') navigate('/admin');
        else if (selectedActor.role === 'student') navigate('/student');
        else if (selectedActor.role === 'reviewer') navigate('/reviewer');
        else navigate('/');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="demo-sign-in-page" data-testid="page-p-002" style={{ maxWidth: '720px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <Link to="/" data-testid="EL-008" className="btn btn-secondary btn-sm">
          ← Back to Welcome
        </Link>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <div>
            <span className="badge badge-published" style={{ marginBottom: '8px' }}>
              Evaluation Environment
            </span>
            <h1>Demo Authentication Desk</h1>
            <p className="card-subtitle">
              Select a pre-seeded authorized institutional identity to test end-to-end governance.
            </p>
          </div>
        </div>

        {/* Demo Mode Notice */}
        <div className="alert alert-info" style={{ marginBottom: '24px' }}>
          <div>
            <strong>Evaluation Mode Active:</strong> Direct cryptographic sessions are established using server-allowlisted actors. No plaintext passwords required for judge evaluation.
          </div>
        </div>

        {errorMsg && (
          <ErrorMessage
            title="Authentication Error"
            message={errorMsg}
            code="AUTH_FAILED"
            onRetry={() => setErrorMsg(null)}
          />
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="demo-identity-select" className="form-label">
              Choose Demo Persona
            </label>
            <select
              id="demo-identity-select"
              data-testid="EL-006"
              className="form-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              disabled={submitting}
            >
              {SEEDED_ACTORS.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name} — {actor.title} ({actor.role.toUpperCase()})
                </option>
              ))}
            </select>
            <span className="form-hint">
              Selected account: {selectedActor.email} • ID: {selectedActor.id}
            </span>
          </div>

          {/* Persona Card Detail */}
          <div
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-light)',
              marginBottom: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '15px' }}>{selectedActor.name}</span>
              <span className={`badge badge-${selectedActor.role === 'admin' ? 'published' : selectedActor.role === 'reviewer' ? 'in_review' : 'submitted'}`}>
                {selectedActor.role.toUpperCase()}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--ink-secondary)', margin: 0 }}>
              {selectedActor.title}
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="submit"
              data-testid="EL-007"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Starting Session...' : 'Start Signed-In Session'}
            </button>
          </div>
        </form>
      </div>

      {/* Overview of 5 seeded personas */}
      <div className="card">
        <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>Available Test Personas</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {SEEDED_ACTORS.map((actor) => (
            <div
              key={actor.id}
              onClick={() => setSelectedId(actor.id)}
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid',
                borderColor: selectedId === actor.id ? 'var(--primary)' : 'var(--border-light)',
                background: selectedId === actor.id ? 'var(--primary-subtle)' : 'var(--bg-card)',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'all 0.15s ease',
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedId(actor.id);
                }
              }}
              aria-label={`Select ${actor.name}`}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{actor.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>{actor.title}</div>
              </div>
              <span className="badge badge-draft" style={{ textTransform: 'uppercase', fontSize: '11px' }}>
                {actor.role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
