import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, UserProfile } from '../components/AuthContext';
import { ErrorMessage } from '../components/ErrorMessage';
import { api } from '../api';

export default function MyAccount() {
  const { user, refreshSession, logout } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [sessionDetails, setSessionDetails] = useState<UserProfile | null>(user);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name) {
      setDisplayName(user.name);
      setSessionDetails(user);
    }
  }, [user]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // VR-020: 1..100 characters
  const trimmedName = displayName.trim();
  const isValidDisplayName = trimmedName.length >= 1 && trimmedName.length <= 100;

  // EL-118 Save account profile
  const handleSaveProfile = async () => {
    if (!user) return;
    if (!isValidDisplayName) {
      setErrorMsg('Enter a valid display name (1 to 100 characters).');
      return;
    }

    try {
      setSaving(true);
      setErrorMsg(null);
      await api(`/api/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmedName }),
      });

      await refreshSession();
      showToast('Profile updated for authenticated account');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update account profile');
    } finally {
      setSaving(false);
    }
  };

  // EL-119 Inspect current session
  const handleInspectSession = async () => {
    try {
      setInspecting(true);
      setErrorMsg(null);
      const res = await api<{ user: UserProfile }>('/api/auth/me');
      setSessionDetails(res.user);
      showToast('Verified current account and role displayed');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Session verification failed');
    } finally {
      setInspecting(false);
    }
  };

  // EL-120 Logout
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Logout failed');
    }
  };

  return (
    <div className="my-account-page" data-testid="page-p-015" style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Top Header & Role Back Link */}
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
            <span className="badge badge-in_review">Identity & Settings</span>
            {user?.role && <span className="badge badge-draft">{user.role.toUpperCase()}</span>}
          </div>
          <h1>My Account</h1>
          <p className="card-subtitle">
            Inspect verified institutional credentials, update display name, and manage active session state.
          </p>
        </div>

        {/* Role-Specific Back Links (EL-121, EL-122, EL-123) */}
        <div>
          {user?.role === 'admin' && (
            <Link to="/admin" data-testid="EL-121" className="btn btn-secondary btn-sm">
              Return to Admin Home
            </Link>
          )}

          {user?.role === 'student' && (
            <Link to="/student" data-testid="EL-122" className="btn btn-secondary btn-sm">
              Return to Student Home
            </Link>
          )}

          {user?.role === 'reviewer' && (
            <Link to="/reviewer" data-testid="EL-123" className="btn btn-secondary btn-sm">
              Return to Reviewer Home
            </Link>
          )}
        </div>
      </div>

      {toastMessage && (
        <div className="alert alert-success" role="status" aria-live="polite" style={{ marginBottom: '20px' }}>
          <span>✓ {toastMessage}</span>
        </div>
      )}

      {errorMsg && (
        <ErrorMessage
          title="Account Notice"
          message={errorMsg}
          code="ACCOUNT_ERROR"
          className="mb-4"
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Profile Card (EL-117, EL-118) */}
        <section className="card">
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
            Personal Profile Information
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label htmlFor="edit-display-name-input" className="form-label">
                Display Name (VR-020: 1–100 characters) <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                id="edit-display-name-input"
                data-testid="EL-117"
                type="text"
                className="form-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={100}
                placeholder="Enter your institutional display name"
                style={{ maxWidth: '420px' }}
              />
              <div style={{ fontSize: '12px', color: 'var(--ink-muted)', marginTop: '4px' }}>
                {displayName.length} / 100 characters
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-muted)' }}>Email Address</span>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink-primary)', marginTop: '2px' }}>
                  {user?.email || 'N/A'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-muted)' }}>Assigned Role</span>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ink-primary)', marginTop: '2px' }}>
                  {user?.role ? user.role.toUpperCase() : 'N/A'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-muted)' }}>Department Scope</span>
                <div style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--ink-secondary)', marginTop: '2px' }}>
                  {user?.departmentId || 'Default Institute Department'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-muted)' }}>Account Identifier</span>
                <div style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--ink-secondary)', marginTop: '2px' }}>
                  {user?.id ? user.id.slice(0, 12) + '...' : 'N/A'}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '8px' }}>
              <button
                type="button"
                data-testid="EL-118"
                className="btn btn-primary"
                onClick={handleSaveProfile}
                disabled={saving || !isValidDisplayName}
              >
                {saving ? 'Saving...' : 'Save Account Profile'}
              </button>
            </div>
          </div>
        </section>

        {/* Session Verification & Security (EL-119, EL-120) */}
        <section className="card">
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
            Session Security & Institutional Context
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--ink-secondary)', marginBottom: '16px' }}>
            Your access session is bound to an authenticated HTTP cookie backed by cryptographic double-submit CSRF tokens.
          </p>

          <div
            style={{
              padding: '16px',
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-light)',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>Server Verification Status</span>
              <span className="badge badge-published">Active & Authorized</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--ink-muted)' }}>
              Principal: <strong>{sessionDetails?.name}</strong> ({sessionDetails?.email}) — Role:{' '}
              <code>{sessionDetails?.role}</code>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              data-testid="EL-119"
              className="btn btn-secondary"
              onClick={handleInspectSession}
              disabled={inspecting}
            >
              {inspecting ? 'Verifying...' : '🔍 Inspect Current Session'}
            </button>

            <button
              type="button"
              data-testid="EL-120"
              className="btn btn-secondary"
              onClick={handleLogout}
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            >
              Sign Out / Terminate Session
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
