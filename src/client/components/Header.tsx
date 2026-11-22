import React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
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
  const { user, role, unreadCount } = useAuth();
  const location = useLocation();
  const current = navigation[role]?.find(item => item.end ? location.pathname === item.to : location.pathname.startsWith(item.to));
  const pageName = location.pathname === '/account' ? 'My account' : location.pathname === '/notifications' ? 'Notifications' : current?.label || 'Workspace';
  const initials = user?.name.replace(/\([^)]*\)/g, '').replace(/^(Dr\.|Prof\.|Dean)\s*/, '').trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('');
  if (!user) return <header className="public-header">
    <Link to="/" className="brand-logo" aria-label="KARYA Institutional workspace home"><BrandMark /><span>KARYA<span className="brand-caption">Institutional workspace</span></span></Link>
    <div className="public-header-actions"><span>Less paperwork. More progress.</span><Link to="/login" className="btn btn-primary btn-sm">Sign in</Link></div>
  </header>;
  return <>
    <aside className="workspace-sidebar" aria-label="Workspace sidebar">
      <Link to={`/${role}`} className="brand-logo" aria-label="KARYA Institutional workspace home"><BrandMark /><span>KARYA<span className="brand-caption">Institutional workspace</span></span></Link>
      <div className="workspace-label"><span className="workspace-monogram"><Icon name="shield" size={18} /></span><span>{role === 'admin' ? 'Administration' : role === 'student' ? 'Student workspace' : 'Faculty workspace'}<small>KARYA · Operations</small></span></div>
      <nav aria-label="Role Navigation" className="sidebar-nav">
        <p className="nav-caption">WORKSPACE</p>
        {navigation[role]?.map(item => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}><Icon name={item.icon} /><span>{item.label}</span></NavLink>)}
        <p className="nav-caption secondary-caption">PERSONAL</p>
        <NavLink to="/notifications" className="sidebar-link"><Icon name="bell" /><span>Notifications</span>{unreadCount > 0 && <span className="nav-count">{unreadCount}</span>}</NavLink>
        <NavLink to="/account" className="sidebar-link"><Icon name="user" /><span>My account</span></NavLink>
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><Icon name="shield" /><strong>Every step, accounted for.</strong><p>Clear ownership. Human decisions. A traceable process.</p></div><Link to="/account" className="sidebar-profile"><span className="avatar">{initials}</span><span><strong>{user.name.replace(/\s*\([^)]*\)/g, '')}</strong><small>{role === 'admin' ? 'Administrator' : role === 'student' ? 'Student' : 'Reviewer'}</small></span><Icon name="chevron" size={16} /></Link></div>
    </aside>
    <header className="workspace-topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{pageName}</strong></div><div className="topbar-actions"><span className="today-label">{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())}</span><Link to="/notifications" className="icon-button" aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}><Icon name="bell" />{unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}</Link><Link to="/account" className="avatar avatar-small" aria-label={`${initials} Account settings`}>{initials}</Link></div></header>
  </>;
}
