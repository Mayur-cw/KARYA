import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';

export default function PageNotFound() {
  const { user } = useAuth();

  return (
    <div
      className="page-not-found-page"
      data-testid="page-p-018"
      style={{
        maxWidth: '640px',
        margin: '60px auto',
        textAlign: 'center',
      }}
    >
      <div className="card" style={{ padding: '40px 32px' }}>
        <div style={{ marginBottom: '16px' }}>
          <span
            className="badge badge-warning"
            style={{ fontSize: '14px', padding: '6px 14px', borderRadius: '100px' }}
          >
            404 Not Found
          </span>
        </div>

        <h1 style={{ fontSize: '28px', fontWeight: 800, marginBottom: '12px', color: 'var(--ink-primary)' }}>
          Page Not Found
        </h1>

        <p style={{ fontSize: '15px', color: 'var(--ink-secondary)', lineHeight: 1.6, marginBottom: '24px' }}>
          The requested URL does not match any active institutional route in KARYA, or the referenced resource is not accessible in this context.
        </p>

        <div
          style={{
            padding: '16px',
            backgroundColor: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '32px',
            textAlign: 'left',
            fontSize: '13px',
            color: 'var(--ink-muted)',
          }}
        >
          <div>
            <strong>Identity Context:</strong>{' '}
            {user ? (
              <span>
                {user.name} ({user.email}) — Role: <code>{user.role}</code>
              </span>
            ) : (
              <span>Visitor / Unauthenticated</span>
            )}
          </div>
          <div style={{ marginTop: '4px' }}>
            Please check the URL for typos or choose one of the verified recovery paths below.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          {/* Role-Specific Recovery Links (EL-135, EL-136, EL-137) */}
          {user?.role === 'admin' && (
            <Link
              to="/admin"
              data-testid="EL-135"
              className="btn btn-primary"
              style={{ width: '100%', maxWidth: '300px', justifyContent: 'center' }}
            >
              Go to Admin Command Center
            </Link>
          )}

          {user?.role === 'student' && (
            <Link
              to="/student"
              data-testid="EL-136"
              className="btn btn-primary"
              style={{ width: '100%', maxWidth: '300px', justifyContent: 'center' }}
            >
              Go to Student Process Hub
            </Link>
          )}

          {user?.role === 'reviewer' && (
            <Link
              to="/reviewer"
              data-testid="EL-137"
              className="btn btn-primary"
              style={{ width: '100%', maxWidth: '300px', justifyContent: 'center' }}
            >
              Go to Reviewer Inbox
            </Link>
          )}

          {/* Universal Welcome / Home Link (EL-134) */}
          <Link
            to="/"
            data-testid="EL-134"
            className="btn btn-secondary"
            style={{ width: '100%', maxWidth: '300px', justifyContent: 'center' }}
          >
            ← Return to Welcome Page
          </Link>
        </div>
      </div>
    </div>
  );
}
