import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';

export default function AccessDenied() {
  const { user } = useAuth();

  return (
    <div
      className="access-denied-page"
      data-testid="page-p-017"
      style={{
        maxWidth: '640px',
        margin: '60px auto',
        textAlign: 'center',
      }}
    >
      <div className="card" style={{ padding: '40px 32px' }}>
        <div style={{ marginBottom: '16px' }}>
          <span
            className="badge badge-rejected"
            style={{ fontSize: '14px', padding: '6px 14px', borderRadius: '100px' }}
          >
            403 Forbidden
          </span>
        </div>

        <h1 style={{ fontSize: '28px', fontWeight: 800, marginBottom: '12px', color: 'var(--ink-primary)' }}>
          Access Denied
        </h1>

        <p style={{ fontSize: '15px', color: 'var(--ink-secondary)', lineHeight: 1.6, marginBottom: '24px' }}>
          You do not possess the required institutional authorization or designated role to access this resource.
          To maintain data confidentiality and process integrity, cross-role actions and unauthorized records are strictly restricted.
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
            <strong>Current Session:</strong>{' '}
            {user ? (
              <span>
                {user.name} ({user.email}) — Role: <code>{user.role}</code>
              </span>
            ) : (
              <span>Unauthenticated Anonymous Visitor</span>
            )}
          </div>
          <div style={{ marginTop: '4px' }}>
            <strong>Guidance:</strong> If you believe this is in error, verify your assigned departmental role or contact your institution administrator.
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
          {/* Role-Specific Recovery Links (EL-131, EL-132, EL-133) */}
          {user?.role === 'admin' && (
            <Link
              to="/admin"
              data-testid="EL-131"
              className="btn btn-primary"
              style={{ width: '100%', maxWidth: '300px', justifyContent: 'center' }}
            >
              Go to Admin Command Center
            </Link>
          )}

          {user?.role === 'student' && (
            <Link
              to="/student"
              data-testid="EL-132"
              className="btn btn-primary"
              style={{ width: '100%', maxWidth: '300px', justifyContent: 'center' }}
            >
              Go to Student Process Hub
            </Link>
          )}

          {user?.role === 'reviewer' && (
            <Link
              to="/reviewer"
              data-testid="EL-133"
              className="btn btn-primary"
              style={{ width: '100%', maxWidth: '300px', justifyContent: 'center' }}
            >
              Go to Reviewer Inbox
            </Link>
          )}

          {/* Universal Welcome / Home Link (EL-130) */}
          <Link
            to="/"
            data-testid="EL-130"
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
