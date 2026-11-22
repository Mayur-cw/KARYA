import React from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  className?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`card ${className}`.trim()}
      style={{
        textAlign: 'center',
        padding: '48px 24px',
        maxWidth: '540px',
        margin: '32px auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
      }}
      role="region"
      aria-label={title}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: 'var(--bg-subtle)',
          color: 'var(--ink-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          marginBottom: '8px',
        }}
        aria-hidden="true"
      >
        ∅
      </div>
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ink-primary)' }}>{title}</h3>
      <p style={{ fontSize: '14px', color: 'var(--ink-secondary)', maxWidth: '400px' }}>
        {description}
      </p>
      {actionLabel && (
        <div style={{ marginTop: '8px' }}>
          {actionHref ? (
            <a href={actionHref} className="btn btn-primary btn-sm">
              {actionLabel}
            </a>
          ) : (
            <button type="button" onClick={onAction} className="btn btn-primary btn-sm">
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
