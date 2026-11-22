import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, SEEDED_ACTORS } from './AuthContext';

export function Header() {
  const { user, role, unreadCount, login, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleActorSwitch = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'logout') {
      await logout();
      navigate('/login');
    } else if (val) {
      await login(val);
      // Route to the appropriate role home
      const selected = SEEDED_ACTORS.find((a) => a.id === val);
      if (selected) {
        if (selected.role === 'admin') navigate('/admin');
        else if (selected.role === 'student') navigate('/student');
        else if (selected.role === 'reviewer') navigate('/reviewer');
      }
    }
  };

  return (
    <header className="app-header" role="banner">
      <div className="header-container">
        <div className="brand-section">
          <Link to="/" className="brand-logo" aria-label="KARYA Home">
            <span>KARYA</span>
            <span className="badge">Gov Ops</span>
          </Link>

          {role !== 'anonymous' && (
            <nav aria-label="Role Navigation">
              <ul className="nav-links">
                {role === 'admin' && (
                  <>
                    <li>
                      <Link
                        to="/admin"
                        className={location.pathname === '/admin' ? 'active' : ''}
                      >
                        Command Center
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/admin/workflows"
                        className={location.pathname === '/admin/workflows' ? 'active' : ''}
                      >
                        Workflows
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/admin/studio"
                        className={location.pathname === '/admin/studio' ? 'active' : ''}
                      >
                        Studio Intake
                      </Link>
                    </li>
                    <li>
                      <Link
                        to="/admin/audit"
                        className={location.pathname === '/admin/audit' ? 'active' : ''}
                      >
                        Audit
                      </Link>
                    </li>
                  </>
                )}

                {role === 'student' && (
                  <li>
                    <Link
                      to="/student"
                      className={location.pathname === '/student' ? 'active' : ''}
                    >
                      Process Hub
                    </Link>
                  </li>
                )}

                {role === 'reviewer' && (
                  <li>
                    <Link
                      to="/reviewer"
                      className={location.pathname === '/reviewer' ? 'active' : ''}
                    >
                      Reviewer Inbox
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
          )}
        </div>

        <div className="header-actions">
          {/* Quick Persona Switcher for Hackathon Judges & Evaluators */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label
              htmlFor="demo-actor-select"
              style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-muted)' }}
            >
              Persona:
            </label>
            <select
              id="demo-actor-select"
              className="form-select"
              aria-label="Switch active persona"
              value={user?.id || ''}
              onChange={handleActorSwitch}
              style={{
                height: '36px',
                minHeight: '36px',
                padding: '4px 8px',
                fontSize: '13px',
                maxWidth: '200px',
              }}
            >
              <option value="" disabled>
                -- Select Demo Actor --
              </option>
              {SEEDED_ACTORS.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name} ({actor.role})
                </option>
              ))}
              {user && <option value="logout">Sign out</option>}
            </select>
          </div>

          {user ? (
            <>
              <Link
                to="/notifications"
                className="btn btn-secondary btn-sm"
                aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
                style={{ position: 'relative' }}
              >
                <span>🔔</span>
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      background: 'var(--danger)',
                      color: 'white',
                      fontSize: '11px',
                      fontWeight: 700,
                      borderRadius: 'var(--radius-full)',
                      padding: '1px 6px',
                      lineHeight: '1',
                    }}
                  >
                    {unreadCount}
                  </span>
                )}
              </Link>

              <Link
                to="/account"
                className="btn btn-secondary btn-sm"
                aria-label="Account Settings"
              >
                <span>👤</span>
                <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.name.split(' ')[0]}
                </span>
              </Link>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary btn-sm">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
