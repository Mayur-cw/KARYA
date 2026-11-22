import React from 'react';

interface ErrorMessageProps {
  title?: string;
  message: string;
  code?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorMessage({
  title = 'An error occurred',
  message,
  code,
  onRetry,
  className = '',
}: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className={`alert alert-error ${className}`.trim()}
      style={{
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
        <span style={{ fontWeight: 700, fontSize: '15px' }}>{title}</span>
        {code && (
          <code
            style={{
              fontSize: '11px',
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(185, 28, 28, 0.1)',
              color: 'var(--danger)',
            }}
          >
            {code}
          </code>
        )}
      </div>
      <p style={{ margin: 0, color: 'var(--danger)', fontSize: '14px' }}>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn btn-secondary btn-sm"
          style={{
            marginTop: '4px',
            borderColor: 'var(--danger-border)',
            color: 'var(--danger)',
          }}
        >
          Try Again
        </button>
      )}
    </div>
  );
}
