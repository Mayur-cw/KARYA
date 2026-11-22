import React, { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { BrandMark, Icon, type IconName } from './Icon';

const navigation: Record<string, { to: string; label: string; icon: IconName; end?: boolean }[]> = {
  admin: [
    { to: '/admin', label: 'Overview', icon: 'grid', end: true },
    { to: '/admin/workflows', label: 'Workflows', icon: 'layers' },
    { to: '/admin/studio', label: 'Intake studio', icon: 'sparkle' },
    { to: '/admin/audit', label: 'Audit trail', icon: 'log' },
  ],
  student: [{ to: '/student', label: 'My processes', icon: 'grid' }],
  reviewer: [{ to: '/reviewer', label: 'Review inbox', icon: 'inbox' }],
};

export function Header() {
  const { user, role, unreadCount, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [topbarMenuOpen, setTopbarMenuOpen] = useState(false);
  const [sidebarMenuOpen, setSidebarMenuOpen] = useState(false);
  const topbarMenuRef = useRef<HTMLDivElement>(null);
  const sidebarMenuRef = useRef<HTMLDivElement>(null);

  const current = navigation[role]?.find(item => item.end ? location.pathname === item.to : location.pathname.startsWith(item.to));
  const pageName = location.pathname === '/account' ? 'My account' : location.pathname === '/notifications' ? 'Notifications' : current?.label || 'Workspace';
  const initials = user?.name.replace(/\([^)]*\)/g, '').replace(/^(Dr\.|Prof\.|Dean)\s*/, '').trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('') || 'U';

  useEffect(() => {
    if (!topbarMenuOpen && !sidebarMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (topbarMenuRef.current && !topbarMenuRef.current.contains(target)) {
        setTopbarMenuOpen(false);
      }
      if (sidebarMenuRef.current && !sidebarMenuRef.current.contains(target)) {
        setSidebarMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTopbarMenuOpen(false);
        setSidebarMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [topbarMenuOpen, sidebarMenuOpen]);

  const handleSignOut = async () => {
    setTopbarMenuOpen(false);
    setSidebarMenuOpen(false);
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  if (!user) {
    return (
      <header className="public-header">
        <Link to="/" className="brand-logo" aria-label="KARYA Institutional workspace home">
          <BrandMark />
          <span>KARYA<span className="brand-caption">Institutional workspace</span></span>
        </Link>
        <div className="public-header-actions">
          <span>Less paperwork. More progress.</span>
          <Link to="/login" className="btn btn-primary btn-sm">Sign in</Link>
        </div>
      </header>
    );
  }

  const roleTitle = role === 'admin' ? 'Administrator' : role === 'student' ? 'Student' : 'Reviewer';
  const cleanName = user.name.replace(/\s*\([^)]*\)/g, '');

  return (
    <>
      <aside className="workspace-sidebar" aria-label="Workspace sidebar">
        <Link to={`/${role}`} className="brand-logo" aria-label="KARYA Institutional workspace home">
          <BrandMark />
          <span>KARYA<span className="brand-caption">Institutional workspace</span></span>
        </Link>
        <div className="workspace-label">
          <span className="workspace-monogram"><Icon name="shield" size={18} /></span>
          <span>
            {role === 'admin' ? 'Administration' : role === 'student' ? 'Student workspace' : 'Faculty workspace'}
            <small>KARYA · Operations</small>
          </span>
        </div>
        <nav aria-label="Role Navigation" className="sidebar-nav">
          <p className="nav-caption">WORKSPACE</p>
          {navigation[role]?.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
          <p className="nav-caption secondary-caption">PERSONAL</p>
          <NavLink to="/notifications" className="sidebar-link">
            <Icon name="bell" />
            <span>Notifications</span>
            {unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}
          </NavLink>
          <NavLink to="/account" className="sidebar-link">
            <Icon name="user" />
            <span>My account</span>
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="shield" />
            <strong>Every step, accounted for.</strong>
            <p>Clear ownership. Human decisions. A traceable process.</p>
          </div>
          <div className="sidebar-profile-wrapper" ref={sidebarMenuRef}>
            <div className="sidebar-profile-row">
              <button
                type="button"
                className="sidebar-profile-btn"
                aria-label={`${cleanName} - Profile menu`}
                aria-haspopup="menu"
                aria-expanded={sidebarMenuOpen}
                onClick={() => setSidebarMenuOpen(!sidebarMenuOpen)}
              >
                <span className="avatar">{initials}</span>
                <span className="sidebar-profile-text">
                  <strong>{cleanName}</strong>
                  <small>{roleTitle}</small>
                </span>
                <Icon name="chevron" size={16} />
              </button>
              <button
                type="button"
                className="sidebar-quick-signout"
                aria-label="Sign out"
                title="Sign out of account"
                onClick={handleSignOut}
              >
                <Icon name="exit" size={16} />
              </button>
            </div>
            {sidebarMenuOpen && (
              <div className="sidebar-profile-menu" role="menu" aria-label="Sidebar account actions">
                <Link to="/account" className="profile-dropdown-link" onClick={() => setSidebarMenuOpen(false)}>
                  <Icon name="user" size={16} />
                  <span>My Account</span>
                </Link>
                <Link to="/demo/signin" className="profile-dropdown-link" onClick={() => setSidebarMenuOpen(false)}>
                  <Icon name="sparkle" size={16} />
                  <span>Switch Demo Role</span>
                </Link>
                <button
                  type="button"
                  className="profile-dropdown-signout"
                  onClick={handleSignOut}
                >
                  <Icon name="exit" size={16} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
      <header className="workspace-topbar">
        <div className="breadcrumb">
          Workspace <span>/</span> <strong>{pageName}</strong>
        </div>
        <div className="topbar-actions">
          <span className="today-label">
            {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())}
          </span>
          <Link to="/notifications" className="icon-button" aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}>
            <Icon name="bell" />
            {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}
          </Link>
          <div className="profile-menu-container" ref={topbarMenuRef}>
            <button
              type="button"
              className="avatar avatar-small avatar-btn"
              aria-label={`${cleanName} - Profile and sign out`}
              aria-haspopup="menu"
              aria-expanded={topbarMenuOpen}
              data-testid="profile-avatar-btn"
              onClick={() => setTopbarMenuOpen(!topbarMenuOpen)}
            >
              {initials}
            </button>
            {topbarMenuOpen && (
              <div className="profile-dropdown" role="menu" aria-label="Account actions">
                <div className="profile-dropdown-identity">
                  <div className="avatar avatar-dropdown">{initials}</div>
                  <div className="profile-dropdown-user">
                    <strong className="profile-dropdown-name">{cleanName}</strong>
                    <span className="profile-dropdown-email">{user.email}</span>
                    <span className="profile-dropdown-role-badge">{roleTitle}</span>
                  </div>
                </div>
                <div className="profile-dropdown-divider" />
                <div className="profile-dropdown-items">
                  <Link
                    to="/account"
                    role="menuitem"
                    className="profile-dropdown-link"
                    onClick={() => setTopbarMenuOpen(false)}
                  >
                    <Icon name="user" size={16} />
                    <span>My Account</span>
                  </Link>
                  <Link
                    to="/notifications"
                    role="menuitem"
                    className="profile-dropdown-link"
                    onClick={() => setTopbarMenuOpen(false)}
                  >
                    <Icon name="bell" size={16} />
                    <span>Notifications</span>
                    {unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}
                  </Link>
                  <Link
                    to="/demo/signin"
                    role="menuitem"
                    className="profile-dropdown-link"
                    onClick={() => setTopbarMenuOpen(false)}
                  >
                    <Icon name="sparkle" size={16} />
                    <span>Switch Demo Role</span>
                  </Link>
                </div>
                <div className="profile-dropdown-divider" />
                <div className="profile-dropdown-footer">
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="profile-signout-btn"
                    className="profile-dropdown-signout"
                    onClick={handleSignOut}
                  >
                    <Icon name="exit" size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
