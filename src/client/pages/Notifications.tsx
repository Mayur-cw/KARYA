import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ErrorMessage } from '../components/ErrorMessage';
import { EmptyState } from '../components/EmptyState';
import { api } from '../api';
import { fetchCollection } from '../collections';

interface NotificationItem {
  id: string;
  recipientId: string;
  eventType: string;
  title: string;
  body: string;
  targetRef: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

export default function Notifications() {
  const { user, refreshUnreadCount } = useAuth();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // EL-107 Filter unread notices
  const [filterMode, setFilterMode] = useState<'all' | 'unread' | 'read'>('all');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadNotifications = useCallback(async () => {
    try {
      setErrorMsg(null);
      const url = filterMode === 'unread' ? '/api/notifications?unread=true' : '/api/notifications';
      const data = await fetchCollection<NotificationItem>(url);
      setNotifications(data);
      setUnreadCount(data.filter(item => !item.readAt).length);
      if (refreshUnreadCount) refreshUnreadCount();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterMode, refreshUnreadCount]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // EL-108 Refresh notifications
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    showToast('Notifications refreshed');
  };

  // EL-112 Mark notification as read
  const handleMarkAsRead = async (notifId: string) => {
    try {
      setErrorMsg(null);
      await api(`/api/notifications/${notifId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'read' }),
      });

      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      if (refreshUnreadCount) refreshUnreadCount();
      showToast('Notification marked as read');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update notification');
    }
  };

  // EL-113 Dismiss notification
  const handleDismiss = async (notifId: string) => {
    try {
      setErrorMsg(null);
      await api(`/api/notifications/${notifId}`, {
        method: 'DELETE',
      });

      setNotifications((prev) => prev.filter((n) => n.id !== notifId));
      if (refreshUnreadCount) refreshUnreadCount();
      showToast('Notification dismissed from inbox');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to dismiss notification');
    }
  };

  // Filter items in client if filterMode is 'read'
  const displayedNotifications = notifications.filter((n) => {
    if (filterMode === 'read') return Boolean(n.readAt);
    if (filterMode === 'unread') return !n.readAt;
    return true;
  });

  // Target link generator
  const getTargetLink = (targetRef: string | null) => {
    if (!targetRef) return null;

    if (user?.role === 'student') {
      if (targetRef.startsWith('wf-') || targetRef.includes('workflow')) {
        return `/student/workflows/${targetRef}`;
      }
      return `/student/submissions/${targetRef}`;
    }

    if (user?.role === 'reviewer') {
      return `/reviewer/submissions/${targetRef}`;
    }

    if (user?.role === 'admin') {
      return `/admin/workflows/${targetRef}/monitor`;
    }

    return null;
  };

  return (
    <div className="notifications-page" data-testid="page-p-014" style={{ maxWidth: '960px', margin: '0 auto' }}>
      {/* Top Header & Context */}
      <div
        className="card-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className="badge badge-in_review">Attention Queue</span>
            {unreadCount > 0 && (
              <span className="badge badge-warning" style={{ backgroundColor: 'var(--warning-light)', color: 'var(--warning)' }}>
                {unreadCount} Unread
              </span>
            )}
          </div>
          <h1>Notifications</h1>
          <p className="card-subtitle">
            Institutional alerts for assigned reviews, submission updates, revision requests, and administrative notifications.
          </p>
        </div>

        {/* Role-Specific Back Links (EL-114, EL-115, EL-116) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {user?.role === 'admin' && (
            <Link to="/admin" data-testid="EL-114" className="btn btn-secondary btn-sm">
              Admin Command Center
            </Link>
          )}

          {user?.role === 'student' && (
            <Link to="/student" data-testid="EL-115" className="btn btn-secondary btn-sm">
              Student Process Hub
            </Link>
          )}

          {user?.role === 'reviewer' && (
            <Link to="/reviewer" data-testid="EL-116" className="btn btn-secondary btn-sm">
              Reviewer Inbox
            </Link>
          )}

          <button
            type="button"
            data-testid="EL-108"
            className="btn btn-secondary btn-sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : '↻ Refresh'}
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
          title="Notification Notice"
          message={errorMsg}
          code="NOTIFICATIONS_ERROR"
          onRetry={handleRefresh}
          className="mb-4"
        />
      )}

      {/* Filter Bar (EL-107) */}
      <div
        className="card"
        style={{
          padding: '12px 20px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: 'var(--bg-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label htmlFor="filter-unread-select" className="form-label" style={{ marginBottom: 0, fontSize: '13px' }}>
            Filter Status:
          </label>
          <select
            id="filter-unread-select"
            data-testid="EL-107"
            className="form-select"
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as 'all' | 'unread' | 'read')}
            style={{ width: '160px', height: '36px', minHeight: '36px', padding: '4px 10px' }}
          >
            <option value="all">All ({notifications.length})</option>
            <option value="unread">Unread ({unreadCount})</option>
            <option value="read">Read Only</option>
          </select>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
          Showing {displayedNotifications.length} notification{displayedNotifications.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Notification Items List */}
      {loading ? (
        <LoadingSkeleton label="Loading your notifications..." lines={6} />
      ) : displayedNotifications.length === 0 ? (
        <EmptyState
          title="No notifications in your queue"
          description={
            filterMode !== 'all'
              ? 'No notifications match your selected filter criteria.'
              : 'You are all caught up! No institutional notices pending.'
          }
          actionLabel={filterMode !== 'all' ? 'Show All Notices' : undefined}
          onAction={() => setFilterMode('all')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {displayedNotifications.map((notif) => {
            const isUnread = !notif.readAt;
            const targetUrl = getTargetLink(notif.targetRef);

            return (
              <div
                key={notif.id}
                className="card"
                style={{
                  padding: '16px 20px',
                  borderLeft: isUnread ? '4px solid var(--primary)' : '1px solid var(--border-light)',
                  backgroundColor: isUnread ? 'var(--bg-white)' : 'var(--bg-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 300px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink-primary)' }}>
                      {notif.title}
                    </span>
                    {isUnread && (
                      <span className="badge badge-draft" style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)' }}>
                        New
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                      {new Date(notif.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <p style={{ fontSize: '14px', color: 'var(--ink-secondary)', marginBottom: '8px', lineHeight: 1.5 }}>
                    {notif.body}
                  </p>

                  {/* Target Navigation Link (EL-109, EL-110, EL-111) */}
                  {targetUrl && (
                    <div style={{ marginTop: '8px' }}>
                      {user?.role === 'student' && (
                        <Link
                          to={targetUrl}
                          data-testid="EL-109"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                        >
                          View Application Workspace
                        </Link>
                      )}

                      {user?.role === 'reviewer' && (
                        <Link
                          to={targetUrl}
                          data-testid="EL-110"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                        >
                          Open Review Workbench
                        </Link>
                      )}

                      {user?.role === 'admin' && (
                        <Link
                          to={targetUrl}
                          data-testid="EL-111"
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                        >
                          Inspect Process Monitor
                        </Link>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions: Mark read (EL-112) and Dismiss (EL-113) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isUnread && (
                    <button
                      type="button"
                      data-testid="EL-112"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleMarkAsRead(notif.id)}
                      title="Mark as read"
                    >
                      ✓ Mark Read
                    </button>
                  )}

                  <button
                    type="button"
                    data-testid="EL-113"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleDismiss(notif.id)}
                    title="Dismiss notice"
                    style={{ color: 'var(--ink-muted)' }}
                  >
                    ✕ Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
